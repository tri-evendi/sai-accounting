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

/* Hanya TIPE — kamusnya sendiri tidak pernah ikut ke bundel mana pun. */
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Awalan WAJIB untuk nama basis data perusahaan.
 *
 * Bukan sekadar kerapian penamaan — ini setengah dari pengamannya. Hak akses
 * pengguna basis data aplikasi dibatasi pola yang sama; bentuk yang dianjurkan
 * hari ini menyempitkannya lagi ke basis data yang memang DIBUAT penyediaan
 * (`sai_t{tenantId}_{slug}`, issue #153):
 *
 *   GRANT CREATE, ALTER, DROP, INDEX, REFERENCES,
 *         SELECT, INSERT, UPDATE, DELETE
 *     ON `sai\_t%`.* TO 'sai'@'%'
 *
 * Jadi meskipun ada celah yang membuat penyerang mengendalikan nama, ia tetap
 * tidak bisa menyentuh basis data di luar pola itu. Kode menegakkan sisi
 * satunya, dan keduanya harus tetap sejalan — lihat docs/MULTI-COMPANY.md §3,
 * termasuk apa yang terjadi bila hibahnya belum pernah dijalankan (galat 1044).
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

/**
 * SEBAB kegagalan, sebagai nilai — bukan sebagai kalimat.
 *
 * Kenapa kode dan bukan pesan: yang menunggu di layar adalah pemilik PT, dan
 * pesan yang bisa ditolongnya harus berbahasa tugas DAN berbahasa dia (id/en/
 * zh). Kalimatnya karena itu hidup di kamus, bukan di modul ini; yang
 * menyeberang hanyalah kodenya. Pesan `Error.message` tetap ditulis — ia yang
 * dibaca skrip baris perintah (`scripts/create-company.ts`) dan log server.
 */
export const PROVISION_ERROR_CODES = [
  /** Pengguna basis datanya tidak berhak — galat MySQL/MariaDB 1044 / 1045. */
  "database_permission_denied",
  /** Alamat basis data kendali/penyedia belum diset di environment. */
  "config_missing",
  /** Slug sudah dipakai perusahaan lain di tenant yang sama. */
  "slug_taken",
  /** Nama basis data sudah terdaftar untuk perusahaan lain. */
  "database_taken",
  /** Basis datanya sudah ada DAN sudah berisi tabel — tidak ditimpa. */
  "database_not_empty",
  /** Nama basis data yang diminta melanggar aturan penamaan. */
  "database_name_invalid",
] as const;

export type ProvisionErrorCode = (typeof PROVISION_ERROR_CODES)[number];

/**
 * Dilempar penyedia; `phase` dipakai UI untuk menandai langkah yang gagal.
 *
 * `code` + `values` adalah bahan pesan berbahasa pengguna (lihat
 * `provisionErrorMessage`). Keduanya opsional supaya pemanggil lama tetap
 * sah, tetapi setiap lemparan di jalur web MEMILIKINYA — route handler tidak
 * pernah meneruskan `message` mentah ke layar.
 */
export class ProvisionError extends Error {
  readonly code?: ProvisionErrorCode;
  readonly values?: Record<string, string | number>;

  constructor(
    message: string,
    readonly phase: ProvisionPhase,
    options?: {
      code?: ProvisionErrorCode;
      values?: Record<string, string | number>;
      /** Galat aslinya — ikut ke log server, tidak pernah ke layar. */
      cause?: unknown;
    }
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProvisionError";
    this.code = options?.code;
    this.values = options?.values;
  }
}

/**
 * "Tidak berhak" dari MySQL/MariaDB, dikenali dari NOMORNYA — bukan dari
 * mencocokkan teks pesan (teks berubah antar versi dan antar bahasa server).
 *
 *  • **1044** `ER_DBACCESS_DENIED_ERROR` — kredensialnya benar, tetapi
 *    penggunanya tidak berhak atas basis data itu. Inilah yang terjadi ketika
 *    pengguna aplikasi tidak diberi hak `CREATE` pada pola nama basis data
 *    perusahaan (docs/MULTI-COMPANY.md §3) — terukur di produksi.
 *  • **1045** `ER_ACCESS_DENIED_ERROR` — kredensialnya sendiri ditolak.
 *
 * Keduanya berujung pada tindakan yang sama bagi yang menunggu di layar
 * ("hubungi administrator"), dan keduanya harus DIBEDAKAN dari kegagalan lain
 * (nama bentrok, koneksi putus) yang tindak lanjutnya lain sama sekali.
 */
const ACCESS_DENIED_ERRNO: ReadonlySet<number> = new Set([1044, 1045]);
const ACCESS_DENIED_CODES: ReadonlySet<string> = new Set([
  "ER_DBACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_ERROR",
]);

export function isAccessDeniedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { errno?: unknown; code?: unknown };
  if (typeof candidate.errno === "number" && ACCESS_DENIED_ERRNO.has(candidate.errno)) return true;
  return typeof candidate.code === "string" && ACCESS_DENIED_CODES.has(candidate.code);
}

