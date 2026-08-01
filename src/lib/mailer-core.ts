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
 * ══ BENTUKNYA: SATU ANTARMUKA, TRANSPORT DIPILIH ENVIRONMENT ════════════════
 * Pemakai hanya mengenal `sendMail(message)`. Transportnya:
 *
 *   MAIL_TRANSPORT=file  (BAWAAN) — surel DITANGKAP ke berkas
 *       `data/mail-outbox/<waktu>-<penerima>.eml`, tidak pernah meninggalkan
 *       mesin. Inilah mode pengembangan: AC issue #136 menuntut surel TIDAK
 *       PERNAH terkirim sungguhan di lingkungan pengembangan, dan berkas .eml
 *       bisa dibuka klien surel mana pun untuk memeriksa isinya.
 *
 *   MAIL_TRANSPORT=smtp — kirim lewat SMTP (nodemailer; penyedia Indonesia
 *       mana pun yang berbicara SMTP: Mailtrap/SES/Resend/Postmark/dsb.).
 *       Konfigurasi: SMTP_URL (mis. smtp://user:pass@smtp.host:587) + MAIL_FROM.
 *
 * Pengaman ganda: transport `smtp` hanya dihormati bila NODE_ENV=production.
 * Di luar itu ia jatuh ke `file` dengan peringatan — salah set satu variabel
 * environment di laptop tidak boleh mengirim surel percobaan ke alamat orang
 * sungguhan.
 *
 * ══ KENAPA NODEMAILER ═══════════════════════════════════════════════════════
 * Ia juga peer-dependency opsional next-auth (provider email bawaannya), jadi
 * satu pustaka melayani alur kustom ini sekaligus membuka jalan bila kelak
 * verifikasi ingin memakai mekanisme next-auth. Murni JS, tanpa binary.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MailMessage {
  to: string;
  subject: string;
  /** Isi teks polos — SELALU ada: klien tanpa HTML tetap terbaca. */
  text: string;
  html?: string;
}

export interface MailResult {
  transport: "file" | "smtp";
  /** Jalur berkas (transport file) atau id pesan SMTP. */
  detail: string;
}

/** Bisa dialihkan lewat env — tes menulis ke direktori sementaranya sendiri. */
function outboxDir(): string {
  return process.env.MAIL_OUTBOX_DIR ?? path.join(process.cwd(), "data", "mail-outbox");
}

function fromAddress(): string {
  return process.env.MAIL_FROM ?? "SAI Accounting <no-reply@localhost>";
}

/** Transport efektif — `smtp` menuntut produksi DAN SMTP_URL. */
function resolveTransport(): "file" | "smtp" {
  const requested = process.env.MAIL_TRANSPORT ?? "file";
  if (requested !== "smtp") return "file";
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[mailer] MAIL_TRANSPORT=smtp diabaikan di luar produksi — surel ditangkap ke berkas."
    );
    return "file";
  }
  if (!process.env.SMTP_URL) {
    console.warn("[mailer] MAIL_TRANSPORT=smtp tanpa SMTP_URL — surel ditangkap ke berkas.");
    return "file";
  }
  return "smtp";
}

/** Nama berkas aman dari alamat penerima. */
function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.@_-]/g, "_").slice(0, 80);
}

async function sendToFile(message: MailMessage): Promise<MailResult> {
  const dir = outboxDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${safeName(message.to)}.eml`);

  // RFC 5322 sederhana — cukup untuk dibuka klien surel / dibaca mata.
  const eml =
    `From: ${fromAddress()}\r\n` +
    `To: ${message.to}\r\n` +
    `Subject: ${message.subject}\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    message.text;

  await writeFile(file, eml, "utf8");
  return { transport: "file", detail: file };
}

async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  // Impor dinamis: jalur file (pengembangan, tes) tidak perlu memuat
  // nodemailer sama sekali.
  const { createTransport } = await import("nodemailer");
  const transporter = createTransport(process.env.SMTP_URL);
  const info = await transporter.sendMail({
    from: fromAddress(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { transport: "smtp", detail: info.messageId };
}

/**
 * Kirim satu surel lewat transport efektif.
 *
 * Pemanggil TIDAK menangani perbedaan transport — alur atur-ulang kata sandi
 * sama persis di laptop dan di produksi; yang berbeda hanya ke mana byte-nya
 * pergi.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  return resolveTransport() === "smtp" ? sendViaSmtp(message) : sendToFile(message);
}
