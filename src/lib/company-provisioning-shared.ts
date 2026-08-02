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

/**
 * Batas keras panjang identifier MySQL/MariaDB — bukan pilihan kami. Sejak
 * awalan tenant ikut di nama (issue #153) batas ini yang dijaga eksplisit:
 * nama turunan dipotong sampai muat, nama eksplisit ditolak bila melewatinya.
 * Kolom registry `database_name` juga VARCHAR(64), sengaja sama.
 */
export const MAX_DATABASE_NAME_LENGTH = 64;

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
 * Nama basis data dari slug + tenant pemiliknya: `sai_t{tenantId}_{slug}`.
 *
 * SANITASI DI SINI ADALAH PENGAMAN, BUKAN KOSMETIK: nama basis data tidak bisa
 * diparameterkan dalam `CREATE DATABASE`, jadi ia mau tak mau ikut sebagai teks
 * ke dalam SQL. Bentuknya karena itu dipaksa — hanya `[a-z0-9_]`, wajib
 * berawalan `sai_`.
 *
 * KENAPA `tenantId` IKUT DI NAMA (issue #153): sebelum ini nama diturunkan dari
 * teks pengguna saja, sehingga dua PELANGGAN BERBEDA yang memilih slug sama
 * bertabrakan di tingkat basis data — dan galat tabrakannya membocorkan slug
 * milik pelanggan lain. Dengan id tenant di awalan, tabrakan lintas tenant
 * mustahil SECARA STRUKTUR, bukan sekadar tercegah oleh pemeriksaan. Basis
 * data LAMA (`sai_dev`, `sai_cv_maju`, …) tidak diganti nama: registry
 * menyimpan `database_name` per perusahaan, jadi skema baru hanya berlaku
 * untuk penyediaan berikutnya.
 *
 * Pemotongan ke 64 memotong EKOR (bagian slug), tidak pernah awalannya — id
 * tenant selalu utuh, jadi keunikan lintas tenant tetap terjaga. Dalam
 * praktiknya tidak pernah terpotong: `sai_t` (5) + id (≤10 digit) + `_` (1)
 * + slug (≤40) = maksimal 56.
 */
export function databaseNameForSlug(slug: string, tenantId: number): string {
  const body = normalizeSlug(slug).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
  return `${COMPANY_DATABASE_PREFIX}t${tenantId}_${body}`.slice(0, MAX_DATABASE_NAME_LENGTH);
}

/**
 * Nama basis data yang DIPAKAI penyediaan: eksplisit bila disebut (jalur
 * adopsi pemasangan lama / administrator yang membuat basis datanya manual),
 * selainnya diturunkan dari slug + tenant. Satu tempat untuk aturan ini —
 * penyedia web dan skrip CLI tidak boleh punya versi masing-masing.
 */
export function resolveDatabaseName(
  tenantId: number,
  slug: string,
  explicit?: string | null
): string {
  return explicit?.trim() || databaseNameForSlug(slug, tenantId);
}

/**
 * Konflik nama yang MENGHALANGI sebuah klaim `(tenantId, slug, databaseName)`
 * — murni, dipakai penyedia web, skrip CLI, dan tesnya (issue #153).
 *
 * Aturannya dua, dan lingkupnya sengaja berbeda:
 *
 *  • `slug` hanya berbenturan DI DALAM TENANT PEMANGGIL. Slug milik tenant
 *    lain TIDAK ADA dari sudut pandang pemanggil — bukan "ada tapi ditolak",
 *    melainkan tak terlihat sama sekali: jawabannya (null) persis sama dengan
 *    slug yang bebas, sehingga tidak ada galat, status, maupun bentuk respons
 *    yang bisa dipakai menyisir slug pelanggan lain (kelas kebocoran yang sama
 *    dengan §4.4 docs/MULTI-TENANT.md pada username).
 *
 *  • `database` berbenturan GLOBAL: nama basis data adalah ruang nama fisik
 *    satu server MariaDB, tidak peduli tenant. Untuk nama turunan ini tak
 *    pernah terjadi lintas tenant (id tenant ada di awalan); ia tinggal
 *    menjaga nama EKSPLISIT (jalur adopsi).
 *
 * Perbandingan memakai huruf kecil — kolom registry berkolasi
 * `utf8mb4_unicode_ci`, jadi itulah perbandingan yang ditegakkan indeksnya.
 */
export function firstConflict(
  existing: ReadonlyArray<{ tenantId: number | null; slug: string; databaseName: string }>,
  claim: { tenantId: number; slug: string; databaseName: string }
): "slug" | "database" | null {
  const slug = claim.slug.toLowerCase();
  const databaseName = claim.databaseName.toLowerCase();
  for (const row of existing) {
    if (row.databaseName.toLowerCase() === databaseName) return "database";
    if (row.tenantId === claim.tenantId && row.slug.toLowerCase() === slug) return "slug";
  }
  return null;
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
  if (name.length > MAX_DATABASE_NAME_LENGTH) {
    throw new ProvisionError(
      `Nama basis data terlalu panjang (maks ${MAX_DATABASE_NAME_LENGTH} karakter — ` +
        "batas identifier MySQL/MariaDB).",
      "validate"
    );
  }
}
