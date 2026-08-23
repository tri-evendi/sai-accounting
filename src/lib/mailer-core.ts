/**
 * INTI pengirim surel — TANPA `server-only` (issue #140): penjadwal
 * (`scripts/subscription-scheduler.ts`) berjalan lewat tsx di luar Next dan
 * tidak bisa memuat modul `server-only`; kode aplikasi tetap mengimpor
 * `@/lib/mailer` (yang membungkus modul ini DENGAN `server-only`).
 *
 * Infrastruktur PENGIRIM SUREL (issue #136) — sebelum ini tidak ada satu pun
 * pustaka surel di package.json, dan setiap alur yang menuntut surel
 * (atur-ulang kata sandi, kelak verifikasi & undangan #138/#139) mustahil.
 *
 * ══ BENTUKNYA: SATU ANTARMUKA, TRANSPORT DIPILIH KONFIGURASI ════════════════
 * Pemakai hanya mengenal `sendMail(message)`. Transportnya:
 *
 *   file  (BAWAAN) — surel DITANGKAP ke berkas
 *       `data/mail-outbox/<waktu>-<penerima>.eml`, tidak pernah meninggalkan
 *       mesin. Inilah mode pengembangan: AC issue #136 menuntut surel TIDAK
 *       PERNAH terkirim sungguhan di lingkungan pengembangan, dan berkas .eml
 *       bisa dibuka klien surel mana pun untuk memeriksa isinya.
 *
 *   smtp — kirim lewat SMTP (nodemailer; penyedia Indonesia mana pun yang
 *       berbicara SMTP: Mailtrap/SES/Resend/Postmark/dsb.).
 *
 * ══ URUTAN SUMBER (issue #169): BASIS DATA → ENVIRONMENT → `file` ═══════════
 * Sejak #169 pengaturan surel bisa diubah dari konsol operator TANPA SSH, dan
 * pengaturan itu tinggal di `sai_platform` (`lib/mail-settings.ts`). Urutannya
 * — dan ketiganya penting:
 *
 *   1. BASIS DATA. Ada baris `mail_settings` → dialah kebenarannya.
 *   2. ENVIRONMENT. Tidak ada baris, ATAU `sai_platform` tak terjangkau →
 *      `MAIL_TRANSPORT` + `SMTP_URL` + `MAIL_FROM` seperti sebelum #169.
 *      Inilah doktrin "penagihan mati ≠ aplikasi mati" yang berlaku juga di
 *      sini: basis data penagihan yang tumbang TIDAK BOLEH mematikan undangan
 *      staf dan atur-ulang kata sandi selama env masih terisi.
 *   3. `file`. Keduanya kosong → surel ditangkap ke berkas, tidak hilang
 *      tanpa jejak.
 *
 * Pengaman ganda yang LAMA tetap berdiri, apa pun sumbernya: transport `smtp`
 * hanya dihormati bila NODE_ENV=production. Di luar itu ia jatuh ke `file`
 * dengan peringatan — salah set satu variabel environment (atau satu baris
 * basis data yang tersalin dari produksi) di laptop tidak boleh mengirim surel
 * percobaan ke alamat orang sungguhan.
 *
 * ══ KENAPA NODEMAILER ═══════════════════════════════════════════════════════
 * Ia juga peer-dependency opsional next-auth (provider email bawaannya), jadi
 * satu pustaka melayani alur kustom ini sekaligus membuka jalan bila kelak
 * verifikasi ingin memakai mekanisme next-auth. Murni JS, tanpa binary.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  cachedMailSettings,
  normalizeTransport,
  storedMailPassword,
  type MailSettingsClient,
  type MailSettingsRow,
  type MailTransport,
} from "@/lib/mail-settings";

/**
 * Lampiran (issue #465) — dipakai jalur "kirim faktur ke pelanggan".
 *
 * `content` adalah byte mentah, bukan jalur berkas: PDF faktur dirender di
 * memori dan tidak pernah menyentuh cakram, jadi tidak ada berkas sementara
 * yang bisa tertinggal atau terbaca orang lain di kotak yang sama.
 */
export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Isi teks polos — SELALU ada: klien tanpa HTML tetap terbaca. */
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  /**
   * Surel ini membawa TOKEN AKSES — jangan pernah disalin ke alamat arsip.
   *
   * Atur-ulang kata sandi, undangan, verifikasi pendaftaran, dan permintaan
   * penghapusan tenant semuanya memuat tautan sekali-pakai yang MEMBUKA akun.
   * Kotak arsip yang memuatnya berarti siapa pun yang bisa membacanya dapat
   * mengambil alih akun mana pun — dan "hanya pemilik yang membacanya" adalah
   * asumsi tentang kotak surel pihak ketiga yang tidak bisa dijamin kode ini.
   *
   * Bawaannya `false` — DAN ITU DISENGAJA: surel biasa memang layak diarsipkan,
   * dan penanda yang harus diingat untuk MENYALAKAN pengarsipan akan membuat
   * arsipnya bolong tanpa ada yang tahu. Yang perlu diingat justru pengecualian,
   * dan pengecualiannya sedikit serta terdaftar di `tests/mail-archive.test.ts`.
   */
  sensitive?: boolean;
}

