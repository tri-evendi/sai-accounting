/**
 * PINDAH SaaS → ON-PREMISE — aturan MURNI bundel serah-terima.
 * Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md. Skrip: `tenant:export-onprem`,
 * `tenant:import-onprem`.
 *
 * Semua yang MEMUTUSKAN ada di sini (manifes, penolakan, saran lisensi, kode
 * baris JSON); yang MENJALANKAN (pg_dump, openssl, tar, Prisma) ada di skrip.
 * Pembagian yang sama dengan `tenant-move.ts`: keputusan yang salah di jalur
 * ini adalah buku customer yang hilang atau tertimpa, jadi ia harus bisa
 * diuji tanpa basis data.
 *
 * ══ BENTUK BUNDEL ═══════════════════════════════════════════════════════════
 * Satu berkas `<tenant>-onprem-<yyyymmdd>.saibundle` =
 *   `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt` atas sebuah tar:
 *     manifest.json            versi, kepala migration, jumlah, checksum
 *     control.json             baris kendali tenant ini (TERMASUK hash bcrypt)
 *     secrets.json             rahasia yang dibuka dari SETTINGS_ENCRYPTION_KEY
 *                              SaaS — disegel ulang dengan kunci TUJUAN saat impor
 *     companies/<db>.pgdump    `pg_dump -Fc` per buku PT
 *     documents/<id>/<uuid>.*  berkas dokumen per PT
 * Format sandinya SAMA dengan arsip cadangan (`scripts/backup.sh`, `svc-integrator`):
 * satu format, satu cara membuka di keadaan darurat — `openssl` biasa.
 * Kunci SaaS TIDAK PERNAH ikut: yang ikut adalah nilai rahasianya, di dalam
 * bundel bersandi, dan sandi bundel tidak pernah ditulis ke berkas mana pun.
 */
import { randomInt } from "node:crypto";

export const BUNDLE_FORMAT = "sai-onprem-bundle";
export const BUNDLE_FORMAT_VERSION = 1;
export const BUNDLE_EXTENSION = ".saibundle";

/** Env pembawa sandi bundel — alternatif prompt tersembunyi (otomasi). */
export const PASSPHRASE_ENV = "SAI_BUNDLE_PASSPHRASE";
export const PASSPHRASE_MIN_LENGTH = 20;

/** Argumen `openssl` — SAMA dengan `backup.sh` (`LabelEnkripsi` di Go). */
export const BUNDLE_CIPHER_ARGS = [
  "enc",
  "-aes-256-cbc",
  "-pbkdf2",
  "-iter",
  "200000",
  "-salt",
] as const;

/* ═══════════════════════ Kendali: ikut / tidak ikut ═══════════════════════ */

/**
 * SETIAP model basis data kendali, dengan keputusannya. Tes
 * (`tests/onprem-migration.test.ts`) mencocokkan daftar ini dengan
 * `model` di `packages/db/prisma/control/schema.prisma`: model baru yang tidak
 * diputuskan di sini membuat tes merah — tidak ada penghilangan diam-diam.
 * Alasannya ditulis di runbook (tabel "Yang ikut & yang tidak").
 */
export const CONTROL_MODEL_DECISIONS = {
  Tenant: "include",
  TenantMembership: "include",
  Company: "include",
  DbInstance: "exclude",
  User: "include",
  PasswordResetToken: "exclude",
  Invitation: "exclude",
  Registration: "exclude",
  TenantDeletionRequest: "exclude",
  RateLimitCounter: "exclude",
  Membership: "include",
  ApiToken: "exclude",
  Notification: "exclude",
  TenantSlugHistory: "exclude",
  TenantMailSetting: "include",
  TenantAuditLog: "include",
  OperatorAccount: "exclude",
  SchedulerRun: "exclude",
  ConformanceRun: "exclude",
  BackupRun: "exclude",
  /* Jejak fan-out migration buku SaaS — riwayat PEMASANGAN ini, bukan milik tenant. */
  SchemaMigrationRun: "exclude",
  Job: "exclude",
  RuntimeSample: "exclude",
} as const satisfies Record<string, "include" | "exclude">;

