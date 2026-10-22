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
import type { DictionaryKey } from "@sai/core/i18n/dictionary";

/**
 * Awalan WAJIB untuk nama basis data perusahaan.
 *
 * Di masa MariaDB awalan ini juga menjadi pola hibah hak (`GRANT … ON
 * \`sai\_t%\`.*`). PostgreSQL tidak punya pembatasan pola nama — hak membuat
 * basis data adalah `CREATEDB` pada role, berlaku untuk nama apa pun — jadi
 * sejak penukaran KODE inilah satu-satunya yang menegakkan awalannya (nama
 * `sai_t{tenantId}_{slug}` sejak issue #153). Lihat docs/MULTI-COMPANY.md §3,
 * termasuk apa yang terjadi bila role-nya belum berhak (`42501`).
 */
export const COMPANY_DATABASE_PREFIX = "sai_";

/**
 * Batas keras panjang identifier PostgreSQL (`NAMEDATALEN - 1`) — bukan pilihan
 * kami. Sejak awalan tenant ikut di nama (issue #153) batas ini yang dijaga
 * eksplisit: nama turunan dipotong sampai muat, nama eksplisit ditolak bila
 * melewatinya.
 *
 * Sampai #636 angkanya 64 (batas MySQL). PostgreSQL MEMOTONG identifier yang
 * lebih panjang dengan sekadar NOTICE — basis data bernama 63 karakter, registry
 * mencatat 64, dan buku itu tak pernah bisa dibuka lagi. `@sai/db/server`
 * sudah menolak >63 lebih dulu; angka ini kini sepakat dengannya. Kolom registry
 * `database_name` tetap VARCHAR(64), cukup untuk keduanya.
 */
export const MAX_DATABASE_NAME_LENGTH = 63;

export type ProvisionPhase = "validate" | "create_database" | "migrate" | "register" | "done";

export interface ProvisionEvent {
  phase: ProvisionPhase;
  /** Kalimat siap tampil — pemanggil tidak perlu memetakan apa pun. */
  message: string;
  /** Kemajuan 0–1 bila diketahui; tahap migration mengisinya per berkas. */
  progress?: number;
  detail?: string;
  /**
   * Id perusahaan yang BARU LAHIR — hanya pada tahap `done` (issue #339).
   *
   * Ada di aliran ini karena pembuatnya butuh angka itu SEBELUM ia pindah
   * halaman: sesi menyimpan "PT mana yang sedang dibuka", dan satu-satunya
   * cara sah mengisinya adalah `update({ companyId })` yang keanggotaannya
   * diperiksa ulang di server (`lib/auth.ts`). Tanpa angkanya, formulir hanya
   * tahu slug — dan slug bukan yang diterima pemeriksaan itu.
   *
   * Opsional, dan pembacanya WAJIB memperlakukan ketiadaannya sebagai keadaan
   * normal: aliran ini juga dibaca kode yang lebih tua daripada baris ini.
   */
  companyId?: number;
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
 * Pemotongan ke 63 memotong EKOR (bagian slug), tidak pernah awalannya — id
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
 *    satu server PostgreSQL, tidak peduli tenant. Untuk nama turunan ini tak
 *    pernah terjadi lintas tenant (id tenant ada di awalan); ia tinggal
 *    menjaga nama EKSPLISIT (jalur adopsi).
 *
 * Perbandingan memakai huruf kecil — warisan kolasi `utf8mb4_unicode_ci` masa
 * MariaDB; nama yang sah toh hanya huruf kecil (`assertSafeDatabaseName`).
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
  /** Pengguna basis datanya tidak berhak — SQLSTATE PostgreSQL 42501 / 28P01 / 28000. */
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
 * "Tidak berhak" dari PostgreSQL, dikenali dari SQLSTATE-nya (`code` pada galat
 * driver `pg`) — bukan dari mencocokkan teks pesan (teks berubah antar versi
 * dan antar `lc_messages` server).
 *
 *  • **42501** `insufficient_privilege` — kredensialnya benar, tetapi role-nya
 *    tidak berhak (mis. `CREATE DATABASE` tanpa `CREATEDB`,
 *    docs/MULTI-COMPANY.md §3).
 *  • **28P01** `invalid_password` / **28000** `invalid_authorization_specification`
 *    — kredensialnya sendiri ditolak.
 *
 * Ketiganya berujung pada tindakan yang sama bagi yang menunggu di layar
 * ("hubungi administrator"), dan harus DIBEDAKAN dari kegagalan lain (nama
 * bentrok, koneksi putus) yang tindak lanjutnya lain sama sekali.
 *
 * Sampai #636 fungsi ini hanya mengenali nomor MariaDB 1044/1045, jadi sejak
 * penukaran 15 Okt penolakan hak di PostgreSQL jatuh ke pesan umum.
 */
const ACCESS_DENIED_SQLSTATE: ReadonlySet<string> = new Set(["42501", "28P01", "28000"]);

export function isAccessDeniedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown };
  return typeof candidate.code === "string" && ACCESS_DENIED_SQLSTATE.has(candidate.code);
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
        "batas identifier PostgreSQL).",
      "validate",
      { code: "database_name_invalid" }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PENYEDIAAN LEWAT ANTREAN (Okt 2026)
