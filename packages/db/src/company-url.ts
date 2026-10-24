/**
 * PENYELESAI URL BASIS DATA PERUSAHAAN — satu-satunya tempat (rancangan 09 §9,
 * tahap 4: buku PT dipecah ke beberapa instans `db-postgres`).
 *
 * Sebelum tahap 4 rumus yang sama — "template dari env, ganti pathname dengan
 * `companies.database_name`" — ditulis ulang di delapan tempat: aplikasi,
 * fan-out migration, kesesuaian data, penyediaan, dan skrip-skrip cron. Selama
 * hanya ada satu server, delapan salinan itu sepakat dengan sendirinya. Begitu
 * ada server kedua, salinan yang lupa membaca `db_instance_key` akan membuka
 * basis data dengan NAMA YANG SAMA di server bawaan — salinan lama buku PT
 * yang sudah dipindah — dan menulis ke sana tanpa satu galat pun. Itulah
 * sebabnya rumusnya kini satu, dan `tests/company-url-resolver.test.ts`
 * menolak penyusun URL perusahaan di luar berkas ini.
 *
 * ══ TIGA ATURAN ═══════════════════════════════════════════════════════════
 *   1. `dbInstance === null` = instans BAWAAN, dan jawabannya PERSIS seperti
 *      sebelum tahap 4 (`COMPANY_DATABASE_URL_TEMPLATE` → `DATABASE_URL` →
 *      `CONTROL_DATABASE_URL`). Pemasangan satu server tidak berubah apa pun.
 *   2. Instans lain yang tidak bisa diselesaikan — kunci tak dikenal, nama env
 *      var di luar bentuknya, env var kosong — MELEMPAR. Tidak pernah jatuh ke
 *      bawaan: itu bahaya tulisan lintas-tenant yang sama dengan #104.
 *   3. Rahasia tidak pernah datang dari basis data. Baris `db_instances` hanya
 *      menyebut NAMA env var; nilainya dari environment proses.
 *
 * Murni: tanpa IO dan tanpa `server-only`, jadi skrip (tsx/bun), aplikasi, dan
 * tes memakai fungsi yang sama.
 */

import {
  DB_INSTANCE_URL_ENV_PREFIX,
  DB_INSTANCE_URL_ENV_SUFFIX,
  DEFAULT_DB_INSTANCE_LABEL,
  DB_INSTANCE_KEY_PATTERN,
  DB_INSTANCE_URL_ENV_PATTERN,
} from "./generated/db-instances";

/** Instans tambahan sebagaimana tercatat di `db_instances`. */
export interface DbInstanceRef {
  readonly key: string;
  readonly urlEnvVar: string;
}

/**
 * Yang dibutuhkan untuk membuka buku SATU perusahaan. `dbInstance` WAJIB
 * disebut — `null` pun harus ditulis — supaya tidak ada pemanggil yang sampai
 * ke instans bawaan karena lupa.
 */
export interface CompanyDatabaseTarget {
  readonly databaseName: string;
  readonly dbInstance: DbInstanceRef | null;
}

/*
 * Label instans bawaan, bentuk kunci (CHECK `db_instances_key_check`), dan
 * bentuk nama env var (CHECK `db_instances_url_env_var_check`) DIBANGKITKAN
 * dari `contract/db-instances.yaml`: jalur `tenant` Go membaca bentuk yang
 * sama untuk mencadangkan tiap instans, dan dua regex tulisan tangan yang
 * menyimpang membuat PT berjalan normal di aplikasi sementara bukunya TIDAK
 * dicadangkan.
 */
export { DEFAULT_DB_INSTANCE_LABEL, DB_INSTANCE_KEY_PATTERN, DB_INSTANCE_URL_ENV_PATTERN };

/** Nama basis data yang boleh ikut menyusun string koneksi. */
export const SAFE_DATABASE_NAME = /^[A-Za-z0-9_]{1,64}$/;

/** Dilempar setiap kali sebuah PT tidak bisa dipetakan ke servernya. */
export class DbInstanceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbInstanceResolutionError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Nama env var yang DISARANKAN untuk sebuah kunci — dipakai CLI saat
 * mendaftarkan instans dan oleh dokumen. Pohon Go mencerminkan rumus yang sama.
 */
export function suggestedUrlEnvVar(key: string): string {
  return `${DB_INSTANCE_URL_ENV_PREFIX}${key.toUpperCase()}${DB_INSTANCE_URL_ENV_SUFFIX}`;
}

/** Periksa bentuk sebuah baris `db_instances`; melempar bila menyimpang. */
export function assertDbInstanceRef(instance: DbInstanceRef): void {
  if (!DB_INSTANCE_KEY_PATTERN.test(instance.key) || instance.key === DEFAULT_DB_INSTANCE_LABEL) {
    throw new DbInstanceResolutionError(
      `Kunci instans basis data tidak sah: ${JSON.stringify(instance.key)}.`
    );
  }
  if (!DB_INSTANCE_URL_ENV_PATTERN.test(instance.urlEnvVar)) {
    throw new DbInstanceResolutionError(
      `Instans "${instance.key}" menunjuk env var ${JSON.stringify(instance.urlEnvVar)} — ` +
        "bentuk yang sah hanya COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE."
    );
  }
}