export type ControlModel = keyof typeof CONTROL_MODEL_DECISIONS;

/* ══════════════════════════════ Manifes ════════════════════════════════════ */

export interface MigrationHeads {
  control: string | null;
  company: string | null;
}

/** Neraca saldo ringkas: per kode akun, jumlah DEBIT & KREDIT dasar (IDR). */
export interface TrialBalanceDigest {
  rows: Array<[code: string, debit: string, credit: string]>;
  totalDebit: string;
  totalCredit: string;
}

export interface BundleCompany {
  id: number;
  slug: string;
  name: string;
  databaseName: string;
  isActive: boolean;
  isDemo: boolean;
  rowCounts: Record<string, number>;
  trialBalance: TrialBalanceDigest;
  documentFiles: number;
}

export interface LicenceSuggestion {
  planKey: string;
  companies: number;
  users: number;
  command: string;
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  formatVersion: number;
  createdAt: string;
  /** Versi aplikasi (`package.json`) yang membuat bundel. */
  appVersion: string;
  migrationHeads: MigrationHeads;
  tenant: {
    id: number;
    slug: string;
    name: string;
    planKey: string;
    status: string;
    maxCompanies: number;
    maxUsers: number;
  };
  companies: BundleCompany[];
  /** Jumlah baris per model kendali yang IKUT. */
  controlCounts: Record<string, number>;
  /** Jumlah baris milik tenant ini yang SENGAJA ditinggal — terlihat, bukan diam. */
  leftBehind: Record<string, number>;
  /** Jalur relatif → sha256, untuk SETIAP berkas selain manifes. */
  files: Record<string, string>;
  licence: LicenceSuggestion;
}

/* ════════════════════ Kode baris JSON (tanggal utuh) ═══════════════════════ */

const DATE_TAG = "$date";

/**
 * `JSON.stringify` yang menjaga `Date` sebagai `{"$date": iso}` — tanpa ini
 * tanggal pulang sebagai string dan Prisma menolaknya (atau, lebih buruk,
 * kolom teks menerimanya). `this[key]` dibaca sebelum `toJSON` Date berjalan.
 */
export function encodeRows(value: unknown): string {
  return JSON.stringify(
    value,
    function (this: Record<string, unknown>, key: string, v: unknown) {
      const raw = key === "" ? v : this[key];
      if (raw instanceof Date) return { [DATE_TAG]: raw.toISOString() };
      if (typeof raw === "bigint") {
        throw new Error(`BigInt di kolom ${key} — kode baris bundel belum mengenalnya`);
      }
      return v;
    },
    0
  );
}

export function decodeRows<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) => {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).length === 1 &&
      typeof (v as Record<string, unknown>)[DATE_TAG] === "string"
    ) {
      const d = new Date((v as Record<string, string>)[DATE_TAG]);
      if (Number.isNaN(d.getTime())) throw new Error(`tanggal rusak di bundel: ${JSON.stringify(v)}`);
      return d;
    }
    return v;
  }) as T;
}

/* ═════════════════════════════ Sandi bundel ═══════════════════════════════ */

/* Tanpa 0/O/1/I/L — dibacakan lewat telepon tanpa salah dengar. */
const PASSPHRASE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Sandi acak: 6 kelompok × 5 huruf dari 31 simbol ≈ 148 bit. Dicetak SEKALI ke
 * terminal operator, tidak pernah ditulis ke berkas: sandi yang tinggal di
 * sebelah bundelnya bukan sandi.
 */
export function generatePassphrase(): string {
  const groups: string[] = [];
  for (let g = 0; g < 6; g++) {
    let s = "";
    for (let i = 0; i < 5; i++) s += PASSPHRASE_ALPHABET[randomInt(PASSPHRASE_ALPHABET.length)];
    groups.push(s);
  }
  return groups.join("-");
}