/**
 * Kode → kunci kamus. Ditulis sebagai `Record` lengkap DENGAN SENGAJA: kode
 * baru yang lupa diberi kalimat ditolak `tsc`, bukan mendarat sebagai layar
 * kosong pada hari kegagalannya.
 */
const PESAN_PER_KODE: Record<ProvisionErrorCode, DictionaryKey> = {
  database_permission_denied: "companies.errPermissionDenied",
  config_missing: "companies.errConfigMissing",
  slug_taken: "companies.errSlugTaken",
  database_taken: "companies.errDatabaseTaken",
  database_not_empty: "companies.errDatabaseNotEmpty",
  database_name_invalid: "companies.errDatabaseNameInvalid",
};

/**
 * Kunci kamus + nilainya untuk sebuah kegagalan penyediaan — MURNI, jadi ia
 * bisa diuji tanpa basis data maupun permintaan HTTP.
 *
 * Apa pun yang tidak dikenali jatuh ke `companies.errFailed`. Itu keputusan
 * keamanan, bukan kemalasan: galat SQL mentah membawa nomor koneksi, SQLState,
 * pernyataan utuh, dan NAMA PENGGUNA BASIS DATA — tidak satu pun boleh
 * mendarat di layar pengguna. Yang perlu dibaca operator tetap lengkap di log
 * server (route handler mencatatnya beserta `cause`).
 */
export function provisionErrorMessage(error: unknown): {
  key: DictionaryKey;
  values?: Record<string, string | number>;
} {
  if (error instanceof ProvisionError && error.code) {
    return { key: PESAN_PER_KODE[error.code], values: error.values };
  }
  return { key: "companies.errFailed" };
}

/**
 * Penjaga terakhir sebelum nama dipakai di SQL. Sengaja TERPISAH dari zod:
 * keamanannya tidak boleh bergantung pada pemanggil yang ingat memvalidasi.
 */
export function assertSafeDatabaseName(name: string): void {
  if (!name.startsWith(COMPANY_DATABASE_PREFIX)) {
    throw new ProvisionError(
      `Nama basis data harus berawalan "${COMPANY_DATABASE_PREFIX}" — hak akses aplikasi dibatasi pola itu.`,
      "validate",
      { code: "database_name_invalid" }
    );
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new ProvisionError(
      "Nama basis data hanya boleh huruf kecil, angka, dan garis bawah.",
      "validate",
      { code: "database_name_invalid" }
    );
  }
  if (name.length > MAX_DATABASE_NAME_LENGTH) {
    throw new ProvisionError(
      `Nama basis data terlalu panjang (maks ${MAX_DATABASE_NAME_LENGTH} karakter — ` +
        "batas identifier MySQL/MariaDB).",
      "validate",
      { code: "database_name_invalid" }
    );
  }
}