export interface MailResult {
  transport: "file" | "smtp";
  /** Jalur berkas (transport file) atau id pesan SMTP. */
  detail: string;
}

/** Dari mana konfigurasi yang benar-benar dipakai berasal. */
export type MailConfigSource = "database" | "env" | "default";

export interface MailConfig {
  /** Transport EFEKTIF — sudah memperhitungkan pengaman non-produksi. */
  transport: MailTransport;
  /** Transport yang DIMINTA sumbernya, sebelum pengaman. */
  requestedTransport: MailTransport;
  source: MailConfigSource;
  from: string;
  /** Salinan senyap (BCC) setiap surel TIDAK sensitif; `null` = tidak ada. */
  archiveAddress: string | null;
  /** Jalur env: URL SMTP apa adanya. Jalur basis data: `null`. */
  smtpUrl: string | null;
  /** Jalur basis data: bagian-bagiannya. Jalur env: `null`. */
  smtp: {
    host: string;
    port: number;
    /** 465 = TLS implisit; selain itu STARTTLS — turunan port, bukan kolom
     *  sendiri: satu isian yang bisa salah lebih sedikit. */
    secure: boolean;
    user: string | null;
    pass: string | null;
  } | null;
}

/**
 * Alamat arsip dari env — jalan cadangan ketika baris pengaturan belum ada.
 * Kolom basis data tetap yang menang bila terisi (operator bisa mengubahnya
 * tanpa rilis).
 */
function envArchiveAddress(): string | null {
  const raw = process.env.MAIL_ARCHIVE_BCC?.trim();
  return raw ? raw : null;
}

/** Bisa dialihkan lewat env — tes menulis ke direktori sementaranya sendiri. */
function outboxDir(): string {
  return process.env.MAIL_OUTBOX_DIR ?? path.join(process.cwd(), "data", "mail-outbox");
}

function envFromAddress(): string {
  return process.env.MAIL_FROM ?? "SAI Accounting <no-reply@localhost>";
}