//
// Sejak `company.provision` dikerjakan `svc-worker` — bukan di dalam permintaan
// HTTP `app-customer` — tiga hal harus menyeberang lewat baris `jobs` di basis
// data kendali: TAHAP yang sedang berjalan, SEBAB kegagalan, dan apakah buku
// setengah jadi boleh DILANJUTKAN. Ketiganya murni dan teruji di sini, sebab
// pekerja (penulis) dan rute status (pembaca) hidup di proses yang berbeda dan
// satu-satunya yang mereka bagi adalah aturan di berkas ini.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Tahap → angka `jobs.progress` (0–100). Kolom itu satu-satunya kanal kemajuan
 * antrean, jadi TAHAP dikodekan sebagai rentang angka — bukan kolom baru yang
 * hanya dipakai satu `kind`. Rentang `migrate` 20–85 membawa pecahan berkas
 * migration yang sudah diterapkan.
 */
export const PROVISION_PROGRESS = {
  validate: 5,
  create_database: 15,
  migrateFrom: 20,
  migrateTo: 85,
  register: 92,
  done: 100,
} as const;

/** Angka kemajuan untuk satu peristiwa penyediaan. */
export function progressForEvent(event: Pick<ProvisionEvent, "phase" | "progress">): number {
  switch (event.phase) {
    case "validate":
      return PROVISION_PROGRESS.validate;
    case "create_database":
      return PROVISION_PROGRESS.create_database;
    case "migrate": {
      const f = Math.min(1, Math.max(0, event.progress ?? 0));
      return Math.round(
        PROVISION_PROGRESS.migrateFrom +
          (PROVISION_PROGRESS.migrateTo - PROVISION_PROGRESS.migrateFrom) * f
      );
    }
    case "register":
      return PROVISION_PROGRESS.register;
    case "done":
      return PROVISION_PROGRESS.done;
  }
}

/**
 * Kebalikan `progressForEvent`: tahap (dan pecahan migration) dari angka
 * `jobs.progress`. `0` = belum mulai (masih antre, atau baru diklaim).
 */
export function phaseFromProgress(progress: number): {
  phase: ProvisionPhase | null;
  migrateProgress?: number;
} {
  if (progress <= 0) return { phase: null };
  if (progress >= PROVISION_PROGRESS.done) return { phase: "done", migrateProgress: 1 };
  if (progress >= PROVISION_PROGRESS.register) return { phase: "register", migrateProgress: 1 };
  if (progress >= PROVISION_PROGRESS.migrateFrom) {
    const span = PROVISION_PROGRESS.migrateTo - PROVISION_PROGRESS.migrateFrom;
    return {
      phase: "migrate",
      migrateProgress: Math.min(1, (progress - PROVISION_PROGRESS.migrateFrom) / span),
    };
  }
  if (progress >= PROVISION_PROGRESS.create_database) return { phase: "create_database" };
  return { phase: "validate" };
}

/**
 * SEBAB kegagalan sebagai teks yang bisa diurai kembali.
 *
 * Pelari menulis `last_error` = `${name}: ${message}`; teks itu milik LOG dan
 * konsol operator, tidak pernah layar. Yang boleh menyeberang ke layar hanya
 * KODE-nya (lalu dikalimatkan kamus, `provisionErrorMessage`), jadi kode itu
 * ditanam dalam penanda yang bentuknya kita kendalikan: `[[provision {...}]]`.
 * `values` dibatasi ke string/angka pendek — slug, nama basis data, jumlah tabel.
 */