export function passphraseProblem(p: string | null | undefined): string | null {
  if (!p) return "sandi bundel kosong";
  if (p.length < PASSPHRASE_MIN_LENGTH) {
    return `sandi bundel minimal ${PASSPHRASE_MIN_LENGTH} karakter — isinya hash kata sandi dan rahasia SMTP`;
  }
  return null;
}

export function bundleFileName(tenantSlug: string, now: Date): string {
  // Stempel UTC: nama berkas teknis untuk operator/pemindahan, bukan tanggal bisnis.
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${tenantSlug}-onprem-${stamp}${BUNDLE_EXTENSION}`;
}

/* ════════════════════════════ Saran lisensi ═══════════════════════════════ */

/** Kutip satu argumen shell dengan aman (tanda kutip tunggal). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Batas lisensi = MAKS(pemakaian sekarang, batas paket). Pemakaian sekarang
 * karena lisensi yang lebih sempit dari isi bukunya langsung "melebihi batas"
 * di hari pertama; batas paket karena customer membayar hak itu di SaaS dan
 * pindah rumah tidak boleh diam-diam mempersempitnya. Modul `all`: paket SaaS
 * tidak membatasi modul (`entitlementFromPlan`).
 */
export function licenceSuggestion(input: {
  customer: string;
  planKey: string;
  maxCompanies: number;
  maxUsers: number;
  companyCount: number;
  userCount: number;
  appVersion: string;
}): LicenceSuggestion {
  const companies = Math.max(1, input.companyCount, input.maxCompanies);
  const users = Math.max(1, input.userCount, input.maxUsers);
  const command =
    "bun run licence:issue -- --kunci <privat.pem> " +
    `--customer ${shellQuote(input.customer)} --perusahaan ${companies} --pengguna ${users} ` +
    "--modul all --dukungan-sampai <YYYY-MM-DD>" +
    ` --keluar ./licence.sai`;
  return { planKey: input.planKey, companies, users, command };
}

/* ══════════════════════════ Neraca saldo ringkas ══════════════════════════ */

export function trialBalanceMismatches(a: TrialBalanceDigest, b: TrialBalanceDigest): string[] {
  const out: string[] = [];
  if (a.totalDebit !== b.totalDebit) out.push(`total debit ${a.totalDebit} ≠ ${b.totalDebit}`);
  if (a.totalCredit !== b.totalCredit) out.push(`total kredit ${a.totalCredit} ≠ ${b.totalCredit}`);
  const mapA = new Map(a.rows.map(([code, d, c]) => [code, `${d}/${c}`]));
  const mapB = new Map(b.rows.map(([code, d, c]) => [code, `${d}/${c}`]));
  for (const code of [...new Set([...mapA.keys(), ...mapB.keys()])].sort()) {
    if (mapA.get(code) !== mapB.get(code)) {
      out.push(`akun ${code}: ${mapA.get(code) ?? "—"} ≠ ${mapB.get(code) ?? "—"}`);
    }
  }
  return out;
}

/* ═════════════════════════════ Kepala migration ═══════════════════════════ */

/**
 * Bandingkan kepala migration bundel dengan yang DIHARAPKAN kode yang sedang
 * berjalan. Selisih = versi aplikasi berbeda: baris kendali & dump buku
 * berbentuk skema versi asal, dan memasangnya ke skema lain gagal di tengah —
 * atau, lebih buruk, berhasil dengan kolom yang hilang.
 */
export function headMismatches(bundle: MigrationHeads, expected: MigrationHeads): string[] {
  const out: string[] = [];
  for (const plane of ["control", "company"] as const) {
    if (bundle[plane] !== expected[plane]) {
      out.push(`${plane}: bundel ${bundle[plane] ?? "—"}, pemasangan ini ${expected[plane] ?? "—"}`);
    }
  }
  return out;
}

/* ════════════════════════════ Penolakan ekspor ════════════════════════════ */

export interface ExportFacts {
  tenantFound: boolean;
  tenantStatus: string | null;
  companies: Array<{ slug: string; databaseName: string; head: string | null; reachable: boolean }>;
  controlHead: string | null;
  expectedHeads: MigrationHeads;
  /** SETTINGS_ENCRYPTION_KEY ada & sah, ATAU tidak ada rahasia yang perlu dibuka. */
  secretsReadable: boolean;
}

export interface Refusal {
  code: string;
  message: string;
}

export function exportRefusals(f: ExportFacts): Refusal[] {
  const out: Refusal[] = [];
  if (!f.tenantFound) return [{ code: "tenant_not_found", message: "tenant tidak ditemukan" }];
  if (f.tenantStatus === "migrated_out") {
    out.push({ code: "migrated_out", message: "tenant sudah berstatus migrated_out" });
  }
  if (f.companies.length === 0) {
    out.push({ code: "no_companies", message: "tenant tidak punya satu pun perusahaan — tidak ada buku untuk dibawa" });
  }
  if (f.controlHead !== f.expectedHeads.control) {
    out.push({
      code: "control_head",
      message:
        `basis data kendali di ${f.controlHead ?? "—"}, kode di ${f.expectedHeads.control ?? "—"} — ` +
        "jalankan db:migrate:all dulu",
    });
  }
  for (const c of f.companies) {
    if (!c.reachable) {
      out.push({ code: "company_unreachable", message: `buku ${c.slug} (${c.databaseName}) tidak terjangkau` });
    } else if (c.head !== f.expectedHeads.company) {
      out.push({
        code: "company_head",
        message:
          `buku ${c.slug} di ${c.head ?? "—"}, kode di ${f.expectedHeads.company ?? "—"} — ` +
          "jalankan db:migrate:all dulu",
      });
    }
  }
  if (!f.secretsReadable) {
    out.push({
      code: "secrets_unreadable",
      message:
        "ada rahasia tersegel (sandi SMTP / server key pembayaran) tetapi SETTINGS_ENCRYPTION_KEY " +
        "tidak ada atau tidak membukanya — bundel tanpa rahasia itu akan diam-diam mematikan fiturnya",
    });
  }
  return out;
}

/* ════════════════════════════ Penolakan impor ═════════════════════════════ */

export interface ImportFacts {
  manifest: Pick<BundleManifest, "format" | "formatVersion" | "appVersion" | "migrationHeads">;
  /** Kepala yang dibawa kode di image ini (`MIGRATION_TERAKHIR`). */
  expectedHeads: MigrationHeads;
  /** Kepala basis data kendali TUJUAN — harus sudah = kode (migrate sudah jalan). */
  targetControlHead: string | null;
  /** Jumlah baris tabel kendali yang HARUS kosong di pemasangan baru. */
  targetCounts: { tenants: number; users: number; companies: number; memberships: number; tenantMemberships: number };
  /** Basis data buku yang sudah ADA di server tujuan (dengan tabel). */
  existingDatabases: string[];
  /** Direktori dokumen tujuan yang sudah berisi untuk id PT bundel. */
  occupiedDocumentDirs: number[];
  /** `false` = bundel membawa dokumen tetapi direktori dokumen tujuan tidak
   *  bisa ditulis (mis. volume terpasang `:ro` di image `backup`). */
  documentsWritable: boolean;
  checksumProblems: string[];
  secretsPresent: boolean;
  encryptionKeyAvailable: boolean;
}

export function importRefusals(f: ImportFacts): Refusal[] {
  const out: Refusal[] = [];
  if (f.manifest.format !== BUNDLE_FORMAT || f.manifest.formatVersion !== BUNDLE_FORMAT_VERSION) {
    return [
      {
        code: "format",
        message: `bukan bundel ${BUNDLE_FORMAT} v${BUNDLE_FORMAT_VERSION} (ditemukan ${f.manifest.format} v${f.manifest.formatVersion})`,
      },
    ];
  }
  for (const p of f.checksumProblems) out.push({ code: "checksum", message: p });

  const heads = headMismatches(f.manifest.migrationHeads, f.expectedHeads);
  if (heads.length > 0) {
    out.push({
      code: "version",
      message:
        `versi aplikasi berbeda (${heads.join("; ")}). Pasang rilis SAI ${f.manifest.appVersion} ` +
        `(SAI_TAG=${f.manifest.appVersion}) — versi yang membuat bundel ini — lalu ulangi.`,
    });
  }
  if (f.targetControlHead !== f.expectedHeads.control) {
    out.push({
      code: "target_not_migrated",
      message:
        `basis data kendali tujuan di ${f.targetControlHead ?? "— (belum dimigrasi)"}, ` +
        `kode di ${f.expectedHeads.control ?? "—"} — jalankan layanan \`migrate\` dulu`,
    });
  }
  const occupied = Object.entries(f.targetCounts).filter(([, n]) => n > 0);
  if (occupied.length > 0) {
    out.push({
      code: "target_not_empty",
      message:
        `pemasangan tujuan TIDAK kosong (${occupied.map(([t, n]) => `${t}=${n}`).join(", ")}). ` +
        "Impor hanya untuk pemasangan BARU tanpa `bootstrap` — id pengguna & perusahaan dibawa " +
        "apa adanya karena buku besar merujuknya.",
    });
  }
  for (const db of f.existingDatabases) {
    out.push({ code: "database_exists", message: `basis data ${db} sudah ada dan berisi tabel di server tujuan` });
  }
  for (const id of f.occupiedDocumentDirs) {
    out.push({ code: "documents_exist", message: `direktori dokumen data/documents/${id} sudah berisi berkas` });
  }
  if (!f.documentsWritable) {
    out.push({
      code: "documents_readonly",
      message:
        "direktori dokumen tujuan tidak bisa ditulis — pasang volume dokumen TANPA `:ro` " +
        "(`-v <proyek>_documents:/app/data/documents`, lihat runbook)",
    });
  }
  if (f.secretsPresent && !f.encryptionKeyAvailable) {
    out.push({
      code: "encryption_key",
      message:
        "bundel membawa rahasia (sandi SMTP / server key pembayaran) tetapi SETTINGS_ENCRYPTION_KEY " +
        "pemasangan ini belum diset atau tidak sah — buat dengan `openssl rand -hex 32`, isi .env, ulangi",
    });
  }
  return out;
}