/** Template URL instans bawaan — rantai yang sama persis dengan sebelum tahap 4. */
function defaultTemplateRaw(env: Env): string {
  const raw =
    env.COMPANY_DATABASE_URL_TEMPLATE ?? env.DATABASE_URL ?? env.CONTROL_DATABASE_URL;
  if (!raw) {
    throw new DbInstanceResolutionError(
      "Tidak ada sumber kredensial basis data perusahaan. Set " +
        "COMPANY_DATABASE_URL_TEMPLATE (atau DATABASE_URL) di .env — nama basis " +
        "datanya sendiri diambil dari companies.database_name, bukan dari URL ini."
    );
  }
  return raw;
}

/**
 * Template URL sebuah instans: host, pengguna, dan sandi. Pathname-nya tidak
 * berarti apa-apa — diganti nama basis data PT oleh `companyDatabaseUrl`.
 */
export function instanceTemplateUrl(instance: DbInstanceRef | null, env: Env = process.env): URL {
  if (instance === null) return new URL(defaultTemplateRaw(env));
  assertDbInstanceRef(instance);
  const raw = env[instance.urlEnvVar];
  if (!raw) {
    throw new DbInstanceResolutionError(
      `Instans basis data "${instance.key}" terdaftar, tetapi ${instance.urlEnvVar} ` +
        "tidak diset di environment proses ini. Buku perusahaan di instans itu TIDAK dibuka " +
        "di server bawaan sebagai gantinya — di sana mungkin masih ada salinan lamanya."
    );
  }
  return new URL(raw);
}

/**
 * URL tingkat SERVER untuk penyediaan (`CREATE DATABASE`) dan pemindahan.
 *
 * Instans bawaan: `PROVISION_DATABASE_URL` → `CONTROL_DATABASE_URL`, sama seperti
 * sebelum tahap 4. Instans lain: template-nya sendiri — pengguna di URL itu
 * yang wajib berhak `CREATEDB` di server tersebut.
 */
export function instanceServerUrl(instance: DbInstanceRef | null, env: Env = process.env): URL {
  if (instance !== null) return instanceTemplateUrl(instance, env);
  const raw = env.PROVISION_DATABASE_URL ?? env.CONTROL_DATABASE_URL;
  if (!raw) {
    throw new DbInstanceResolutionError(
      "CONTROL_DATABASE_URL belum diset — tidak tahu di server mana basis data dibuat."
    );
  }
  return new URL(raw);
}