const PENANDA_GAGAL = /\[\[provision (\{[^\]]*\})\]\]/;

export function encodeProvisionFailure(error: ProvisionError): string {
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(error.values ?? {})) {
    if (typeof v === "number") values[k] = v;
    else values[k] = String(v).replace(/[[\]{}"\\]/g, "").slice(0, 80);
  }
  const json = JSON.stringify({ code: error.code ?? null, phase: error.phase, values });
  return `[[provision ${json}]] ${error.message}`;
}

export interface DecodedProvisionFailure {
  code: ProvisionErrorCode | null;
  phase: ProvisionPhase | null;
  values: Record<string, string | number>;
}

export function decodeProvisionFailure(lastError: string | null | undefined): DecodedProvisionFailure {
  const kosong: DecodedProvisionFailure = { code: null, phase: null, values: {} };
  const m = lastError ? PENANDA_GAGAL.exec(lastError) : null;
  if (!m) return kosong;
  try {
    const raw = JSON.parse(m[1]!) as { code?: unknown; phase?: unknown; values?: unknown };
    const code = (PROVISION_ERROR_CODES as readonly string[]).includes(String(raw.code))
      ? (raw.code as ProvisionErrorCode)
      : null;
    const phases: readonly string[] = ["validate", "create_database", "migrate", "register"];
    const phase = phases.includes(String(raw.phase)) ? (raw.phase as ProvisionPhase) : null;
    const values: Record<string, string | number> = {};
    if (raw.values && typeof raw.values === "object") {
      for (const [k, v] of Object.entries(raw.values as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number") values[k] = v;
      }
    }
    return { code, phase, values };
  } catch {
    return kosong;
  }
}

/**
 * Kunci dedupe satu penyediaan: NAMA BASIS DATA, bukan slug atau pengguna.
 * Nama basis data adalah ruang nama fisik server — dua pekerjaan aktif untuk
 * satu nama berarti dua `CREATE DATABASE`/migration yang saling tabrak di buku
 * yang sama. Klik ganda, dua tab, atau dua admin tenant yang sama-sama menekan
 * tombol berakhir di SATU pekerjaan.
 */
export function provisionDedupeKey(databaseName: string): string {
  return `company.provision:${databaseName}`;
}

/**
 * Tanda di `COMMENT ON DATABASE` selama buku disediakan dan BELUM terdaftar.
 *
 * Pengulangan hanya boleh MELANJUTKAN buku yang membawa tanda ini untuk
 * permintaan yang sama (tenant + slug). Tanpanya, "basis data sudah ada dan
 * berisi tabel" tidak bisa dibedakan dari buku PT yang dihapus dari registry
 * tetapi DISIMPAN (retensi UU KUP) — dan melanjutkannya berarti mendaftarkan
 * perusahaan baru di atas buku lama orang lain. Tanda dihapus SEBELUM registry
 * ditulis, jadi buku yang sudah pernah terdaftar tidak pernah membawanya.
 */
export function provisioningMarker(tenantId: number, slug: string): string {
  return `sai:provisioning t${tenantId} ${normalizeSlug(slug)}`;
}

/**
 * Dari migration ke-berapa sebuah buku setengah jadi boleh dilanjutkan.
 *
 * `null` = TIDAK boleh: ada migration yang menggantung, nama yang bukan milik
 * kita, urutan yang melompat, atau checksum yang berbeda (berkasnya berubah
 * sejak percobaan sebelumnya — buku itu dibangun dari skema lain). Yang
 * diterima hanya AWALAN yang persis dari daftar migration kita.
 */
export function resumeIndex(
  applied: ReadonlyArray<{ nama: string; checksum: string; selesai: boolean }>,
  ours: ReadonlyArray<{ nama: string; checksum: string }>
): number | null {
  if (applied.length > ours.length) return null;
  for (const [i, a] of applied.entries()) {
    const o = ours[i]!;
    if (!a.selesai || a.nama !== o.nama || a.checksum !== o.checksum) return null;
  }
  return applied.length;
}
