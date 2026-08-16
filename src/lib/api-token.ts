/**
 * TOKEN API — pembuatan, pembacaan, dan pencocokannya (issue #389, F-10).
 *
 * ══ BENTUKNYA: `sai_<id>_<rahasia>` ════════════════════════════════════════
 * Tiga bagian, dan masing-masing punya tugas:
 *
 *   `sai_`     awalan yang bisa dikenali. Gunanya bukan kosmetik — pemindai
 *              rahasia (git-secrets, GitHub secret scanning) mencocokkan pola,
 *              dan token yang tidak berpola tidak akan pernah tertangkap saat
 *              seseorang menempelkannya ke repo publik.
 *   `<id>`     kunci baris. Dipakai MENCARI, bukan membuktikan.
 *   `<rahasia>` 32 byte acak. Inilah yang dibuktikan.
 *
 * Tanpa id di dalam token, setiap permintaan API harus memindai seluruh tabel
 * dan menghitung hash baris demi baris — biaya yang tumbuh seiring jumlah
 * token, untuk pekerjaan yang seharusnya satu lookup berindeks.
 *
 * ══ SHA-256, BUKAN bcrypt ══════════════════════════════════════════════════
 * bcrypt sengaja lambat, dan kelambatan itu berguna untuk satu hal: menahan
 * penebakan rahasia berentropi RENDAH, yaitu kata sandi buatan manusia.
 * Rahasia di sini 32 byte dari `randomBytes` — ruangnya 2^256, dan tidak ada
 * jumlah pelambatan yang membuat penebakan lebih mustahil daripada sudah
 * mustahil. Yang didapat dari memakai bcrypt hanyalah ~100 ms pada SETIAP
 * permintaan API.
 *
 * Perbandingannya tetap `timingSafeEqual`: hash-nya cepat, jadi selisih waktu
 * pada perbandingan string biasa benar-benar terukur dari luar.
 *
 * ══ MURNI ══════════════════════════════════════════════════════════════════
 * Tanpa Prisma dan tanpa `server-only`: pembuatan & pencocokan token adalah
 * aritmetika, dan seluruh aturannya bisa diuji tanpa basis data. Yang menyentuh
 * basis data adalah penjaganya (`lib/api-token-guard.ts`).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Awalan yang membuat token bisa dikenali pemindai rahasia. */
export const TOKEN_PREFIX = "sai";

/** Panjang rahasia dalam byte. 32 = 256 bit. */
const SECRET_BYTES = 32;

export interface NewToken {
  /** Token utuh — HANYA ada di sini, sekali. Tidak pernah tersimpan. */
  token: string;
  /** Yang disimpan di kolom `token_hash`. */
  hash: string;
}

/** SHA-256 heksadesimal. Selalu 64 karakter. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Terbitkan token untuk baris yang SUDAH punya id.
 *
 * Urutannya menuntut dua langkah di pemanggil (buat baris → terbitkan token →
 * simpan hash-nya), dan itu memang harganya: id harus ada di dalam token, dan
 * id baru ada sesudah barisnya lahir.
 */
export function issueToken(id: number): NewToken {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Id token tidak sah: ${String(id)}`);
  }
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { token: `${TOKEN_PREFIX}_${id}_${secret}`, hash: hashSecret(secret) };
}

export interface ParsedToken {
  id: number;
  secret: string;
}

/**
 * Urai token menjadi id + rahasia. `null` untuk apa pun yang bentuknya salah.
 *
 * Dipisah dari pencocokan supaya bentuk yang salah tidak pernah sampai ke
 * basis data: sebuah header `Authorization` berisi teks sembarang tidak boleh
 * menghasilkan satu kueri pun.
 */
export function parseToken(raw: string): ParsedToken | null {
  /*
   * Dipecah pada DUA garis bawah pertama saja, bukan `split("_")`.
   *
   * Alfabet base64url memuat `-` DAN `_`, jadi rahasianya sendiri bisa
   * mengandung pemisahnya. Versi pertama modul ini memakai `split("_")` dan
   * menuntut tepat tiga bagian — yang berarti kira-kira separuh token sah
   * DITOLAK, dan ditolaknya sebagai "bentuk salah" yang tidak bisa dibedakan
   * dari token palsu oleh siapa pun yang membaca lognya. Ditemukan tesnya
   * sendiri, bukan di produksi.
   */
  const trimmed = raw.trim();
  const first = trimmed.indexOf("_");
  if (first < 0) return null;
  const second = trimmed.indexOf("_", first + 1);
  if (second < 0) return null;

  const prefix = trimmed.slice(0, first);
  const rawId = trimmed.slice(first + 1, second);
  const secret = trimmed.slice(second + 1);

  if (prefix !== TOKEN_PREFIX) return null;
  if (!/^[1-9][0-9]{0,9}$/.test(rawId)) return null;
  // base64url: huruf, angka, `-`, `_`. 32 byte → 43 karakter.
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return null;
  return { id: Number(rawId), secret };
}

/**
 * Ambil token dari header `Authorization: Bearer …`.
 *
 * Skema `Bearer` dibaca TANPA peka huruf besar-kecil (RFC 7235 menyatakan
 * skema autentikasi memang tidak peka), sebab klien HTTP di alam bebas
 * menuliskannya `bearer`, `Bearer`, dan `BEARER` — dan menolak dua di antaranya
 * adalah penolakan yang tidak punya alasan keamanan apa pun.
 */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Cocokkan rahasia dengan hash tersimpan, tanpa membocorkan lewat waktu.
 *
 * `timingSafeEqual` melempar bila panjang keduanya berbeda — jadi panjangnya
 * disamakan lebih dulu dengan membandingkan hash (yang selalu 64 karakter),
 * bukan rahasianya.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const computed = Buffer.from(hashSecret(secret), "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

/**
 * Seberapa sering `last_used_at` ditulis ulang.
 *
 * Menulisnya pada SETIAP permintaan menjadikan satu integrasi yang menarik data
 * tiap detik sebagai satu UPDATE per detik ke basis data kendali — tabel yang
 * dipakai setiap autentikasi di seluruh aplikasi. Yang dibutuhkan pemiliknya
 * hanya "token ini masih dipakai atau tidak", dan satu menit menjawabnya sama
 * baiknya.
 */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/** `true` bila `last_used_at` sudah cukup basi untuk ditulis ulang. */
export function shouldWriteLastUsed(lastUsedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS;
}
