/**
 * ENKRIPSI RAHASIA YANG TERSIMPAN (issue #169) — AES-256-GCM.
 *
 * ══ KENAPA MODUL INI ADA SAMA SEKALI ════════════════════════════════════════
 * Doktrin `scripts/operator-credential.ts` berlaku dan tetap berlaku:
 * kredensial hidup di ENVIRONMENT, tidak pernah di basis data mana pun. Issue
 * #169 MELONGGARKANNYA untuk SATU kredensial — kata sandi SMTP penyedia —
 * karena mengubah pengaturan surel lewat SSH bukan pekerjaan yang boleh
 * dituntut dari pemilik produk. Karena pelonggarannya disengaja, pengamannya
 * ditulis gamblang di sini, bukan disiratkan:
 *
 *   1. yang tersimpan HANYA sandi-teks (ciphertext) + IV + tag autentikasi;
 *      kata sandi mentah tidak pernah menyentuh disk basis data;
 *   2. kuncinya tetap di ENVIRONMENT (`SETTINGS_ENCRYPTION_KEY`) — dump basis
 *      data yang bocor tanpa env tidak membuka satu kata sandi pun;
 *   3. GAGAL-TERTUTUP: kunci hilang / panjangnya salah = penyimpanan DITOLAK,
 *      bukan disimpan mentah dan bukan dilewati diam-diam.
 *
 * ══ KENAPA GCM, BUKAN CBC ═══════════════════════════════════════════════════
 * GCM memberi autentikasi (tag): sandi-teks yang diubah orang di basis data
 * TIDAK akan terbuka menjadi kata sandi lain — ia gagal, berisik. CBC hanya
 * merahasiakan, tidak membuktikan keutuhan.
 *
 * MURNI: tanpa React/Prisma/next/`server-only` — dipakai server action, inti
 * pengirim surel (yang juga dimuat skrip di luar Next), dan tes.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Panjang kunci AES-256 dalam byte — 64 karakter heksadesimal di env. */
const KEY_BYTES = 32;
/** Panjang IV yang disarankan untuk GCM (96 bit). */
const IV_BYTES = 12;

const ALGORITHM = "aes-256-gcm";

/** Rahasia tersegel apa adanya seperti tersimpan di basis data (base64). */
export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Kunci enkripsi tidak ada / tidak layak. Dilempar, BUKAN dikembalikan diam-
 * diam sebagai `null`: pemanggil yang lupa memeriksa nilai balik akan menulis
 * kata sandi mentah; pemanggil yang lupa menangkap galat hanya akan gagal.
 */
export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

/**
 * Kunci 32 byte dari env. Bentuk yang diterima HANYA heksadesimal 64 karakter
 * — sengaja satu bentuk saja: "kunci yang kelihatan benar tapi ternyata teks
 * biasa" adalah cara paling mudah mendapat enkripsi yang lemah tanpa sadar.
 *
 * Buat kunci baru: `openssl rand -hex 32`.
 */
export function encryptionKey(raw: string | undefined = process.env.SETTINGS_ENCRYPTION_KEY): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new EncryptionKeyError(
      "SETTINGS_ENCRYPTION_KEY belum diset — kata sandi tidak bisa dienkripsi, jadi tidak disimpan sama sekali."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new EncryptionKeyError(
      "SETTINGS_ENCRYPTION_KEY harus 64 karakter heksadesimal (32 byte). Buat dengan: openssl rand -hex 32"
    );
  }
  return Buffer.from(value, "hex");
}

/** Apakah kunci enkripsi siap dipakai? Untuk layar yang perlu memberi tahu
 *  operator SEBELUM ia mengetik kata sandi, bukan sesudahnya. */
export function encryptionKeyAvailable(
  raw: string | undefined = process.env.SETTINGS_ENCRYPTION_KEY
): boolean {
  try {
    encryptionKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** Segel satu rahasia. IV BARU untuk setiap penyegelan — kunci yang sama
 *  dengan IV yang berulang adalah kebocoran, bukan penghematan. */
export function sealSecret(plain: string, key: Buffer = encryptionKey()): SealedSecret {
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError("Panjang kunci enkripsi salah — penyimpanan ditolak.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Buka rahasia tersegel. Melempar bila kunci salah, tag tidak cocok, atau
 * potongan segelnya tidak lengkap — ketiganya berarti "jangan pakai nilai
 * ini", bukan "pakai apa adanya".
 */
export function openSecret(sealed: SealedSecret, key: Buffer = encryptionKey()): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