/**
 * Bandingkan daftar berkas yang DIUMUMKAN manifes dengan yang ADA (beserta
 * sidik jarinya). Berkas tak diumumkan juga ditolak: bundel adalah daftar
 * tertutup, dan berkas selundupan di dalam arsip bersandi tetap selundupan.
 */
export function checksumProblems(
  declared: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>
): string[] {
  const out: string[] = [];
  for (const [path, sum] of Object.entries(declared)) {
    if (!(path in actual)) out.push(`${path}: diumumkan manifes tetapi tidak ada`);
    else if (actual[path] !== sum) out.push(`${path}: sidik jari tidak cocok`);
  }
  for (const path of Object.keys(actual)) {
    if (!(path in declared)) out.push(`${path}: tidak diumumkan manifes`);
  }
  return out.sort();
}

/** Jalur di dalam bundel yang boleh ada — dipakai sebelum menulis berkas apa pun. */
const SAFE_BUNDLE_PATH =
  /^(manifest\.json|control\.json|secrets\.json|companies\/[A-Za-z0-9_]{1,64}\.pgdump|documents\/[1-9][0-9]{0,9}\/[0-9a-f-]{36}\.[a-z0-9]{1,8})$/;

export function isSafeBundlePath(path: string): boolean {
  return SAFE_BUNDLE_PATH.test(path);
}