/** Pengaman non-produksi — satu tempat, dipakai sumber mana pun. */
function guardNonProduction(requested: MailTransport, source: MailConfigSource): MailTransport {
  if (requested !== "smtp") return "file";
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[mailer] transport smtp (sumber: ${source}) diabaikan di luar produksi — surel ditangkap ke berkas.`
    );
    return "file";
  }
  return "smtp";
}

/** Konfigurasi dari SATU baris `mail_settings`, atau `null` bila barisnya tak
 *  layak pakai (smtp tanpa host — pengaturan setengah jadi bukan konfigurasi). */
function configFromRow(row: MailSettingsRow): MailConfig | null {
  const requested = normalizeTransport(row.transport);
  if (requested === "smtp" && !row.host) {
    console.warn("[mailer] mail_settings transport=smtp tanpa host — jatuh ke environment.");
    return null;
  }

  return {
    transport: guardNonProduction(requested, "database"),
    requestedTransport: requested,
    source: "database",
    from: row.fromAddress,
    archiveAddress: row.archiveAddress ?? envArchiveAddress(),
    smtpUrl: null,
    smtp:
      requested === "smtp"
        ? {
            host: row.host as string,
            port: row.port ?? 587,
            secure: (row.port ?? 587) === 465,
            user: row.username,
            pass: storedMailPassword(row),
          }
        : null,
  };
}

/** Konfigurasi dari environment — perilaku persis sebelum #169. */
function configFromEnv(): MailConfig {
  const requested: MailTransport = process.env.MAIL_TRANSPORT === "smtp" ? "smtp" : "file";
  const url = process.env.SMTP_URL;

  if (requested === "smtp" && !url) {
    console.warn("[mailer] MAIL_TRANSPORT=smtp tanpa SMTP_URL — surel ditangkap ke berkas.");
    return {
      transport: "file",
      requestedTransport: "file",
      source: "default",
      from: envFromAddress(),
      archiveAddress: envArchiveAddress(),
      smtpUrl: null,
      smtp: null,
    };
  }

  return {
    transport: guardNonProduction(requested, requested === "smtp" ? "env" : "default"),
    requestedTransport: requested,
    source: requested === "smtp" ? "env" : "default",
    from: envFromAddress(),
    archiveAddress: envArchiveAddress(),
    smtpUrl: url ?? null,
    smtp: null,
  };
}

/**
 * Konfigurasi EFEKTIF: basis data → environment → `file`.
 *
 * `client` hanya disuntikkan tes; pemanggil nyata membiarkannya kosong dan
 * mendapat `platformDb` lewat impor dinamis di `lib/mail-settings.ts`.
 */
export async function resolveMailConfig(client?: MailSettingsClient): Promise<MailConfig> {
  const row = await cachedMailSettings(client);
  if (row) {
    const fromDb = configFromRow(row);
    if (fromDb) return fromDb;
  }
  return configFromEnv();
}

/** Nama berkas aman dari alamat penerima. */
function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.@_-]/g, "_").slice(0, 80);
}

async function sendToFile(message: MailMessage, config: MailConfig): Promise<MailResult> {
  const dir = outboxDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${safeName(message.to)}.eml`);

  /*
   * Lampiran ditulis sebagai BERKAS TERSENDIRI di sebelah .eml, bukan
   * di-base64 ke dalam badan multipart-nya (issue #465).
   *
   * Transport ini ada untuk DIBACA MATA saat mengembangkan — dan PDF yang
   * dikodekan base64 sepanjang ratusan baris justru mengubur satu-satunya isi
   * yang ingin diperiksa orang: kalimat pengantarnya. Sebagai berkas terpisah
   * ia malah bisa dibuka langsung untuk memastikan kertasnya benar.
   */
  const attachmentNames: string[] = [];
  for (const [index, attachment] of (message.attachments ?? []).entries()) {
    const name = `${stamp}-${safeName(message.to)}-${index + 1}-${safeName(attachment.filename)}`;
    await writeFile(path.join(dir, name), attachment.content);
    attachmentNames.push(name);
  }

  // RFC 5322 sederhana — cukup untuk dibuka klien surel / dibaca mata.
  const eml =
    `From: ${config.from}\r\n` +
    `To: ${message.to}\r\n` +
    `Subject: ${message.subject}\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    (attachmentNames.length ? `X-Attachments: ${attachmentNames.join(", ")}\r\n` : "") +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    message.text;

  await writeFile(file, eml, "utf8");
  return { transport: "file", detail: file };
}

async function sendViaSmtp(message: MailMessage, config: MailConfig): Promise<MailResult> {
  // Impor dinamis: jalur file (pengembangan, tes) tidak perlu memuat
  // nodemailer sama sekali.
  const { createTransport } = await import("nodemailer");
  const transporter = config.smtp
    ? createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        /* Tanpa nama pengguna = relai yang mengautentikasi lewat IP; itu sah,
         * dan memaksa objek `auth` kosong justru membuat nodemailer gagal. */
        ...(config.smtp.user
          ? { auth: { user: config.smtp.user, pass: config.smtp.pass ?? "" } }
          : {}),
      })
    : createTransport(config.smtpUrl ?? undefined);

  /*
   * Salinan arsip dipasang DI SINI — satu tempat, sesudah setiap pengirim.
   * Menyerahkannya kepada pemanggil berarti tujuh pengirim yang masing-masing
   * bisa lupa, dan arsip yang bolong tanpa ada yang tahu.
   */
  const info = await transporter.sendMail({
    from: config.from,
    to: message.to,
    ...(archiveFor(message, config) ? { bcc: archiveFor(message, config)! } : {}),
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(message.attachments?.length
      ? {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            contentType: a.contentType,
          })),
        }
      : {}),
  });
  return { transport: "smtp", detail: info.messageId };
}

/**
 * Kirim satu surel lewat transport efektif.
 *
 * Pemanggil TIDAK menangani perbedaan transport — alur atur-ulang kata sandi
 * sama persis di laptop dan di produksi; yang berbeda hanya ke mana byte-nya
 * pergi. `config` boleh disuntikkan (uji kirim konsol operator sudah
 * memegang konfigurasinya; tidak perlu diselesaikan dua kali).
 */
/**
 * Alamat arsip yang BERLAKU untuk pesan ini — `null` bila tidak ada, atau bila
 * pesannya membawa token akses. Diekspor supaya aturannya bisa diuji tanpa
 * jaringan maupun basis data.
 */
export function archiveFor(message: MailMessage, config: MailConfig): string | null {
  if (message.sensitive) return null;
  return config.archiveAddress ?? null;
}

export async function sendMail(message: MailMessage, config?: MailConfig): Promise<MailResult> {
  const effective = config ?? (await resolveMailConfig());
  return effective.transport === "smtp"
    ? sendViaSmtp(message, effective)
    : sendToFile(message, effective);
}
