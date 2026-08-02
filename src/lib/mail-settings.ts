/**
 * PENGATURAN SUREL yang tersimpan di `sai_platform` (issue #169) — sumber
 * pertama konfigurasi pengirim surel, dengan environment sebagai CADANGAN.
 *
 * ══ TANPA `server-only`, DAN ITU DISENGAJA ══════════════════════════════════
 * Modul ini dipakai `lib/mailer-core.ts`, yang juga dimuat SKRIP di luar Next
 * (penjadwal langganan lewat tsx, #140). Menarik `server-only` ke sini akan
 * mematikan penjadwal. Sebagai gantinya modul ini tidak pernah menyentuh
 * `next/*` dan kliennya di-inject / diimpor DINAMIS.
 *
 * ══ PLATFORM MATI ≠ SUREL MATI (doktrin #137) ═══════════════════════════════
 * `sai_platform` adalah basis data PENAGIHAN; matinya tidak boleh berarti
 * undangan staf dan atur-ulang kata sandi ikut mati. Karena itu:
 *   • `platformDb` diimpor DINAMIS di dalam try — klien Prisma platform yang
 *     belum dibangkitkan pun tidak meruntuhkan jalur surel;
 *   • `cachedMailSettings()` MENELAN galat dan menjawab `null` = "tidak ada
 *     pengaturan tersimpan", yang bagi `mailer-core` berarti "pakai env";
 *   • `readMailSettings()` MELEMPAR — dipakai konsol operator, yang justru
 *     harus bisa membedakan "belum diatur" dari "basisnya tak terjangkau".
 *
 * ══ CACHE ══════════════════════════════════════════════════════════════════
 * Satu query per surel adalah pemborosan yang tidak perlu; cache TTL pendek
 * (bawaan 60 detik) sudah cukup, dan server action penyimpanan menjatuhkannya
 * seketika. Cache ini TIDAK dikunci per perusahaan/tenant — aturan cache #104
 * tidak berlaku di sini justru karena isinya bukan milik satu penyewa:
 * pengaturan surel adalah milik PENYEDIA, satu untuk seluruh pemasangan.
 *
 * ══ KATA SANDI ═════════════════════════════════════════════════════════════
 * Yang tersimpan hanya segel AES-256-GCM (`lib/settings-crypto.ts`). Kata
 * sandi mentah hanya pernah ada di dua tempat: isian form saat operator
 * mengetiknya, dan memori proses saat pesan dikirim. Ia tidak pernah keluar
 * lewat `mailSettingsView()`, tidak pernah masuk jejak audit, dan tidak
 * pernah ikut ke pesan galat.
 */

import {
  EncryptionKeyError,
  openSecret,
  sealSecret,
  type SealedSecret,
} from "@/lib/settings-crypto";

export type MailTransport = "file" | "smtp";

