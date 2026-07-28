/**
 * Bagian MURNI dari penyediaan perusahaan (issue #104) — tanpa Prisma, tanpa
 * `node:fs`, tanpa `server-only`.
 *
 * Dipisah karena tiga pemakainya berdiri di sisi yang berbeda: skema zod
 * (dipakai formulir DI PERAMBAN dan route handler), modul penyedia (server),
 * dan tesnya. Menaruh aturan nama di modul `server-only` akan memaksa formulir
 * menyalin ulang aturannya — dan salinan yang menyimpang diam-diam persis
 * kegagalan yang tidak boleh terjadi pada nama yang ikut masuk ke perintah SQL.
 */

/**
 * Awalan WAJIB untuk nama basis data perusahaan.
 *
 * Bukan sekadar kerapian penamaan — ini setengah dari pengamannya. Hak akses
 * pengguna basis data aplikasi dibatasi pola yang sama:
 *
 *   GRANT ALL PRIVILEGES ON `sai\_%`.* TO 'sai'@'%'
 *
 * Jadi meskipun ada celah yang membuat penyerang mengendalikan nama, ia tetap
 * tidak bisa menyentuh basis data di luar pola itu. Kode menegakkan sisi
 * satunya, dan keduanya harus tetap sejalan.
 */
export const COMPANY_DATABASE_PREFIX = "sai_";

export type ProvisionPhase = "validate" | "create_database" | "migrate" | "register" | "done";

export interface ProvisionEvent {
  phase: ProvisionPhase;
  /** Kalimat siap tampil — pemanggil tidak perlu memetakan apa pun. */
  message: string;
  /** Kemajuan 0–1 bila diketahui; tahap migration mengisinya per berkas. */
  progress?: number;
  detail?: string;
}

/** Slug: huruf kecil, angka, tanda hubung. Dipakai di URL dan pesan galat. */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Nama basis data dari slug.
 *
 * SANITASI DI SINI ADALAH PENGAMAN, BUKAN KOSMETIK: nama basis data tidak bisa
 * diparameterkan dalam `CREATE DATABASE`, jadi ia mau tak mau ikut sebagai teks
 * ke dalam SQL. Bentuknya karena itu dipaksa — hanya `[a-z0-9_]`, wajib
 * berawalan `sai_`.
 */
export function databaseNameForSlug(slug: string): string {
  const body = normalizeSlug(slug).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
  return `${COMPANY_DATABASE_PREFIX}${body}`.slice(0, 60);
}

/** Dilempar penyedia; `phase` dipakai UI untuk menandai langkah yang gagal. */
export class ProvisionError extends Error {
  constructor(
    message: string,
    readonly phase: ProvisionPhase
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

/**
 * Penjaga terakhir sebelum nama dipakai di SQL. Sengaja TERPISAH dari zod:
 * keamanannya tidak boleh bergantung pada pemanggil yang ingat memvalidasi.
 */
export function assertSafeDatabaseName(name: string): void {
  if (!name.startsWith(COMPANY_DATABASE_PREFIX)) {
    throw new ProvisionError(
      `Nama basis data harus berawalan "${COMPANY_DATABASE_PREFIX}" — hak akses aplikasi dibatasi pola itu.`,
      "validate"
    );
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new ProvisionError(
      "Nama basis data hanya boleh huruf kecil, angka, dan garis bawah.",
      "validate"
    );
  }
  if (name.length > 60) {
    throw new ProvisionError("Nama basis data terlalu panjang (maks 60 karakter).", "validate");
  }
}