function assertSafeDatabaseName(databaseName: string): void {
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Nama basis data tidak sah: ${JSON.stringify(databaseName)}`);
  }
}

/** URL lengkap buku satu perusahaan. */
export function companyDatabaseUrl(target: CompanyDatabaseTarget, env: Env = process.env): string {
  assertSafeDatabaseName(target.databaseName);
  const url = instanceTemplateUrl(target.dbInstance, env);
  url.pathname = `/${target.databaseName}`;
  return url.toString();
}

/**
 * Sambungan MENTAH ke buku satu perusahaan — untuk `bukaBasisData(serverUrl,
 * databaseName)` di skrip dan konsol (pembaca `_prisma_migrations`, jangkar
 * retensi, penghapusan, pemindahan).
 *
 * Instans bawaan memakai `defaultServerUrl` bila pemanggil menyebutnya —
 * sebelum tahap 4 jalur-jalur itu menyambung dengan kredensial KENDALI, dan
 * perilaku itu dipertahankan apa adanya — atau `instanceServerUrl(null)`.
 * Instans lain selalu template-nya sendiri; `defaultServerUrl` TIDAK pernah
 * dipakai untuknya.
 */
export function companyServerConnection(
  target: CompanyDatabaseTarget,
  defaultServerUrl?: string,
  env: Env = process.env
): { serverUrl: string; databaseName: string } {
  assertSafeDatabaseName(target.databaseName);
  const serverUrl =
    target.dbInstance === null && defaultServerUrl
      ? defaultServerUrl
      : instanceServerUrl(target.dbInstance, env).toString();
  return { serverUrl, databaseName: target.databaseName };
}

/**
 * URL buku satu perusahaan di REPLIKA BACA instans bawaan (tahap 3,
 * `COMPANY_DATABASE_READ_URL_TEMPLATE`). PT di instans lain MELEMPAR: replika
 * itu standby server bawaan, dan yang ia pegang untuk PT yang sudah pindah
 * adalah salinan lamanya.
 */
export function companyReadReplicaUrl(target: CompanyDatabaseTarget, readTemplate: URL): string {
  if (target.dbInstance !== null) {
    throw new DbInstanceResolutionError(
      `Replika baca bawaan tidak melayani ${target.databaseName} (instans "${target.dbInstance.key}").`
    );
  }
  assertSafeDatabaseName(target.databaseName);
  const url = new URL(readTemplate.toString());
  url.pathname = `/${target.databaseName}`;
  return url.toString();
}

/**
 * Peran APLIKASI yang wajib DIHIBAHI hak atas buku baru di instans bawaan —
 * atau `null` bila tidak ada yang perlu dihibahkan (hak minimum, Okt 2026).
 *
 * Penyedia membuat basis data dengan kredensial PEMILIK
 * (`PROVISION_DATABASE_URL`), sedangkan aplikasi membukanya dengan kredensial
 * template. Bila keduanya peran yang SAMA — setiap pemasangan sebelum peralihan
 * hak minimum, dan setiap instans tambahan (template-nya sekaligus penyedianya)
 * — pemiliknya sudah berhak atas semuanya dan jawabannya `null`.
 *
 * `PG_APP_USER` menang bila diset: di container `migrate` template buku
 * SENGAJA ditimpa ke kredensial pemilik, jadi nama peran aplikasi tidak bisa
 * dibaca dari sana.
 */
export function appRoleForNewBook(instance: DbInstanceRef | null, env: Env = process.env): string | null {
  if (instance !== null) return null;
  const owner = decodeURIComponent(instanceServerUrl(null, env).username);
  const explicit = env.PG_APP_USER?.trim();
  const app = explicit || decodeURIComponent(instanceTemplateUrl(null, env).username);
  if (!app || app === owner) return null;
  return app;
}

/** Label instans untuk log dan laporan per instans. */
export function dbInstanceLabel(instance: DbInstanceRef | null): string {
  return instance?.key ?? DEFAULT_DB_INSTANCE_LABEL;
}

/**
 * Kunci kolam klien: instans + basis data. Nama basis data UNIK di registry,
 * tetapi selama pemindahan nama yang sama hidup di dua server — dan klien yang
 * dibuka ke salinan lama tidak boleh dipakai ulang untuk salinan baru.
 */
export function companyPoolKey(target: CompanyDatabaseTarget): string {
  return `${target.dbInstance?.key ?? ""}/${target.databaseName}`;
}

/**
 * Pilihan `select` Prisma (klien KENDALI) yang memuat semua yang dibutuhkan
 * penyelesai. Dipakai bersama `toCompanyDatabaseTarget` di setiap pembaca
 * `companies` yang akan membuka bukunya.
 */
export const COMPANY_DATABASE_TARGET_SELECT = {
  databaseName: true,
  dbInstanceKey: true,
  dbInstance: { select: { key: true, urlEnvVar: true } },
} as const;

/** Bentuk baris hasil `COMPANY_DATABASE_TARGET_SELECT`. */
export interface CompanyDatabaseRow {
  databaseName: string;
  dbInstanceKey: string | null;
  dbInstance: { key: string; urlEnvVar: string } | null;
}

/**
 * Baris registry → target. Melempar bila `db_instance_key` terisi tetapi
 * instansnya tidak ikut terbaca (pemanggil lupa memuat relasinya, atau
 * barisnya hilang) — keadaan yang tanpa pemeriksaan ini terbaca sebagai
 * "instans bawaan".
 */
export function toCompanyDatabaseTarget(row: CompanyDatabaseRow): CompanyDatabaseTarget {
  /* `undefined` = kolomnya tidak ikut di-SELECT. Itu BUKAN instans bawaan,
     dan diperlakukan sebagai bawaan justru bentuk bahaya yang modul ini cegah. */
  if ((row.dbInstanceKey as string | null | undefined) === undefined) {
    throw new DbInstanceResolutionError(
      `Baris ${row.databaseName} dibaca tanpa db_instance_key — pakai COMPANY_DATABASE_TARGET_SELECT.`
    );
  }
  if (row.dbInstanceKey === null) return { databaseName: row.databaseName, dbInstance: null };
  if (!row.dbInstance || row.dbInstance.key !== row.dbInstanceKey) {
    throw new DbInstanceResolutionError(
      `Basis data ${row.databaseName} tercatat di instans "${row.dbInstanceKey}", ` +
        "tetapi instans itu tidak dikenal (tidak ada di db_instances, atau tidak ikut dimuat)."
    );
  }
  const instance = { key: row.dbInstance.key, urlEnvVar: row.dbInstance.urlEnvVar };
  assertDbInstanceRef(instance);
  return { databaseName: row.databaseName, dbInstance: instance };
}

/**
 * Cari instans menurut kunci di daftar yang sudah dibaca dari `db_instances`.
 * `null`/`"default"` = bawaan. Kunci lain yang tak ada di daftar MELEMPAR.
 */
export function findDbInstance(
  key: string | null | undefined,
  instances: readonly DbInstanceRef[]
): DbInstanceRef | null {
  if (key == null || key === "" || key === DEFAULT_DB_INSTANCE_LABEL) return null;
  const found = instances.find((i) => i.key === key);
  if (!found) {
    throw new DbInstanceResolutionError(
      `Instans basis data "${key}" tidak dikenal. Yang terdaftar: ` +
        `${[DEFAULT_DB_INSTANCE_LABEL, ...instances.map((i) => i.key)].join(", ")}.`
    );
  }
  assertDbInstanceRef(found);
  return { key: found.key, urlEnvVar: found.urlEnvVar };
}