/** Baris `mail_settings` apa adanya — TERMASUK segel kata sandi. Internal. */
export interface MailSettingsRow {
  transport: string;
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string;
  passwordCiphertext: string | null;
  passwordIv: string | null;
  passwordTag: string | null;
  lastTestAt: Date | null;
  lastTestTo: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Bentuk klien Prisma yang dibutuhkan — struktural, bukan tipe generated:
 * tes memakai fake in-memory, skrip membangun kliennya sendiri, konsol
 * memakai `platformDb`.
 */
export interface MailSettingsClient {
  mailSetting: {
    findUnique(args: { where: { singleton: number } }): Promise<MailSettingsRow | null>;
    upsert(args: {
      where: { singleton: number };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    update(args: {
      where: { singleton: number };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/** Kunci singleton — selalu 1 (`singleton UNIQUE` di skema). */
const SINGLETON = 1;

/** Tampilan untuk LAYAR — tidak memuat satu byte pun kata sandi. */
export interface MailSettingsView {
  transport: MailTransport;
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string;
  /** Ada kata sandi tersimpan? Layar menampilkan `••••`, bukan nilainya. */
  hasPassword: boolean;
  lastTest: {
    at: Date;
    to: string | null;
    /** ok | error */
    status: string;
    message: string | null;
  } | null;
  updatedBy: string;
  updatedAt: Date;
}

/** Nilai `transport` dari basis data → union yang dikenal kode. Nilai asing
 *  (hasil sunting tangan) jatuh ke `file`: arah aman, bukan galat. */
export function normalizeTransport(value: string | null | undefined): MailTransport {
  return value === "smtp" ? "smtp" : "file";
}

export function mailSettingsView(row: MailSettingsRow): MailSettingsView {
  return {
    transport: normalizeTransport(row.transport),
    host: row.host,
    port: row.port,
    username: row.username,
    fromAddress: row.fromAddress,
    hasPassword: Boolean(row.passwordCiphertext && row.passwordIv && row.passwordTag),
    lastTest:
      row.lastTestAt && row.lastTestStatus
        ? {
            at: row.lastTestAt,
            to: row.lastTestTo,
            status: row.lastTestStatus,
            message: row.lastTestMessage,
          }
        : null,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

/**
 * Klien platform bawaan — impor DINAMIS supaya `mailer-core` (dan skrip yang
 * memuatnya) tidak menyeret klien Prisma platform ke dalam grafik impornya.
 */
async function defaultClient(): Promise<MailSettingsClient> {
  const mod = await import("@/lib/platform-db");
  return mod.platformDb as unknown as MailSettingsClient;
}

/**
 * Baca pengaturan tersimpan. MELEMPAR bila basisnya tak terjangkau — pemanggil
 * yang perlu membedakannya dari "belum diatur" (konsol operator) menangkapnya
 * sendiri.
 */
export async function readMailSettings(
  client?: MailSettingsClient
): Promise<MailSettingsRow | null> {
  const db = client ?? (await defaultClient());
  return db.mailSetting.findUnique({ where: { singleton: SINGLETON } });
}

/* ─────────────────────────────── Cache ──────────────────────────────────── */

const CACHE_TTL_MS = Number(process.env.MAIL_SETTINGS_CACHE_MS) || 60_000;

let cache: { row: MailSettingsRow | null; at: number } | null = null;

/** Jatuhkan cache — dipanggil server action setiap kali pengaturan disimpan. */
export function invalidateMailSettingsCache(): void {
  cache = null;
}

/**
 * Pengaturan tersimpan untuk JALUR KIRIM: ber-cache, dan MENELAN galat
 * (platform mati / belum disediakan / tabel belum dimigrasikan) menjadi
 * `null` — yang bagi `mailer-core` berarti "pakai environment".
 */
export async function cachedMailSettings(
  client?: MailSettingsClient
): Promise<MailSettingsRow | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.row;

  let row: MailSettingsRow | null = null;
  try {
    row = await readMailSettings(client);
  } catch (error) {
    /* Penagihan mati ≠ surel mati: kalimat di log, env yang mengambil alih. */
    console.warn(
      "[mail-settings] pengaturan surel tak terbaca dari sai_platform — jatuh ke environment:",
      error
    );
    row = null;
  }
  cache = { row, at: now };
  return row;
}

/* ───────────────────────────── Kata sandi ───────────────────────────────── */

/** Segel kata sandi dari baris, bila lengkap. */
function sealedFrom(row: MailSettingsRow): SealedSecret | null {
  if (!row.passwordCiphertext || !row.passwordIv || !row.passwordTag) return null;
  return { ciphertext: row.passwordCiphertext, iv: row.passwordIv, tag: row.passwordTag };
}

/**
 * Buka kata sandi tersimpan. Gagal membuka (kunci hilang, kunci berganti, tag
 * tidak cocok) → `null` + galat di log server, TIDAK melempar: pengirim surel
 * memperlakukannya sebagai "pengaturan basis data tidak bisa dipakai" dan
 * jatuh ke environment, alih-alih meruntuhkan pendaftaran pelanggan.
 */
export function storedMailPassword(row: MailSettingsRow): string | null {
  const sealed = sealedFrom(row);
  if (!sealed) return null;
  try {
    return openSecret(sealed);
  } catch (error) {
    console.error(
      "[mail-settings] kata sandi SMTP tersimpan tidak bisa dibuka " +
        "(SETTINGS_ENCRYPTION_KEY hilang atau berganti):",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Sensor kata sandi dari sebuah kalimat sebelum kalimat itu dipakai.
 *
 * Pesan galat SMTP disusun pustaka pihak ketiga dan berakhir di layar, di log,
 * dan di kolom `last_test_message`. Nodemailer memang tidak mencantumkan kata
 * sandi, tetapi "memang tidak" bukan jaminan — inilah jaringnya, dan harganya
 * satu `replaceAll`.
 */
export function redactSecret(text: string, secret: string | null | undefined): string {
  if (!secret) return text;
  return text.split(secret).join("••••");
}

/* ─────────────────────────────── Simpan ─────────────────────────────────── */

export interface SaveMailSettingsInput {
  transport: MailTransport;
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string;
  /** Kata sandi BARU. Kosong/undefined = pertahankan yang sudah tersimpan. */
  password?: string | null;
  /** true = hapus kata sandi tersimpan (relai tanpa autentikasi). */
  clearPassword?: boolean;
  /** Nama akun operator dari sesi konsol. */
  updatedBy: string;
}

export type SaveMailSettingsResult =
  | { outcome: "saved"; passwordChanged: boolean }
  /** GAGAL-TERTUTUP: tanpa kunci enkripsi yang layak, TIDAK ADA yang ditulis —
   *  bukan kata sandi mentah, dan bukan pengaturan tanpa kata sandinya. */
  | { outcome: "encryption_key_missing"; reason: string };

/**
 * Simpan pengaturan (singleton `upsert`).
 *
 * Kata sandi hanya disentuh bila operator memang mengetiknya: menyimpan tanpa
 * mengetik ulang MEMPERTAHANKAN kata sandi lama — layar hanya pernah melihat
 * `••••`, jadi "simpan" tidak boleh berarti "kosongkan".
 */
export async function saveMailSettings(
  deps: { platform: MailSettingsClient },
  input: SaveMailSettingsInput
): Promise<SaveMailSettingsResult> {
  const wantsNewPassword = Boolean(input.password && input.password.length > 0);

  let sealed: SealedSecret | null = null;
  if (wantsNewPassword) {
    try {
      sealed = sealSecret(input.password as string);
    } catch (error) {
      if (error instanceof EncryptionKeyError) {
        return { outcome: "encryption_key_missing", reason: error.message };
      }
      throw error;
    }
  }

  /* Tiga keadaan kata sandi: diganti (segel baru), dihapus (tiga kolom null),
   * atau DIBIARKAN (kolomnya tidak ikut dalam `update`). */
  const passwordFields = sealed
    ? {
        passwordCiphertext: sealed.ciphertext,
        passwordIv: sealed.iv,
        passwordTag: sealed.tag,
      }
    : input.clearPassword
      ? { passwordCiphertext: null, passwordIv: null, passwordTag: null }
      : {};

  const common = {
    transport: input.transport,
    host: input.host,
    port: input.port,
    username: input.username,
    fromAddress: input.fromAddress,
    updatedBy: input.updatedBy,
  };

  await deps.platform.mailSetting.upsert({
    where: { singleton: SINGLETON },
    create: {
      singleton: SINGLETON,
      ...common,
      passwordCiphertext: sealed?.ciphertext ?? null,
      passwordIv: sealed?.iv ?? null,
      passwordTag: sealed?.tag ?? null,
    },
    update: { ...common, ...passwordFields },
  });

  invalidateMailSettingsCache();
  return { outcome: "saved", passwordChanged: wantsNewPassword || Boolean(input.clearPassword) };
}

/**
 * Catat hasil UJI KIRIM terakhir. Hanya MEMPERBARUI baris yang sudah ada —
 * uji kirim atas konfigurasi environment (belum ada baris) tidak boleh
 * diam-diam melahirkan baris basis data yang lalu MENGALAHKAN environment itu.
 * Gagal mencatat tidak menggagalkan ujinya: ini laporan, bukan gerbang.
 */
export async function recordMailTestResult(
  deps: { platform: MailSettingsClient },
  input: { to: string; status: "ok" | "error"; message: string; at?: Date }
): Promise<void> {
  try {
    const existing = await deps.platform.mailSetting.findUnique({
      where: { singleton: SINGLETON },
    });
    if (!existing) return;
    await deps.platform.mailSetting.update({
      where: { singleton: SINGLETON },
      data: {
        lastTestAt: input.at ?? new Date(),
        lastTestTo: input.to.slice(0, 191),
        lastTestStatus: input.status,
        lastTestMessage: input.message.slice(0, 2000),
      },
    });
    invalidateMailSettingsCache();
  } catch (error) {
    console.error("[mail-settings] hasil uji kirim gagal dicatat:", error);
  }
}
