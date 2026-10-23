/**
 * BANGKITKAN KONTRAK LINTAS BAHASA (01 §10, Poliglot) — `contract/` → kode.
 *
 *   bun run contract:gen          # tulis berkas bangkitan
 *   bun run contract:gen -- --cek # GAGAL bila yang di disk tidak sinkron
 *
 * `--cek` dipakai gerbang: berkas bangkitan yang di-commit dalam keadaan basi
 * adalah bentuk penyimpangan yang paling sulit terlihat, sebab semuanya tetap
 * mengompilasi. Penjaga `tests/contract-jobs.test.ts` memanggil mode ini.
 *
 * ══ KENAPA DIBANGKITKAN, BUKAN DIBACA SAAT RUNTIME ═════════════════════════
 * Membaca YAML saat runtime berarti: satu pustaka pengurai di dalam image
 * produksi, satu berkas yang harus ada di tempat yang benar saat boot, dan
 * `kind` yang salah tulis baru berbunyi saat pekerjaan pertama diterbitkan.
 * Membangkitkan TypeScript memindahkan semua itu ke `tsc`: `kind` yang tidak
 * ada tidak mengompilasi, dan tidak ada apa pun yang perlu dibaca saat boot.
 * Alasan yang sama berlaku dua kali lebih keras untuk Go, yang binary-nya
 * statis dan sengaja tidak memuat pengurai YAML.
 *
 * ══ TIGA TUJUAN, SATU SUMBER (tahap 1b) ════════════════════════════════════
 * Sejak pelari KEDUA lahir dalam bahasa lain, generator ini menulis tiga
 * berkas dan bukan satu:
 *
 *   • packages/core/src/generated/job-kinds.ts    — kosakata, TypeScript
 *   • packages/core/src/generated/job-numbers.ts  — angka antrean, TypeScript
 *   • services/integrator/internal/contract/jobs_gen.go — keduanya, Go
 *
 * Tahap 1d menambah sumber kedua, `contract/accounting.yaml` (skala uang &
 * tipe akun — hanya yang punya pembaca Go, 09 §3.5), dan dua berkas lagi:
 *
 *   • packages/core/src/generated/accounting.ts
 *   • services/integrator/internal/contract/accounting_gen.go
 *
 * Tahap 4 menambah `contract/db-instances.yaml` (bentuk kunci & env var
 * instans basis data, awalan objek cadangan per instans):
 *
 *   • packages/db/src/generated/db-instances.ts
 *   • services/integrator/internal/contract/dbinstances_gen.go
 *
 * Angka dipisahkan dari kosakata karena pembacanya berbeda: kosakata dibaca
 * penerbit dan pelari, angka dibaca pelari dan permukaan kesehatan. Di Go
 * keduanya satu berkas, sebab satu paket Go memang satu unit impor.
 *
 * ══ YANG DITEGAKKAN DI SINI, BUKAN DI TES ══════════════════════════════════
 * Dua kelas kesalahan ditolak oleh generator, jadi kombinasi yang salah tidak
 * bisa LAHIR ke bahasa mana pun — bukan sekadar ditemukan sesudahnya:
 *
 *   1. `writes_ledger` di luar jalur `ledger` → pintu posting kedua (I-2);
 *   2. `upkeep_ms` yang tidak lebih rapat daripada ambang basi lease →
 *      pekerjaan dari pekerja yang mati menunggu satu putaran penuh LAGI.
 *
 * Bedanya penting: tes menangkap yang sudah tertulis di satu bahasa; generator
 * menangkapnya sebelum ada bahasa yang memuatnya.
 */
import { load } from "js-yaml";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { COMPANY_NAME } from "@sai/core/constants";
import { BUSINESS_TIME_ZONE } from "@sai/core/business-date";
import {
  BALANCE_SHEET_COLUMNS,
  BALANCE_SHEET_HEADERS,
  BALANCE_SHEET_PRINT_LABELS,
  CASH_FLOW_CATEGORY_LABELS,
  CASH_FLOW_COLUMNS,
  CASH_FLOW_HEADERS,
  CASH_FLOW_PRINT_LABELS,
  INCOME_STATEMENT_COLUMNS,
  INCOME_STATEMENT_HEADERS,
  INCOME_STATEMENT_PRINT_LABELS,
  SHEET_NAMES,
  STATEMENT_TITLES,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  TRIAL_BALANCE_PRINT_LABELS,
  STATEMENT_COMPARE_CHANGE_HEADER,
  asOfPeriodLabel,
  balanceSheetBalanceNote,
  cashFlowReconciliationNote,
  comparePercentText,
  type CashFlowCategoryId,
  comparePeriodLabel,
  costCenterPeriodSuffix,
  periodRangeLabel,
  trialBalanceBalanceNote,
} from "../src/lib/statement-layout";
import {
  BALANCE_SHEET_WIDTHS,
  CASH_FLOW_WIDTHS,
  COMPARE_CHANGE_WIDTH,
  IDR_NUMBER_FORMAT,
  INCOME_STATEMENT_WIDTHS,
  SHEET_BANNER_STYLE,
  TRIAL_BALANCE_WIDTHS,
  sheetPrintedLine,
  AGING_WIDTHS,
} from "../src/lib/report-export";
import { REPORT_ENGINES } from "../src/lib/report-engine";
import { REPORTS } from "../src/lib/report-catalog";
import {
  AGING_BUCKET_PRINT_LABELS,
  AGING_COLUMNS,
  AGING_SHEET_LABELS,
  AGING_UNDATED_NOTE,
  EXPORT_EMPTY,
  PARTY_RECAP_NO_PARTY,
  PAYMENT_STATUS_PRINT_LABELS,
  agingHeaders,
  agingIssueAgeText,
  payableDocumentNo,
  unresolvedNote,
  type AgingKind,
} from "../src/lib/statement-layout";
import {
  COST_CENTER_UNASSIGNED_PRINT_LABEL,
  UNASSIGNED_COST_CENTER,
  costCenterDisplayName,
} from "../src/lib/cost-centers";
import { COMPARISON_MODES } from "../src/lib/statement-compare";

const AKAR = process.cwd();
const SUMBER = join(AKAR, "contract", "kinds.yaml");
const TUJUAN_TS = join(AKAR, "packages", "core", "src", "generated", "job-kinds.ts");
const TUJUAN_ANGKA = join(AKAR, "packages", "core", "src", "generated", "job-numbers.ts");
const TUJUAN_GO = join(
  AKAR,
  "services",
  "integrator",
  "internal",
  "contract",
  "jobs_gen.go"
);

const SUMBER_AKUNTANSI = join(AKAR, "contract", "accounting.yaml");
const TUJUAN_AKUNTANSI_TS = join(AKAR, "packages", "core", "src", "generated", "accounting.ts");
const TUJUAN_AKUNTANSI_GO = join(
  AKAR,
  "services",
  "integrator",
  "internal",
  "contract",
  "accounting_gen.go"
);

/* Sumber KETIGA (tahap 1d): bukan YAML, melainkan modul TypeScript yang
   SUDAH menjadi sumber tunggal layar, PDF, dan lembar sebar. */
const TUJUAN_TATA_LETAK_GO = join(
  AKAR,
  "services",
  "integrator",
  "internal",
  "contract",
  "report_layout_gen.go"
);

/* Umur Piutang & Umur Utang (tahap 1d, `go-parity`): berkas TERSENDIRI, bukan
   bagian `report_layout_gen.go` — laporan berikutnya yang dipindah paralel
   menambah ke berkas itu, dan dua cabang yang menyunting satu fungsi
   pembangkit adalah konflik yang tidak perlu. Sumbernya sama: modul TS cetak. */
const TUJUAN_TATA_LETAK_UMUR_GO = join(
  AKAR,
  "services",
  "integrator",
  "internal",
  "contract",
  "aging_layout_gen.go"
);

const CEK = process.argv.includes("--cek");

interface Lane {
  description: string;
  single_instance: boolean;
  /** Pagar memori per pekerjaan (MiB heap Go); tanpa kunci = tanpa pagar. */
  memory_fence_mib?: number;
}
/** Butir kunci idempotensi denyut — SELALU UTC. */
const SCHEDULE_GRAINS = ["hour", "day"] as const;
/** Penerbit kind berjadwal: tepat satu bahasa. */
const SCHEDULE_PUBLISHERS = ["node", "go"] as const;
interface Schedule {
  grain: (typeof SCHEDULE_GRAINS)[number];
  per_company: boolean;
  publisher: (typeof SCHEDULE_PUBLISHERS)[number];
}
interface Kind {
  lane: string;
  max_attempts: number;
  description: string;
  writes_ledger?: boolean;
  schedule?: Schedule;
}
/** Setiap angka yang dibaca DUA bahasa. Semuanya bilangan bulat ≥ 1. */
interface Numbers {
  backoff_base_ms: number;
  backoff_max_ms: number;
  lease_renew_ms: number;
  lease_stale_factor: number;
  upkeep_ms: number;
  idle_ms: number;
  done_retention_days: number;
  queue_age_warn_seconds: number;
  queue_age_late_seconds: number;
  lane_lock_probe_ms: number;
  lane_lock_query_timeout_ms: number;
  lane_lock_idle_session_ms: number;
}
/** Pemilik berkas hasil di volume `hasil` — ditulis dua bahasa, dibaca `node`. */
interface Results {
  owner_uid: number;
  owner_gid: number;
}
interface Kontrak {
  version: number;
  statuses: string[];
  lanes: Record<string, Lane>;
  kinds: Record<string, Kind>;
  numbers: Numbers;
  results: Results;
}

const KUNCI_ANGKA: (keyof Numbers)[] = [
  "backoff_base_ms",
  "backoff_max_ms",
  "lease_renew_ms",
  "lease_stale_factor",
  "upkeep_ms",
  "idle_ms",
  "done_retention_days",
  "queue_age_warn_seconds",
  "queue_age_late_seconds",
  "lane_lock_probe_ms",
  "lane_lock_query_timeout_ms",
  "lane_lock_idle_session_ms",
];

function baca(): Kontrak {
  const k = load(readFileSync(SUMBER, "utf8")) as Kontrak;

  const salah: string[] = [];
  if (!Number.isInteger(k.version)) salah.push("`version` bukan bilangan bulat");
  if (!Array.isArray(k.statuses) || k.statuses.length === 0) salah.push("`statuses` kosong");

  for (const [nama, kind] of Object.entries(k.kinds ?? {})) {
    if (!k.lanes?.[kind.lane]) salah.push(`kind \`${nama}\` menunjuk jalur tak dikenal: ${kind.lane}`);
    if (!Number.isInteger(kind.max_attempts) || kind.max_attempts < 1) {
      salah.push(`kind \`${nama}\`: \`max_attempts\` harus bilangan bulat ≥ 1`);
    }
    /* Invarian I-2 ditegakkan di GENERATOR, bukan hanya di tes: `kind` yang
       menulis buku di luar jalur `ledger` adalah pintu posting kedua, dan
       rancangan §3.3 menutupnya di tingkat rancangan — jadi ia tidak boleh bisa
       lahir dari kontrak sama sekali. */
    if (kind.writes_ledger && kind.lane !== "ledger") {
      salah.push(
        `kind \`${nama}\` menulis buku besar di jalur \`${kind.lane}\` — ` +
          "hanya jalur `ledger` boleh (invarian I-2, pintu posting tunggal)"
      );
    }
    /* Kind berjadwal: penerbitnya TEPAT SATU bahasa, dan butirnya salah satu
       dari dua yang dimengerti kedua penerbit. Nilai asing ditolak DI SINI —
       penerbit yang tidak mengenali `publisher` akan mengira dirinya bukan
       penerbit, dan kind itu berhenti terbit tanpa satu galat pun. */
    const j = kind.schedule;
    if (j !== undefined) {
      if (kind.lane === "schedule") {
        salah.push(`kind \`${nama}\`: \`schedule:\` pada jalur \`schedule\` sendiri — denyut tidak menerbitkan dirinya lewat dirinya`);
      }
      if (!(SCHEDULE_GRAINS as readonly string[]).includes(j?.grain)) {
        salah.push(`kind \`${nama}\`: schedule.grain harus salah satu dari ${SCHEDULE_GRAINS.join("/")} (kini: ${String(j?.grain)})`);
      }
      if (typeof j?.per_company !== "boolean") {
        salah.push(`kind \`${nama}\`: schedule.per_company harus boolean`);
      }
      if (!(SCHEDULE_PUBLISHERS as readonly string[]).includes(j?.publisher)) {
        salah.push(
          `kind \`${nama}\`: schedule.publisher harus salah satu dari ${SCHEDULE_PUBLISHERS.join("/")} ` +
            `(kini: ${String(j?.publisher)}) — tepat SATU penerbit, tidak pernah dua`
        );
      }
    }
  }

  for (const [nama, lane] of Object.entries(k.lanes ?? {})) {
    const f = lane.memory_fence_mib;
    if (f !== undefined && (!Number.isInteger(f) || f < 64)) {
      salah.push(`jalur \`${nama}\`: memory_fence_mib harus bilangan bulat ≥ 64 (kini: ${String(f)})`);
    }
  }

  const n = k.numbers;
  if (n === undefined || n === null) {
    salah.push("`numbers` tidak ada — angka antrean wajib ada di kontrak sejak tahap 1b");
  } else {
    for (const kunci of KUNCI_ANGKA) {
      const v = n[kunci];
      if (!Number.isInteger(v) || v < 1) {
        salah.push(`numbers.${kunci} harus bilangan bulat ≥ 1 (kini: ${String(v)})`);
      }
    }
    /* Pasangan yang tidak konsisten ditolak DI SINI, karena di sinilah satu
       pemeriksaan melindungi kedua bahasa sekaligus. */
    if (n.backoff_base_ms > n.backoff_max_ms) {
      salah.push("numbers.backoff_base_ms melampaui backoff_max_ms — plafon di bawah dasarnya");
    }
    if (n.lease_stale_factor < 3) {
      salah.push(
        "numbers.lease_stale_factor < 3 — ambang basi harus memberi ruang untuk " +
          "beberapa pembaruan yang terlewat, bukan satu"
      );
    }
    const basi = n.lease_renew_ms * n.lease_stale_factor;
    if (n.upkeep_ms >= basi) {
      salah.push(
        `numbers.upkeep_ms (${n.upkeep_ms}) tidak lebih rapat daripada ambang basi lease ` +
          `(${basi} = lease_renew_ms × lease_stale_factor). Putaran pemeliharaan yang ` +
          "lebih jarang daripada ambang basi membuat pekerjaan dari pekerja yang mati " +
          "menunggu satu putaran penuh LAGI, dan waktu tunggu itu tidak muncul di satu pun angka."
      );
    }
    if (n.queue_age_warn_seconds >= n.queue_age_late_seconds) {
      salah.push(
        "numbers.queue_age_warn_seconds tidak di bawah queue_age_late_seconds — " +
          "ambang peringatan yang tidak pernah terlewat lebih dulu adalah ambang yang tak berarti"
      );
    }
    /* Pemegang pagar yang terisolasi wajib TAHU kuncinya hilang (denyut gagal
       paling lambat probe + query_timeout) SEBELUM server membuang sesinya dan
       membebaskan kunci untuk kandidat lain (idle_session). Urutan sebaliknya
       = dua pelari jalur tunggal-instans sekaligus, di kedua bahasa. */
    const tahu = n.lane_lock_probe_ms + n.lane_lock_query_timeout_ms;
    if (tahu >= n.lane_lock_idle_session_ms) {
      salah.push(
        `numbers.lane_lock_probe_ms + lane_lock_query_timeout_ms (${tahu}) tidak di bawah ` +
          `lane_lock_idle_session_ms (${n.lane_lock_idle_session_ms}) — pemegang pagar lama ` +
          "baru tahu kuncinya hilang SESUDAH kandidat lain bisa mengambilnya"
      );
    }
  }

  /* uid 0 DITOLAK: berkas hasil milik root adalah persis keadaan yang membuat
     `app-customer` (pengguna `node`) tidak bisa membacanya — alasan kunci ini
     ada sama sekali. */
  for (const kunci of ["owner_uid", "owner_gid"] as const) {
    const v = k.results?.[kunci];
    if (!Number.isInteger(v) || v < 1) {
      salah.push(`results.${kunci} harus bilangan bulat ≥ 1 (kini: ${String(v)})`);
    }
  }

  if (salah.length > 0) {
    console.error("✗ contract/kinds.yaml tidak sah:");
    for (const s of salah) console.error(`  • ${s}`);
    process.exit(1);
  }
  return k;
}

function union(nama: string, nilai: readonly string[]): string {
  return `export type ${nama} =\n${nilai.map((v) => `  | "${v}"`).join("\n")};`;
}

const JANGAN_SUNTING = (versi: number, perintah: string) => `DIBANGKITKAN DARI \`contract/kinds.yaml\` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan \`${perintah}\` setelah mengubah kontraknya, dan commit hasilnya
 * bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila berkas ini
 * basi, dan penjaga \`tests/contract-jobs.test.ts\` memanggilnya.
 *
 * Kontrak versi ${versi}.`;

function bangkitkan(k: Kontrak): string {
  const kinds = Object.keys(k.kinds).sort();
  const lanes = Object.keys(k.lanes).sort();

  const barisKind = kinds
    .map((nama) => {
      const d = k.kinds[nama]!;
      return (
        `  "${nama}": { lane: "${d.lane}", maxAttempts: ${d.max_attempts}` +
        `, writesLedger: ${d.writes_ledger === true} },`
      );
    })
    .join("\n");

  const barisLane = lanes
    .map((nama) => {
      const d = k.lanes[nama]!;
      return `  ${nama}: { singleInstance: ${d.single_instance === true}, memoryFenceMiB: ${d.memory_fence_mib ?? 0} },`;
    })
    .join("\n");

  const berjadwal = kinds.filter((kk) => k.kinds[kk]!.schedule !== undefined);
  const barisJadwal = berjadwal
    .map((nama) => {
      const j = k.kinds[nama]!.schedule!;
      return `  "${nama}": { grain: "${j.grain}", perCompany: ${j.per_company}, publisher: "${j.publisher}" },`;
    })
    .join("\n");

  const jalurKind = lanes
    .map((lane) => {
      const milik = kinds.filter((kk) => k.kinds[kk]!.lane === lane);
      return `  ${lane}: [${milik.map((m) => `"${m}"`).join(", ")}],`;
    })
    .join("\n");

  return `/**
 * ${JANGAN_SUNTING(k.version, "bun run contract:gen")}
 */

${union("JobStatus", k.statuses)}

export const JOB_STATUSES: readonly JobStatus[] = [
${k.statuses.map((s) => `  "${s}",`).join("\n")}
];

${union("JobKind", kinds)}

${union("JobLane", lanes)}

export interface JobKindSpec {
  lane: JobLane;
  maxAttempts: number;
  /** \`true\` HANYA pada jalur \`ledger\` — invarian I-2, pintu posting tunggal. */
  writesLedger: boolean;
}

export const JOB_KINDS: Readonly<Record<JobKind, JobKindSpec>> = {
${barisKind}
};

export interface JobLaneSpec {
  /** Lebih dari satu proses jalur ini adalah kesalahan konfigurasi. */
  singleInstance: boolean;
  /** Pagar memori per pekerjaan, MiB heap; 0 = tanpa pagar. */
  memoryFenceMiB: number;
}

export const JOB_LANES: Readonly<Record<JobLane, JobLaneSpec>> = {
${barisLane}
};

/** \`kind\` milik setiap jalur — klausa \`WHERE kind IN (…)\` pekerjanya. */
export const KINDS_BY_LANE: Readonly<Record<JobLane, readonly JobKind[]>> = {
${jalurKind}
};

${union("ScheduledKind", berjadwal)}

/** Butir kunci idempotensi denyut — SELALU UTC (\`contract/kinds.yaml\`). */
export type ScheduleGrain = ${SCHEDULE_GRAINS.map((g) => `"${g}"`).join(" | ")};

/** Penerbit kind berjadwal — tepat SATU bahasa. */
export type SchedulePublisher = ${SCHEDULE_PUBLISHERS.map((g) => `"${g}"`).join(" | ")};

export interface ScheduleSpec {
  grain: ScheduleGrain;
  /** Satu baris per perusahaan aktif (\`<kind>:<id>:<butir>\`), atau satu untuk seluruh pemasangan. */
  perCompany: boolean;
  publisher: SchedulePublisher;
}

/** Kind yang diterbitkan DENYUT, beserta penerbitnya. Dibaca \`@sai/core/schedule-due\`. */
export const SCHEDULED_KINDS: Readonly<Record<ScheduledKind, ScheduleSpec>> = {
${barisJadwal}
};

export const isJobKind = (v: string): v is JobKind =>
  Object.prototype.hasOwnProperty.call(JOB_KINDS, v);

export const isJobStatus = (v: string): v is JobStatus =>
  (JOB_STATUSES as readonly string[]).includes(v);
`;
}

/**
 * Angka antrean, TypeScript.
 *
 * Namanya tetap SCREAMING_SNAKE dan satuannya tetap tertulis di namanya
 * (`_MS`, `_SECONDS`, `_DAYS`): angka waktu tanpa satuan di namanya adalah
 * angka yang akan dikalikan seribu oleh orang berikutnya.
 */
function bangkitkanAngka(k: Kontrak): string {
  const n = k.numbers;
  return `/**
 * ${JANGAN_SUNTING(k.version, "bun run contract:gen")}
 *
 * ANGKA, bukan kosakata. SEBAB tiap angka ada di tempat ia dipakai —
 * \`@sai/core/job-backoff\` (backoff, lease, retensi) dan
 * \`@sai/core/queue-health\` (ambang umur) — dan modul-modul itu
 * MENGEKSPOR ULANG dari sini, jadi tidak ada pemanggil yang perlu tahu
 * bahwa angkanya datang dari kontrak.
 */

export const BACKOFF_BASE_MS = ${n.backoff_base_ms};
export const BACKOFF_MAX_MS = ${n.backoff_max_ms};

export const LEASE_RENEW_MS = ${n.lease_renew_ms};
export const LEASE_STALE_FACTOR = ${n.lease_stale_factor};

/** Dijamin generator LEBIH RAPAT daripada \`LEASE_RENEW_MS × LEASE_STALE_FACTOR\`. */
export const UPKEEP_MS = ${n.upkeep_ms};
export const IDLE_MS = ${n.idle_ms};

export const DONE_RETENTION_DAYS = ${n.done_retention_days};

export const QUEUE_AGE_WARN_SECONDS = ${n.queue_age_warn_seconds};
export const QUEUE_AGE_LATE_SECONDS = ${n.queue_age_late_seconds};

/**
 * Denyut pagar jalur tunggal-instans — dipakai \`workers/runner.ts\` untuk
 * \`@sai/db/session-lock\` dan oleh \`jobs.LaneLock\` di Go. Dijamin generator:
 * \`LANE_LOCK_PROBE_MS + LANE_LOCK_QUERY_TIMEOUT_MS < LANE_LOCK_IDLE_SESSION_MS\`.
 */
export const LANE_LOCK_PROBE_MS = ${n.lane_lock_probe_ms};
export const LANE_LOCK_QUERY_TIMEOUT_MS = ${n.lane_lock_query_timeout_ms};
export const LANE_LOCK_IDLE_SESSION_MS = ${n.lane_lock_idle_session_ms};

/**
 * Pemilik berkas hasil di volume \`hasil\`: pengguna \`node\` tahap \`runner\`,
 * yang MEMBACA volume itu. Penulisnya (pelari jalur, root) wajib \`chown\` ke
 * sini — lihat \`@sai/platform/job-result-store\`.
 */
export const RESULT_OWNER_UID = ${k.results.owner_uid};
export const RESULT_OWNER_GID = ${k.results.owner_gid};
`;
}

/**
 * Perataan kolom seperti yang dilakukan `gofmt`.
 *
 * Ada supaya berkas bangkitan sudah CANONICAL saat ditulis, bukan sesudah
 * seseorang menjalankan `gofmt`. Generator yang keluarannya belum rata membuat
 * `gofmt -l` menuding berkas yang tidak boleh disunting tangan — penjaga yang
 * menyalahkan berkas yang benar adalah penjaga yang akhirnya dimatikan orang.
 *
 * `gofmt` meratakan satu RUNTUN baris sejenis ke kolom terlebar di runtun itu;
 * runtun di sini selalu satu blok penuh, jadi lebar maksimum blok sudah cukup.
 */
function ratakan(baris: { kiri: string; kanan: string }[]): string {
  const lebar = Math.max(0, ...baris.map((b) => b.kiri.length));
  return baris.map((b) => `\t${b.kiri.padEnd(lebar)} ${b.kanan}`).join("\n");
}

/** `report.export` → `ReportExport`; `integration.bank_feed` → `IntegrationBankFeed`. */
function pengenalGo(nama: string): string {
  return nama
    .split(/[._-]/)
    .filter((b) => b.length > 0)
    .map((b) => b.charAt(0).toUpperCase() + b.slice(1))
    .join("");
}

/**
 * Kosakata DAN angka, Go — satu berkas, sebab satu paket Go satu unit impor.
 *
 * Angkanya `time.Duration` dan bukan int milidetik: di Go satuan memang hidup
 * di dalam tipenya, dan `int` milidetik yang diserahkan ke `time.After` adalah
 * nanodetik — galat yang mengompilasi dengan sempurna dan menghasilkan jeda
 * sejuta kali lebih pendek. Satu-satunya yang tetap bilangan adalah faktor dan
 * jumlah hari, yang memang tak bersatuan waktu.
 */
function bangkitkanGo(k: Kontrak): string {
  const kinds = Object.keys(k.kinds).sort();
  const lanes = Object.keys(k.lanes).sort();
  const n = k.numbers;

  const konstStatus = ratakan(
    k.statuses.map((s) => ({ kiri: `Status${pengenalGo(s)}`, kanan: `JobStatus = "${s}"` }))
  );
  const konstKind = ratakan(
    kinds.map((s) => ({ kiri: `Kind${pengenalGo(s)}`, kanan: `JobKind = "${s}"` }))
  );
  const konstLane = ratakan(
    lanes.map((s) => ({ kiri: `Lane${pengenalGo(s)}`, kanan: `JobLane = "${s}"` }))
  );

  const petaKind = ratakan(
    kinds.map((nama) => {
      const d = k.kinds[nama]!;
      return {
        kiri: `Kind${pengenalGo(nama)}:`,
        kanan:
          `{Lane: Lane${pengenalGo(d.lane)}, MaxAttempts: ${d.max_attempts}, ` +
          `WritesLedger: ${d.writes_ledger === true}},`,
      };
    })
  );

  const petaLane = ratakan(
    lanes.map((nama) => {
      const d = k.lanes[nama]!;
      return {
        kiri: `Lane${pengenalGo(nama)}:`,
        kanan: `{SingleInstance: ${d.single_instance === true}, MemoryFenceMiB: ${d.memory_fence_mib ?? 0}},`,
      };
    })
  );

  const berjadwal = kinds.filter((kk) => k.kinds[kk]!.schedule !== undefined);
  const petaJadwal = ratakan(
    berjadwal.map((nama) => {
      const j = k.kinds[nama]!.schedule!;
      return {
        kiri: `Kind${pengenalGo(nama)}:`,
        kanan:
          `{Grain: Grain${pengenalGo(j.grain)}, PerCompany: ${j.per_company}, ` +
          `Publisher: Publisher${pengenalGo(j.publisher)}},`,
      };
    })
  );
  const konstGrain = ratakan(
    SCHEDULE_GRAINS.map((g) => ({ kiri: `Grain${pengenalGo(g)}`, kanan: `ScheduleGrain = "${g}"` }))
  );
  const konstPenerbit = ratakan(
    SCHEDULE_PUBLISHERS.map((g) => ({ kiri: `Publisher${pengenalGo(g)}`, kanan: `SchedulePublisher = "${g}"` }))
  );

  const petaJalurKind = ratakan(
    lanes.map((lane) => {
      const milik = kinds.filter((kk) => k.kinds[kk]!.lane === lane);
      return {
        kiri: `Lane${pengenalGo(lane)}:`,
        kanan: `{${milik.map((m) => `Kind${pengenalGo(m)}`).join(", ")}},`,
      };
    })
  );

  /* `.trimEnd()` per baris: `gofmt` membuang spasi di ujung baris, dan baris
     komentar kosong di TypeScript (` * `) menjadi `// ` yang berujung spasi. */
  const kepala = JANGAN_SUNTING(k.version, "bun run contract:gen")
    .split("\n")
    .map((b) => `// ${b.replace(/^ \* ?/, "")}`.trimEnd())
    .join("\n");

  return `${kepala}

package contract

import "time"

// JobStatus adalah status baris \`jobs\`. Urutannya bermakna:
// queued → claimed → done | failed → dead. \`failed\` BUKAN akhir.
type JobStatus string

const (
${konstStatus}
)

// JobStatuses dalam urutan kontrak, bukan urutan abjad.
var JobStatuses = []JobStatus{
${k.statuses.map((s) => `\tStatus${pengenalGo(s)},`).join("\n")}
}

// JobKind adalah jenis pekerjaan. Satu jenis milik tepat satu jalur.
type JobKind string

const (
${konstKind}
)

// JobLane adalah satu PROSES pekerja. Isolasinya jalur, bukan layanan.
type JobLane string

const (
${konstLane}
)

// KindSpec adalah sifat satu jenis pekerjaan.
type KindSpec struct {
\tLane        JobLane
\tMaxAttempts int
\t// WritesLedger benar HANYA pada jalur ledger — invarian I-2, pintu posting
\t// tunggal, dan pintu itu TypeScript. Tidak ada kode Go yang boleh
\t// mengklaim jenis pekerjaan ber-WritesLedger.
\tWritesLedger bool
}

// JobKinds memetakan setiap jenis ke sifatnya.
var JobKinds = map[JobKind]KindSpec{
${petaKind}
}

// LaneSpec: lebih dari satu proses jalur ber-SingleInstance adalah kesalahan
// konfigurasi, bukan penskalaan.
type LaneSpec struct {
\tSingleInstance bool
\t// MemoryFenceMiB: pagar memori per pekerjaan (MiB heap Go); 0 = tanpa pagar.
\tMemoryFenceMiB int
}

// JobLanes memetakan setiap jalur ke sifatnya.
var JobLanes = map[JobLane]LaneSpec{
${petaLane}
}

// KindsByLane adalah klausa WHERE kind = ANY(…) milik setiap pelari.
var KindsByLane = map[JobLane][]JobKind{
${petaJalurKind}
}

// ScheduleGrain: butir kunci idempotensi denyut — SELALU UTC.
type ScheduleGrain string

const (
${konstGrain}
)

// SchedulePublisher: bahasa yang MENERBITKAN satu kind berjadwal — tepat satu.
type SchedulePublisher string

const (
${konstPenerbit}
)

// ScheduleSpec: bagaimana denyut menerbitkan satu kind, dan siapa penerbitnya.
type ScheduleSpec struct {
\tGrain ScheduleGrain
\t// PerCompany: satu baris per perusahaan aktif (\`<kind>:<id>:<butir>\`),
\t// atau satu untuk seluruh pemasangan (\`<kind>:<butir>\`).
\tPerCompany bool
\tPublisher  SchedulePublisher
}

// ScheduledKinds: kind yang diterbitkan DENYUT. Dibaca \`internal/schedulelane\`;
// padanan TS \`SCHEDULED_KINDS\` dibaca \`@sai/core/schedule-due\`.
var ScheduledKinds = map[JobKind]ScheduleSpec{
${petaJadwal}
}

// IsJobKind melaporkan apakah v adalah jenis yang dikenal kontrak ini.
func IsJobKind(v string) bool {
\t_, ada := JobKinds[JobKind(v)]
\treturn ada
}

// IsJobStatus melaporkan apakah v adalah status yang dikenal kontrak ini.
func IsJobStatus(v string) bool {
\tfor _, s := range JobStatuses {
\t\tif string(s) == v {
\t\t\treturn true
\t\t}
\t}
\treturn false
}

// ── Angka antrean ──────────────────────────────────────────────────────────
//
// Sebab tiap angka ada di sisi TypeScript, di tempat ia dipakai:
// packages/core/src/job-backoff.ts dan packages/core/src/queue-health.ts.
// Yang dibangkitkan angkanya, bukan alasannya.
const (
\tBackoffBase = ${n.backoff_base_ms} * time.Millisecond
\tBackoffMax  = ${n.backoff_max_ms} * time.Millisecond

\tLeaseRenew = ${n.lease_renew_ms} * time.Millisecond
\t// LeaseStaleFactor: ambang basi adalah KELIPATAN interval pembaruan, bukan
\t// perkiraan durasi pekerjaan. Dengan lease yang diperpanjang, pertanyaannya
\t// berubah dari "apakah pekerjaan ini lama?" menjadi "apakah pekerjanya masih
\t// hidup?" — dan yang kedua punya jawaban yang tidak bergantung jenis kerja.
\tLeaseStaleFactor = ${n.lease_stale_factor}
\tLeaseStale       = LeaseRenew * LeaseStaleFactor

\t// Upkeep dijamin generator LEBIH RAPAT daripada LeaseStale.
\tUpkeep = ${n.upkeep_ms} * time.Millisecond
\tIdle   = ${n.idle_ms} * time.Millisecond

\tDoneRetentionDays = ${n.done_retention_days}

\tQueueAgeWarn = ${n.queue_age_warn_seconds} * time.Second
\tQueueAgeLate = ${n.queue_age_late_seconds} * time.Second

\t// Denyut pagar jalur tunggal-instans (\`jobs.LaneLock\`; padanan Node
\t// \`@sai/db/session-lock\`). Dijamin generator:
\t// LaneLockProbe + LaneLockQueryTimeout < LaneLockIdleSession.
\tLaneLockProbe        = ${n.lane_lock_probe_ms} * time.Millisecond
\tLaneLockQueryTimeout = ${n.lane_lock_query_timeout_ms} * time.Millisecond
\tLaneLockIdleSession  = ${n.lane_lock_idle_session_ms} * time.Millisecond
)

// ResultOwnerUID/GID: pemilik berkas hasil di volume \`hasil\` — pengguna
// \`node\` yang membacanya di \`app-customer\`. Pelari yang berjalan sebagai root
// wajib chown ke sini, atau rute unduhan menjawab 404 untuk setiap hasil.
const (
\tResultOwnerUID = ${k.results.owner_uid}
\tResultOwnerGID = ${k.results.owner_gid}
)
`;
}

// ═══ contract/accounting.yaml (tahap 1d) ═══════════════════════════════════
//
// Sumber KEDUA, dengan alasan yang sama dengan pemisahan angka antrean dari
// kosakata: pembacanya berbeda. `kinds.yaml` dibaca pelari antrean;
// `accounting.yaml` dibaca pembaca buku (`internal/ledgerread`) dan modul
// akuntansi TypeScript. Satu berkas YAML untuk keduanya akan membuat setiap
// perubahan tipe akun tampak seperti perubahan antrean di riwayat git.

interface KontrakAkuntansi {
  version: number;
  money: { scale: number };
  account_types: string[];
  account_categories: string[];
  account_type_categories: Record<string, string>;
  category_statement_side: Record<string, string>;
  income_statement: {
    sections: string[];
    type_sections: Record<string, string>;
    category_default_sections: Record<string, string>;
  };
  closing_journal_type: string;
  cash_flow: {
    cash_account_type: string;
    categories: string[];
    fallback_category: string;
    type_categories: Record<string, string>;
  };
  currencies: { base: string; values: string[] };
  invoice_statuses: string[];
  contract_statuses: string[];
  aging: { buckets: { key: string; max_days?: number }[] };
}

/** Kode mata uang ISO 4217: tiga huruf besar. */
const ISO_4217 = /^[A-Z]{3}$/;

/** Sisi saldo — dua nilai, ditulis di sini karena ia kosakata generator, bukan data. */
const SISI = ["debit", "credit"] as const;

/** Nilai enum-like mengikuti docs/DATABASE.md: `snake_case` huruf kecil. */
const SNAKE = /^[a-z][a-z0-9_]*$/;

function bacaAkuntansi(): KontrakAkuntansi {
  const k = load(readFileSync(SUMBER_AKUNTANSI, "utf8")) as KontrakAkuntansi;

  const salah: string[] = [];
  if (!Number.isInteger(k.version)) salah.push("`version` bukan bilangan bulat");

  /* Skala dibatasi 0..6, dan batas atasnya bukan hiasan: pembaca Go
     menjumlahkan uang sebagai SEN `int64`, dan skala yang lebih besar
     menggerus ruang angka itu sampai jumlah buku yang wajar meluap. */
  const scale = k.money?.scale;
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) {
    salah.push(`money.scale harus bilangan bulat 0..6 (kini: ${String(scale)})`);
  }

  const tipe = k.account_types;
  if (!Array.isArray(tipe) || tipe.length === 0) {
    salah.push("`account_types` kosong");
  } else {
    const lihat = new Set<string>();
    for (const t of tipe) {
      if (typeof t !== "string" || !SNAKE.test(t)) {
        salah.push(`tipe akun ${JSON.stringify(t)} bukan snake_case huruf kecil`);
      } else if (lihat.has(t)) {
        /* Duplikat bukan kosmetik: TS memetakan label per nilai, dan entri
           ganda di daftar pilihan formulir menyimpan nilai yang sama dua kali. */
        salah.push(`tipe akun \`${t}\` tercantum dua kali`);
      }
      lihat.add(t);
    }
  }

  /* ── Kategori, sisi laporan, band Laba Rugi, jurnal penutup (Laba Rugi &
     Neraca Go). Setiap peta diperiksa LENGKAP terhadap daftar kuncinya: peta
     yang kurang satu tipe adalah tipe yang hilang dari laporan di satu bahasa
     dan tidak di bahasa lain — tanpa satu galat pun. */
  const daftar = (nama: string, v: unknown): string[] => {
    if (!Array.isArray(v) || v.length === 0) {
      salah.push(`\`${nama}\` kosong`);
      return [];
    }
    const lihat = new Set<string>();
    for (const x of v) {
      if (typeof x !== "string" || !SNAKE.test(x)) salah.push(`${nama}: ${JSON.stringify(x)} bukan snake_case`);
      else if (lihat.has(x)) salah.push(`${nama}: \`${x}\` tercantum dua kali`);
      lihat.add(x);
    }
    return v as string[];
  };
  const peta = (
    nama: string,
    v: unknown,
    kunciSah: readonly string[],
    nilaiSah: readonly string[],
    lengkap: boolean
  ): void => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      salah.push(`\`${nama}\` bukan peta`);
      return;
    }
    const m = v as Record<string, unknown>;
    for (const [kunci, nilai] of Object.entries(m)) {
      if (!kunciSah.includes(kunci)) salah.push(`${nama}: kunci \`${kunci}\` tidak dikenal`);
      if (typeof nilai !== "string" || !nilaiSah.includes(nilai)) {
        salah.push(`${nama}.${kunci}: ${JSON.stringify(nilai)} bukan salah satu dari ${nilaiSah.join(", ")}`);
      }
    }
    if (lengkap) {
      for (const kunci of kunciSah) {
        if (!(kunci in m)) salah.push(`${nama}: \`${kunci}\` belum dipetakan`);
      }
    }
  };

  const kategori = daftar("account_categories", k.account_categories);
  peta("account_type_categories", k.account_type_categories, tipe ?? [], kategori, true);
  peta("category_statement_side", k.category_statement_side, kategori, SISI, true);
  const is = k.income_statement;
  if (!is || typeof is !== "object") {
    salah.push("`income_statement` kosong");
  } else {
    const band = daftar("income_statement.sections", is.sections);
    peta("income_statement.category_default_sections", is.category_default_sections, kategori, band, false);
    peta("income_statement.type_sections", is.type_sections, tipe ?? [], band, false);
    /* Penimpa band per tipe hanya bermakna untuk tipe LABA RUGI — tipe yang
       kategorinya tak punya band bawaan tidak pernah masuk Laba Rugi, dan
       penimpanya akan menjadi aturan yang dibaca satu bahasa saja. */
    for (const t of Object.keys(is.type_sections ?? {})) {
      const kat = k.account_type_categories?.[t];
      if (kat === undefined || !(kat in (is.category_default_sections ?? {}))) {
        salah.push(`income_statement.type_sections.${t}: kategori \`${String(kat)}\` tidak punya band bawaan`);
      }
    }
  }
  if (typeof k.closing_journal_type !== "string" || !SNAKE.test(k.closing_journal_type)) {
    salah.push("`closing_journal_type` bukan snake_case");
  }

  /* ── Arus Kas (tahap 1d). Akun kas WAJIB tipe kontrak; kelompok cadangan
     WAJIB anggota daftar kelompok dan TIDAK boleh menjadi tujuan pemetaan —
     ia hanya dicapai oleh tipe yang tidak dipetakan, jadi tipe yang
     "dipetakan ke cadangan" adalah dua cara menulis satu aturan. Pemetaan
     sengaja TIDAK wajib lengkap (lihat YAML). */
  const cf = k.cash_flow;
  if (!cf || typeof cf !== "object") {
    salah.push("`cash_flow` kosong");
  } else {
    if (!(tipe ?? []).includes(cf.cash_account_type)) {
      salah.push(`cash_flow.cash_account_type ${JSON.stringify(cf.cash_account_type)} bukan tipe akun kontrak`);
    }
    const kelompok = daftar("cash_flow.categories", cf.categories);
    if (!kelompok.includes(cf.fallback_category)) {
      salah.push(`cash_flow.fallback_category ${JSON.stringify(cf.fallback_category)} bukan salah satu cash_flow.categories`);
    }
    peta(
      "cash_flow.type_categories",
      cf.type_categories,
      tipe ?? [],
      kelompok.filter((c) => c !== cf.fallback_category),
      false
    );
    if (cf.type_categories && cf.cash_account_type in cf.type_categories) {
      salah.push("cash_flow.type_categories: akun kas tidak pernah menjadi akun lawan arus kas");
    }
  }

  /* ── Mata uang (23 Okt 2026). Kode ISO tiga huruf besar, tanpa duplikat, dan
     mata uang dasar WAJIB anggotanya — `base_amount` yang dinyatakan dalam mata
     uang yang tidak bisa dipilih di formulir mana pun tidak bisa dibaca siapa pun. */
  const mu = k.currencies;
  if (!mu || typeof mu !== "object" || !Array.isArray(mu.values) || mu.values.length === 0) {
    salah.push("`currencies.values` kosong");
  } else {
    const lihat = new Set<string>();
    for (const c of mu.values) {
      if (typeof c !== "string" || !ISO_4217.test(c)) salah.push(`currencies: ${JSON.stringify(c)} bukan kode ISO 4217`);
      else if (lihat.has(c)) salah.push(`currencies: \`${c}\` tercantum dua kali`);
      lihat.add(c);
    }
    if (typeof mu.base !== "string" || !mu.values.includes(mu.base)) {
      salah.push(`currencies.base ${JSON.stringify(mu.base)} bukan salah satu dari currencies.values`);
    }
  }

  /* ── Status dokumen. Status kontrak WAJIB diawali status faktur, persis dan
     berurutan: posisi menentukan warna donat dan label badge yang dibagi kedua
     dokumen, jadi status kontrak tambahan hanya boleh berdiri di BELAKANG. */
  const statusFaktur = daftar("invoice_statuses", k.invoice_statuses);
  const statusKontrak = daftar("contract_statuses", k.contract_statuses);
  if (
    statusFaktur.length > 0 &&
    statusKontrak.length > 0 &&
    statusFaktur.some((s, i) => statusKontrak[i] !== s)
  ) {
    salah.push(
      `contract_statuses harus DIAWALI invoice_statuses dalam urutan yang sama ` +
        `(${statusFaktur.join(", ")}); kini: ${statusKontrak.join(", ")}`
    );
  }

  /* ── Ember umur (#12). Batas atas INKLUSIF, naik tegas, ember terakhir
     tanpa batas: setiap umur jatuh ke TEPAT satu ember, di kedua bahasa. */
  const ember = k.aging?.buckets;
  if (!Array.isArray(ember) || ember.length < 2) {
    salah.push("`aging.buckets` butuh sedikitnya dua ember");
  } else {
    const lihat = new Set<string>();
    let sebelum = 0;
    ember.forEach((e, i) => {
      const akhir = i === ember.length - 1;
      if (typeof e?.key !== "string" || !SNAKE.test(e.key)) {
        salah.push(`aging.buckets[${i}].key ${JSON.stringify(e?.key)} bukan snake_case`);
      } else if (lihat.has(e.key)) {
        salah.push(`aging.buckets: \`${e.key}\` tercantum dua kali`);
      } else lihat.add(e.key);
      if (akhir) {
        if (e?.max_days !== undefined) salah.push("aging.buckets: ember TERAKHIR tidak boleh berbatas (`max_days`)");
      } else if (!Number.isInteger(e?.max_days) || (e.max_days as number) <= sebelum) {
        salah.push(
          `aging.buckets[${i}].max_days ${JSON.stringify(e?.max_days)} harus bilangan bulat > ${sebelum}`
        );
      } else sebelum = e.max_days as number;
    });
  }

  if (salah.length > 0) {
    console.error("✗ contract/accounting.yaml tidak sah:");
    for (const s of salah) console.error(`  • ${s}`);
    process.exit(1);
  }
  return k;
}

const JANGAN_SUNTING_AKUNTANSI = (versi: number) => `DIBANGKITKAN DARI \`contract/accounting.yaml\` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan \`bun run contract:gen\` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila
 * berkas ini basi, dan penjaga \`tests/contract-accounting.test.ts\` memanggilnya.
 *
 * Kontrak akuntansi versi ${versi}.`;

function bangkitkanAkuntansi(k: KontrakAkuntansi): string {
  return `/**
 * ${JANGAN_SUNTING_AKUNTANSI(k.version)}
 *
 * HANYA konstanta yang punya pembaca Go hari ini (09 §3.5) — kecuali mata uang
 * & status dokumen, pengecualian yang disebut (keputusan pemilik 23 Okt 2026).
 * Label dan saldo normal per tipe tetap di \`src/lib/accounting.ts\`; label &
 * warna status di \`@sai/core/constants\` dan \`status-badge.tsx\`.
 */

/** Skala kolom uang \`Decimal(15,2)\`: satu sen = 10^-MONEY_SCALE rupiah. */
export const MONEY_SCALE = ${k.money.scale};

${union("AccountType", k.account_types)}

/** Urutan kontrak = urutan pilihan formulir; entri pertama bawaannya. */
export const ACCOUNT_TYPE_VALUES = [
${k.account_types.map((t) => `  "${t}",`).join("\n")}
] as const satisfies readonly AccountType[];

export const isAccountType = (v: string): v is AccountType =>
  (ACCOUNT_TYPE_VALUES as readonly string[]).includes(v);

// ── Kategori & sisi laporan — dibaca Laba Rugi dan Neraca (TS dan Go) ─────

${union("AccountCategory", k.account_categories)}

export const ACCOUNT_CATEGORY_VALUES = [
${k.account_categories.map((t) => `  "${t}",`).join("\n")}
] as const satisfies readonly AccountCategory[];

/** Kategori setiap tipe akun. Lengkap — generator menolak tipe tanpa kategori. */
export const ACCOUNT_TYPE_CATEGORIES: Readonly<Record<AccountType, AccountCategory>> = {
${k.account_types.map((t) => `  ${t}: "${k.account_type_categories[t]}",`).join("\n")}
};

export type StatementSide = "debit" | "credit";

/**
 * Sisi yang dilaporkan POSITIF per kategori di Laba Rugi & Neraca:
 * \`debit\` = debit − kredit, \`credit\` = kredit − debit.
 */
export const CATEGORY_STATEMENT_SIDE: Readonly<Record<AccountCategory, StatementSide>> = {
${k.account_categories.map((c) => `  ${c}: "${k.category_statement_side[c]}",`).join("\n")}
};

// ── Laba Rugi bertingkat (#123) ───────────────────────────────────────────

${union("IncomeStatementSectionKey", k.income_statement.sections)}

/** Urutan band di laporan. */
export const INCOME_STATEMENT_SECTION_KEYS = [
${k.income_statement.sections.map((t) => `  "${t}",`).join("\n")}
] as const satisfies readonly IncomeStatementSectionKey[];

/** Tipe yang punya band SENDIRI; tipe laba rugi lainnya ikut bawaan kategorinya. */
export const INCOME_STATEMENT_TYPE_SECTIONS: Readonly<
  Partial<Record<AccountType, IncomeStatementSectionKey>>
> = {
${Object.entries(k.income_statement.type_sections).map(([t, v]) => `  ${t}: "${v}",`).join("\n")}
};

/** Band bawaan per kategori. Kategori tanpa entri = bukan akun Laba Rugi. */
export const INCOME_STATEMENT_CATEGORY_DEFAULT_SECTIONS: Readonly<
  Partial<Record<AccountCategory, IncomeStatementSectionKey>>
> = {
${Object.entries(k.income_statement.category_default_sections).map(([c, v]) => `  ${c}: "${v}",`).join("\n")}
};

/** \`journals.type\` jurnal penutup tahunan (#555) — DIBUANG Laba Rugi saja. */
export const CLOSING_JOURNAL_TYPE = "${k.closing_journal_type}";

// ── Arus Kas (PSAK 2 / IAS 7) — dibaca \`getCashFlow\` dan Arus Kas Go ─────

/** Tipe akun sisi KAS: arus kas = gerakan yang menyeberangi batas akun ini. */
export const CASH_ACCOUNT_TYPE = "${k.cash_flow.cash_account_type}" satisfies AccountType;

${union("CashFlowCategory", k.cash_flow.categories)}

/** Urutan kelompok di laporan. */
export const CASH_FLOW_CATEGORY_KEYS = [
${k.cash_flow.categories.map((c) => `  "${c}",`).join("\n")}
] as const satisfies readonly CashFlowCategory[];

/** Kelompok tipe yang TIDAK dipetakan — kelompok yang terlihat, bukan operasi. */
export const CASH_FLOW_FALLBACK_CATEGORY = "${k.cash_flow.fallback_category}" satisfies CashFlowCategory;

/** Kelompok arus kas per tipe AKUN LAWAN; tipe lain jatuh ke cadangan. */
export const CASH_FLOW_TYPE_CATEGORIES: Readonly<Partial<Record<AccountType, CashFlowCategory>>> = {
${Object.entries(k.cash_flow.type_categories).map(([t, c]) => `  ${t}: "${c}",`).join("\n")}
};

// ── Mata uang & status dokumen (23 Okt 2026) ──────────────────────────────
// Dibaca lewat re-ekspor \`@sai/core/constants\`; label & warna tetap di TS.

${union("Currency", k.currencies.values)}

/** Mata uang yang ditransaksikan, dalam urutan pilihan formulir. */
export const CURRENCIES = [
${k.currencies.values.map((c) => `  "${c}",`).join("\n")}
] as const satisfies readonly Currency[];

/** Mata uang buku besar — satuan setiap \`base_amount\`. */
export const BASE_CURRENCY = "${k.currencies.base}" satisfies Currency;

${union("InvoiceStatus", k.invoice_statuses)}

export const INVOICE_STATUSES = [
${k.invoice_statuses.map((s) => `  "${s}",`).join("\n")}
] as const satisfies readonly InvoiceStatus[];

${union("ContractStatus", k.contract_statuses)}

/** Diawali \`INVOICE_STATUSES\` persis (generator menolak selainnya); tambahan di belakang. */
export const CONTRACT_STATUSES = [
${k.contract_statuses.map((s) => `  "${s}",`).join("\n")}
] as const satisfies readonly ContractStatus[];

// ── Umur piutang & utang (#12) — dibaca \`receivables.ts\` dan Go ─────────

${union("AgingBucket", k.aging.buckets.map((b) => b.key))}

/** Ember umur, dari yang termuda. */
export const AGING_BUCKETS = [
${k.aging.buckets.map((b) => `  "${b.key}",`).join("\n")}
] as const satisfies readonly AgingBucket[];

/**
 * Batas atas INKLUSIF tiap ember dalam hari kalender Jakarta; \`null\` = ember
 * terakhir, tanpa batas. Umur <= 0 mendarat di ember pertama.
 */
export const AGING_BUCKET_MAX_DAYS: Readonly<Record<AgingBucket, number | null>> = {
${k.aging.buckets.map((b) => `  ${b.key}: ${b.max_days ?? "null"},`).join("\n")}
};
`;
}

/** `cash_bank` → `AccountTypeCashBank`. */
function bangkitkanAkuntansiGo(k: KontrakAkuntansi): string {
  const kepala = JANGAN_SUNTING_AKUNTANSI(k.version)
    .split("\n")
    .map((b) => `// ${b.replace(/^ \* ?/, "")}`.trimEnd())
    .join("\n");

  const konstTipe = ratakan(
    k.account_types.map((t) => ({
      kiri: `AccountType${pengenalGo(t)}`,
      kanan: `AccountType = "${t}"`,
    }))
  );

  return `${kepala}

package contract

// MoneyScale adalah skala kolom uang Decimal(15,2): satu sen = 10^-MoneyScale
// rupiah. Pembaca buku menjumlahkan uang sebagai sen int64 — tidak pernah
// float — dan mengurai NUMERIC dengan skala ini.
const MoneyScale = ${k.money.scale}

// AccountType adalah nilai kolom \`accounts.type\`.
type AccountType string

const (
${konstTipe}
)

// AccountTypes dalam urutan kontrak (urutan pilihan formulir), bukan abjad.
var AccountTypes = []AccountType{
${k.account_types.map((t) => `\tAccountType${pengenalGo(t)},`).join("\n")}
}

// IsAccountType melaporkan apakah v adalah tipe akun yang dikenal kontrak ini.
func IsAccountType(v string) bool {
\tfor _, t := range AccountTypes {
\t\tif string(t) == v {
\t\t\treturn true
\t\t}
\t}
\treturn false
}

// AccountCategory adalah kategori laporan keuangan sebuah tipe akun.
type AccountCategory string

const (
${ratakan(k.account_categories.map((c) => ({ kiri: `AccountCategory${pengenalGo(c)}`, kanan: `AccountCategory = "${c}"` })))}
)

// AccountTypeCategories: kategori setiap tipe akun kontrak (lengkap).
var AccountTypeCategories = map[AccountType]AccountCategory{
${ratakan(k.account_types.map((t) => ({ kiri: `AccountType${pengenalGo(t)}:`, kanan: `AccountCategory${pengenalGo(k.account_type_categories[t]!)},` })))}
}

// CategoryOf: kategori tipe akun mentah dari basis data; false bila tipenya di
// luar kontrak — akun seperti itu tidak masuk Laba Rugi maupun Neraca.
func CategoryOf(accountType string) (AccountCategory, bool) {
\tc, ok := AccountTypeCategories[AccountType(accountType)]
\treturn c, ok
}

// StatementSide: sisi yang dilaporkan POSITIF di Laba Rugi & Neraca.
type StatementSide string

const (
\tStatementSideDebit  StatementSide = "debit"
\tStatementSideCredit StatementSide = "credit"
)

// CategoryStatementSide: debit = debit − kredit, credit = kredit − debit.
var CategoryStatementSide = map[AccountCategory]StatementSide{
${ratakan(k.account_categories.map((c) => ({ kiri: `AccountCategory${pengenalGo(c)}:`, kanan: `StatementSide${pengenalGo(k.category_statement_side[c]!)},` })))}
}

// IncomeStatementSection adalah satu band Laba Rugi bertingkat (#123).
type IncomeStatementSection string

const (
${ratakan(k.income_statement.sections.map((c) => ({ kiri: `IncomeStatementSection${pengenalGo(c)}`, kanan: `IncomeStatementSection = "${c}"` })))}
)

// IncomeStatementSections dalam urutan band laporan.
var IncomeStatementSections = []IncomeStatementSection{
${k.income_statement.sections.map((c) => `\tIncomeStatementSection${pengenalGo(c)},`).join("\n")}
}

// IncomeStatementTypeSections: tipe yang punya band SENDIRI.
var IncomeStatementTypeSections = map[AccountType]IncomeStatementSection{
${ratakan(Object.entries(k.income_statement.type_sections).map(([t, v]) => ({ kiri: `AccountType${pengenalGo(t)}:`, kanan: `IncomeStatementSection${pengenalGo(v)},` })))}
}

// IncomeStatementCategoryDefaultSections: band bawaan per kategori; kategori
// tanpa entri bukan akun Laba Rugi.
var IncomeStatementCategoryDefaultSections = map[AccountCategory]IncomeStatementSection{
${ratakan(Object.entries(k.income_statement.category_default_sections).map(([c, v]) => ({ kiri: `AccountCategory${pengenalGo(c)}:`, kanan: `IncomeStatementSection${pengenalGo(v)},` })))}
}

// ClosingJournalType: \`journals.type\` jurnal penutup tahunan (#555). Laba
// Rugi MEMBUANGNYA; Neraca dan Neraca Saldo memasukkannya.
const ClosingJournalType = "${k.closing_journal_type}"

// CashAccountType: tipe akun sisi KAS — arus kas adalah gerakan yang
// menyeberangi batas akun bertipe ini.
const CashAccountType = AccountType${pengenalGo(k.cash_flow.cash_account_type)}

// CashFlowCategory adalah satu kelompok Arus Kas (PSAK 2 / IAS 7).
type CashFlowCategory string

const (
${ratakan(k.cash_flow.categories.map((c) => ({ kiri: `CashFlowCategory${pengenalGo(c)}`, kanan: `CashFlowCategory = "${c}"` })))}
)

// CashFlowCategories dalam urutan kelompok laporan.
var CashFlowCategories = []CashFlowCategory{
${k.cash_flow.categories.map((c) => `\tCashFlowCategory${pengenalGo(c)},`).join("\n")}
}

// CashFlowFallbackCategory: kelompok tipe akun lawan yang TIDAK dipetakan.
const CashFlowFallbackCategory = CashFlowCategory${pengenalGo(k.cash_flow.fallback_category)}

// CashFlowTypeCategories: kelompok arus kas per tipe AKUN LAWAN.
var CashFlowTypeCategories = map[AccountType]CashFlowCategory{
${ratakan(Object.entries(k.cash_flow.type_categories).map(([t, c]) => ({ kiri: `AccountType${pengenalGo(t)}:`, kanan: `CashFlowCategory${pengenalGo(c)},` })))}
}

// CashFlowCategoryOf: kelompok arus kas tipe akun lawan MENTAH dari basis
// data — padanan \`cashFlowCategoryFor\`; tipe tak dipetakan → cadangan.
func CashFlowCategoryOf(accountType string) CashFlowCategory {
\tif c, ok := CashFlowTypeCategories[AccountType(accountType)]; ok {
\t\treturn c
\t}
\treturn CashFlowFallbackCategory
}

// Currency adalah kode ISO 4217 yang ditransaksikan aplikasi (kolom
// \`currency\` dokumen). Dibangkitkan atas keputusan pemilik 23 Okt 2026,
// sebelum pembaca Go pertamanya (pemeriksa kesesuaian data).
type Currency string

const (
${ratakan(k.currencies.values.map((c) => ({ kiri: `Currency${pengenalGo(c)}`, kanan: `Currency = "${c}"` })))}
)

// Currencies dalam urutan kontrak (urutan pilihan formulir).
var Currencies = []Currency{
${k.currencies.values.map((c) => `\tCurrency${pengenalGo(c)},`).join("\n")}
}

// BaseCurrency: mata uang buku besar — satuan setiap base_amount.
const BaseCurrency = Currency${pengenalGo(k.currencies.base)}

// IsCurrency melaporkan apakah v adalah mata uang yang dikenal kontrak ini.
func IsCurrency(v string) bool {
\tfor _, c := range Currencies {
\t\tif string(c) == v {
\t\t\treturn true
\t\t}
\t}
\treturn false
}

// InvoiceStatus adalah nilai kolom \`invoices.status\`.
type InvoiceStatus string

const (
${ratakan(k.invoice_statuses.map((s) => ({ kiri: `InvoiceStatus${pengenalGo(s)}`, kanan: `InvoiceStatus = "${s}"` })))}
)

// InvoiceStatuses dalam urutan kontrak.
var InvoiceStatuses = []InvoiceStatus{
${k.invoice_statuses.map((s) => `\tInvoiceStatus${pengenalGo(s)},`).join("\n")}
}

// ContractStatus adalah nilai kolom \`contracts.status\` — diawali status
// faktur persis, tambahan di belakang.
type ContractStatus string

const (
${ratakan(k.contract_statuses.map((s) => ({ kiri: `ContractStatus${pengenalGo(s)}`, kanan: `ContractStatus = "${s}"` })))}
)

// ContractStatuses dalam urutan kontrak.
var ContractStatuses = []ContractStatus{
${k.contract_statuses.map((s) => `\tContractStatus${pengenalGo(s)},`).join("\n")}
}

// IsContractStatus melaporkan apakah v adalah status kontrak yang dikenal.
func IsContractStatus(v string) bool {
\tfor _, s := range ContractStatuses {
\t\tif string(s) == v {
\t\t\treturn true
\t\t}
\t}
\treturn false
}

// AgingBucket adalah satu ember Umur Piutang & Umur Utang (#12).
type AgingBucket string

const (
${ratakan(k.aging.buckets.map((b) => ({ kiri: `AgingBucket${pengenalGo(b.key)}`, kanan: `AgingBucket = "${b.key}"` })))}
)

// AgingBucketSpec: satu ember beserta batas atas INKLUSIF-nya (hari kalender
// Jakarta). Bounded=false hanya untuk ember terakhir, yang menampung sisanya.
type AgingBucketSpec struct {
\tKey     AgingBucket
\tMaxDays int
\tBounded bool
}

// AgingBuckets dalam urutan kontrak, dari yang termuda. Umur <= 0 mendarat di
// ember pertama.
var AgingBuckets = []AgingBucketSpec{
${k.aging.buckets.map((b) => b.max_days === undefined ? `\t{Key: AgingBucket${pengenalGo(b.key)}},` : `\t{Key: AgingBucket${pengenalGo(b.key)}, MaxDays: ${b.max_days}, Bounded: true},`).join("\n")}
}
`;
}

// ═══ Tata letak berkas laporan (tahap 1d) ══════════════════════════════════
//
// Sumbernya BUKAN `contract/*.yaml`, dan itu disengaja: kalimat cetak, judul
// kolom, dan format angka sudah punya SATU sumber — `statement-layout.ts`
// (dipakai layar, PDF, dan lembar sebar) dan `report-export.ts` — yang dijaga
// `tests/print-label-dictionary.test.ts` terhadap kamus. Memindahkannya ke YAML
// akan memutus tiga permukaan itu dari sumbernya demi pembaca keempat. Yang
// dilakukan di sini: modul TS itu DIIMPOR, dan Go menerima nilainya sebagai
// berkas bangkitan — tetap satu sumber, tetap digerbang `--cek`.
//
// Kalimat yang memuat nilai (periode, baris "Dicetak") dibangkitkan dengan
// MEMANGGIL fungsi TS-nya dengan penanda, lalu penanda itu menjadi `%s`. Jadi
// yang sampai ke Go adalah kalimat yang sama persis, bukan salinannya.

/** Kalimat TS → pola `fmt` Go: `%` asli digandakan, penandanya jadi `%s`. */
function polaGo(fn: (...isi: string[]) => string, jumlah = 1): string {
  const penanda = Array.from({ length: jumlah }, (_, i) => `\u0000${i}\u0000`);
  let hasil = fn(...penanda).replace(/%/g, "%%");
  for (const p of penanda) {
    if (!hasil.includes(p)) throw new Error(`pola Go: penanda hilang dari ${JSON.stringify(hasil)}`);
    hasil = hasil.replace(p, "%s");
  }
  return hasil;
}

/**
 * Kalimat TS yang menerima ANGKA (diformat `Intl` di dalamnya) → pola Go.
 * Angka penanda diformat dengan formatter yang SAMA (`Intl.NumberFormat
 * ("id-ID")`), dan bentuk terformatnya yang diganti `%s` — pemformatan angka
 * di Go memakai pemisah yang juga dibangkitkan di sini (`NumberGroupSeparatorID`
 * dst.).
 */
function polaGoAngka(fn: (n: number) => string): string {
  const PENANDA = 987654.3;
  const teks = new Intl.NumberFormat("id-ID").format(PENANDA);
  const kalimat = fn(PENANDA);
  if (!kalimat.includes(teks)) throw new Error(`pola Go: angka penanda hilang dari ${kalimat}`);
  return kalimat.replace(/%/g, "%%").replace(teks.replace(/%/g, "%%"), "%s");
}

/** Bagian-bagian `Intl.NumberFormat("id-ID")`: pemisah ribuan, desimal, tanda minus. */
function bagianAngkaId(): { group: string; decimal: string; minus: string } {
  const parts = new Intl.NumberFormat("id-ID").formatToParts(-1234.5);
  const ambil = (t: string) => {
    const v = parts.find((p) => p.type === t)?.value;
    if (v === undefined) throw new Error(`Intl id-ID tanpa bagian ${t}`);
    return v;
  };
  return { group: ambil("group"), decimal: ambil("decimal"), minus: ambil("minusSign") };
}

/**
 * `comparePercentText` → dua pola Go: untuk persen POSITIF (berawalan "+") dan
 * selainnya (nol, negatif, −0). Angka penanda diformat `toLocaleString
 * ("id-ID")` — formatter yang SAMA dengan fungsinya — dan bentuk terformatnya,
 * tanda minus ikut, yang menjadi `%s` (Go: `jscompat.FormatNumberID`).
 */
function polaPersenGo(): { positive: string; other: string } {
  const pola = (n: number) => {
    const angka = n.toLocaleString("id-ID");
    const kalimat = comparePercentText(n);
    if (!kalimat.includes(angka)) throw new Error(`pola Go: angka penanda hilang dari ${kalimat}`);
    return kalimat.replace(/%/g, "%%").replace(angka, "%s");
  };
  return { positive: pola(987654.3), other: pola(-987654.3) };
}

/**
 * Tabel `localeCompare` untuk karakter ASCII cetak (0x20–0x7E), dari
 * `Intl.Collator` runtime ini — collator yang dipakai `compareLines`
 * (`String.prototype.localeCompare`, lokal bawaan proses).
 *
 * Bentuknya KELOMPOK berurutan: karakter dalam satu kelompok setara pada
 * tingkat dasar (`sensitivity: "base"` — huruf besar/kecil), dan urutan di
 * dalam kelompok adalah urutan tersiernya. Itu cukup bagi Go untuk meniru
 * perbandingan bertingkat UCA atas teks ASCII (`jscompat.LocaleCompare`).
 */
function tabelLocaleCompare(): string[] {
  const huruf: string[] = [];
  for (let c = 0x20; c < 0x7f; c += 1) huruf.push(String.fromCharCode(c));
  const urut = [...huruf].sort((a, b) => a.localeCompare(b));
  const dasar = new Intl.Collator(undefined, { sensitivity: "base" });
  const kelompok: string[][] = [];
  for (const h of urut) {
    const akhir = kelompok[kelompok.length - 1];
    if (akhir && dasar.compare(akhir[0]!, h) === 0) akhir.push(h);
    else kelompok.push([h]);
  }
  /* Tertib total yang diandaikan Go: tidak ada dua karakter yang setara
     sepenuhnya, dan setiap kelompok diurutkan tegas. */
  for (const k of kelompok) {
    for (let i = 1; i < k.length; i += 1) {
      if (k[i - 1]!.localeCompare(k[i]!) >= 0) throw new Error(`localeCompare: ${k.join("")} tidak tertib`);
    }
  }
  return kelompok.map((k) => k.join(""));
}

/** Nama bulan id-ID dari `Intl` — formatter yang SAMA dengan `formatDate`. */
function namaBulan(): string[] {
  const f = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2026, m, 15))));
}

function bangkitkanTataLetakGo(k: KontrakAkuntansi): string {
  const kepala = `DIBANGKITKAN DARI \`src/lib/statement-layout.ts\`, \`src/lib/report-export.ts\`,
\`src/lib/cost-centers.ts\`, \`@sai/core/constants\`, \`@sai/core/business-date\`, dan
kamus \`id.json\` — JANGAN DISUNTING TANGAN.

Jalankan \`bun run contract:gen\` setelah mengubah salah satunya, dan commit
hasilnya bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila
berkas ini basi (penjaga \`tests/contract-jobs.test.ts\`).

Pembacanya \`internal/document\`: lembar sebar yang dihasilkan Go untuk laporan
ber-\`engine: "go"\` di \`src/lib/report-engine.ts\`. Kalimat & rupa di sini
wajib sama dengan lembar yang dihasilkan \`src/lib/xlsx.ts\` — dibuktikan
\`bun run parity:trial-balance-xlsx\`.`
    .split("\n")
    .map((b) => `// ${b}`.trimEnd())
    .join("\n");

  const q = (v: string) => JSON.stringify(v);
  const g = SHEET_BANNER_STYLE;
  const konst = ratakan([
    { kiri: "CompanyNameFallback", kanan: `= ${q(COMPANY_NAME)}` },
    { kiri: "TrialBalanceSheetName", kanan: `= ${q(SHEET_NAMES["trial-balance"])}` },
    { kiri: "TrialBalanceTitle", kanan: `= ${q(STATEMENT_TITLES["trial-balance"])}` },
    { kiri: "TrialBalanceEmptyLabel", kanan: `= ${q(TRIAL_BALANCE_PRINT_LABELS.empty)}` },
    { kiri: "TrialBalanceTotalLabel", kanan: `= ${q(TRIAL_BALANCE_PRINT_LABELS.total)}` },
    { kiri: "TrialBalanceNoteBalanced", kanan: `= ${q(trialBalanceBalanceNote(true))}` },
    { kiri: "TrialBalanceNoteUnbalanced", kanan: `= ${q(trialBalanceBalanceNote(false))}` },
    { kiri: "AsOfPeriodFormat", kanan: `= ${q(polaGo(asOfPeriodLabel))}` },
    { kiri: "SheetPrintedFormat", kanan: `= ${q(polaGo(sheetPrintedLine))}` },
    { kiri: "MoneyNumberFormat", kanan: `= ${q(IDR_NUMBER_FORMAT)}` },
    { kiri: "SheetCompanyFontSize", kanan: `= ${g.companyFontSize}` },
    { kiri: "SheetTitleFontSize", kanan: `= ${g.titleFontSize}` },
    { kiri: "SheetPrintedFontSize", kanan: `= ${g.printedFontSize}` },
    { kiri: "SheetMutedARGB", kanan: `= ${q(g.mutedArgb)}` },
    { kiri: "SheetHeaderFillARGB", kanan: `= ${q(g.headerFillArgb)}` },
    { kiri: "SheetHeaderFontARGB", kanan: `= ${q(g.headerFontArgb)}` },
  ]);

  /* Laba Rugi & Neraca (tahap 1d, `go-parity`). */
  const isl = INCOME_STATEMENT_PRINT_LABELS;
  const bsl = BALANCE_SHEET_PRINT_LABELS;
  const angka = bagianAngkaId();
  const persen = polaPersenGo();
  const konstLaporan2 = ratakan([
    { kiri: "BusinessTimeZone", kanan: `= ${q(BUSINESS_TIME_ZONE)}` },
    { kiri: "PeriodRangeFormat", kanan: `= ${q(polaGo(periodRangeLabel, 2))}` },
    { kiri: "CostCenterPeriodSuffixFormat", kanan: `= ${q(polaGo(costCenterPeriodSuffix))}` },
    { kiri: "CostCenterDisplayFormat", kanan: `= ${q(polaGo(costCenterDisplayName, 2))}` },
    { kiri: "CostCenterUnassigned", kanan: `= ${q(UNASSIGNED_COST_CENTER)}` },
    { kiri: "CostCenterUnassignedLabel", kanan: `= ${q(COST_CENTER_UNASSIGNED_PRINT_LABEL)}` },
    { kiri: "NumberGroupSeparatorID", kanan: `= ${q(angka.group)}` },
    { kiri: "NumberDecimalSeparatorID", kanan: `= ${q(angka.decimal)}` },
    { kiri: "NumberMinusSignID", kanan: `= ${q(angka.minus)}` },
    { kiri: "IncomeStatementSheetName", kanan: `= ${q(SHEET_NAMES["income-statement"])}` },
    { kiri: "IncomeStatementTitle", kanan: `= ${q(STATEMENT_TITLES["income-statement"])}` },
    { kiri: "IncomeStatementSalesLabel", kanan: `= ${q(isl.sales)}` },
    { kiri: "IncomeStatementCogsLabel", kanan: `= ${q(isl.cogs)}` },
    { kiri: "IncomeStatementOperatingExpenseLabel", kanan: `= ${q(isl.operatingExpense)}` },
    { kiri: "IncomeStatementOtherIncomeLabel", kanan: `= ${q(isl.otherIncome)}` },
    { kiri: "IncomeStatementOtherExpenseLabel", kanan: `= ${q(isl.otherExpense)}` },
    { kiri: "IncomeStatementSectionTotalFormat", kanan: `= ${q(polaGo(isl.sectionTotal))}` },
    { kiri: "IncomeStatementGrossProfitLabel", kanan: `= ${q(isl.grossProfit)}` },
    { kiri: "IncomeStatementOperatingProfitLabel", kanan: `= ${q(isl.operatingProfit)}` },
    { kiri: "IncomeStatementNetIncomeLabel", kanan: `= ${q(isl.netIncome)}` },
    { kiri: "IncomeStatementEmptyLabel", kanan: `= ${q(isl.empty)}` },
    { kiri: "IncomeStatementGrossMarginFormat", kanan: `= ${q(polaGoAngka(isl.grossMargin))}` },
    { kiri: "IncomeStatementResultProfit", kanan: `= ${q(isl.result(true))}` },
    { kiri: "IncomeStatementResultLoss", kanan: `= ${q(isl.result(false))}` },
    { kiri: "BalanceSheetSheetName", kanan: `= ${q(SHEET_NAMES["balance-sheet"])}` },
    { kiri: "BalanceSheetTitle", kanan: `= ${q(STATEMENT_TITLES["balance-sheet"])}` },
    { kiri: "BalanceSheetAssetsLabel", kanan: `= ${q(bsl.assets)}` },
    { kiri: "BalanceSheetLiabilitiesLabel", kanan: `= ${q(bsl.liabilities)}` },
    { kiri: "BalanceSheetEquityLabel", kanan: `= ${q(bsl.equity)}` },
    { kiri: "BalanceSheetSectionTotalFormat", kanan: `= ${q(polaGo(bsl.sectionTotal))}` },
    { kiri: "BalanceSheetCurrentNetIncomeLabel", kanan: `= ${q(bsl.currentNetIncome)}` },
    { kiri: "BalanceSheetEmptyLabel", kanan: `= ${q(bsl.empty)}` },
    { kiri: "BalanceSheetTotalAssetsLabel", kanan: `= ${q(bsl.totalAssets)}` },
    { kiri: "BalanceSheetTotalLiabilitiesEquityLabel", kanan: `= ${q(bsl.totalLiabilitiesEquity)}` },
    { kiri: "BalanceSheetNoteBalanced", kanan: `= ${q(balanceSheetBalanceNote(true))}` },
    { kiri: "BalanceSheetNoteUnbalanced", kanan: `= ${q(balanceSheetBalanceNote(false))}` },
    { kiri: "ComparePeriodFormat", kanan: `= ${q(polaGo(comparePeriodLabel, 2))}` },
    { kiri: "CompareChangeHeader", kanan: `= ${q(STATEMENT_COMPARE_CHANGE_HEADER)}` },
    { kiri: "CompareChangeWidth", kanan: `= ${COMPARE_CHANGE_WIDTH}` },
    { kiri: "ComparePercentPositiveFormat", kanan: `= ${q(persen.positive)}` },
    { kiri: "ComparePercentFormat", kanan: `= ${q(persen.other)}` },
  ]);
  const kolomIs = INCOME_STATEMENT_COLUMNS.map(
    (c) => `\t{Header: ${q(INCOME_STATEMENT_HEADERS[c])}, Width: ${INCOME_STATEMENT_WIDTHS[c]}},`
  ).join("\n");
  /* Arus Kas (tahap 1d, `go-parity`). */
  const cfl = CASH_FLOW_PRINT_LABELS;
  const konstArusKas = ratakan([
    { kiri: "CashFlowSheetName", kanan: `= ${q(SHEET_NAMES["cash-flow"])}` },
    { kiri: "CashFlowTitle", kanan: `= ${q(STATEMENT_TITLES["cash-flow"])}` },
    { kiri: "CashFlowOpeningLabel", kanan: `= ${q(cfl.opening)}` },
    { kiri: "CashFlowClosingLabel", kanan: `= ${q(cfl.closing)}` },
    { kiri: "CashFlowTotalLabel", kanan: `= ${q(cfl.total)}` },
    { kiri: "CashFlowEmptyLabel", kanan: `= ${q(cfl.empty)}` },
    { kiri: "CashFlowSubtotalFormat", kanan: `= ${q(polaGo(cfl.subtotal))}` },
    { kiri: "CashFlowNoteReconciled", kanan: `= ${q(cashFlowReconciliationNote(true))}` },
    { kiri: "CashFlowNoteUnreconciled", kanan: `= ${q(cashFlowReconciliationNote(false))}` },
  ]);
  /* Nama kelompok CETAK — `labels.group(category, label)` lembar sebar TS
     memulangkan `label` = `CASH_FLOW_CATEGORY_LABELS[category]`. Dipanggil,
     bukan dibaca, supaya penimpa `group` kelak ikut sampai ke Go. */
  const labelKelompok = ratakan(
    /* Kelompok dari YAML, bukan dari bangkitan TS: berkas ini dibangkitkan
       dalam putaran yang SAMA dengan bangkitan itu. */
    k.cash_flow.categories.map((c) => ({
      kiri: `CashFlowCategory${pengenalGo(c)}:`,
      kanan: `${q(cfl.group(c as CashFlowCategoryId, CASH_FLOW_CATEGORY_LABELS[c as CashFlowCategoryId]))},`,
    }))
  );
  const kolomCf = CASH_FLOW_COLUMNS.map(
    (c) => `\t{Header: ${q(CASH_FLOW_HEADERS[c])}, Width: ${CASH_FLOW_WIDTHS[c]}},`
  ).join("\n");
  const kolomBs = BALANCE_SHEET_COLUMNS.map(
    (c) => `\t{Header: ${q(BALANCE_SHEET_HEADERS[c])}, Width: ${BALANCE_SHEET_WIDTHS[c]}},`
  ).join("\n");

  /* Register mesin → Go: id laporan yang PUNYA implementasi Go, dan himpunan
     yang berkasnya hari ini milik Go. Pelari Go menolak pekerjaan untuk
     laporan di luar himpunan kedua — register yang dikembalikan ke
     `go-parity` tidak boleh meninggalkan pelari yang tetap menghasilkan
     berkas dari antrean lama. */
  const idLaporan = Object.keys(REPORT_ENGINES).sort();
  const konstLaporan = ratakan(
    idLaporan.map((id) => ({ kiri: `Report${pengenalGo(id)}`, kanan: `= ${q(id)}` }))
  );
  /* Lewat `ratakan`: begitu himpunan ini berisi lebih dari satu laporan,
     `gofmt` meratakan nilainya — keluaran tanpa perataan lolos selama isinya
     satu baris, lalu jatuh di `go:lint` pada laporan kedua (22 Okt 2026). */
  const milikGo = ratakan(
    idLaporan
      .filter((id) => REPORT_ENGINES[id as keyof typeof REPORT_ENGINES]?.engine === "go")
      .map((id) => ({ kiri: `Report${pengenalGo(id)}:`, kanan: "true," }))
  );

  const kolom = TRIAL_BALANCE_COLUMNS.map(
    (c) => `\t{Header: ${q(TRIAL_BALANCE_HEADERS[c])}, Width: ${TRIAL_BALANCE_WIDTHS[c]}},`
  ).join("\n");

  return `${kepala}

package contract

// ReportColumn adalah satu kolom lembar sebar: judul dan lebar (karakter).
type ReportColumn struct {
\tHeader string
\tWidth  float64
}

// Kalimat cetak, format angka, dan rupa kepala lembar. Pola ber-%s disusun
// dengan fmt.Sprintf; nilainya dibangkitkan dengan memanggil fungsi TS-nya.
const (
${konst}
)

// Laba Rugi & Neraca (tahap 1d): kalimat cetak, pola label periode & pusat
// biaya, pemisah angka id-ID, dan zona waktu bisnis — semuanya dari modul TS
// yang sama dengan layar, PDF, dan lembar sebar TS.
const (
${konstLaporan2}
)

// Arus Kas (tahap 1d): kalimat cetak & anotasi rekonsiliasi dari
// \`CASH_FLOW_PRINT_LABELS\` / \`cashFlowReconciliationNote\`.
const (
${konstArusKas}
)

// CashFlowCategoryLabels: nama kelompok Arus Kas di DOKUMEN CETAK
// (\`CASH_FLOW_CATEGORY_LABELS\` lewat \`CASH_FLOW_PRINT_LABELS.group\`).
var CashFlowCategoryLabels = map[CashFlowCategory]string{
${labelKelompok}
}

// Id laporan (katalog TS) yang punya implementasi Go — kunci register
// src/lib/report-engine.ts.
const (
${konstLaporan}
)

// GoEngineReports: laporan yang BERKAS-nya hari ini dihasilkan Go
// (\`engine: "go"\`). Pelari menolak pekerjaan untuk laporan di luar himpunan ini.
var GoEngineReports = map[string]bool{
${milikGo}
}

// TrialBalanceColumns: judul (TRIAL_BALANCE_HEADERS) dan lebar
// (TRIAL_BALANCE_WIDTHS) kolom Neraca Saldo, dalam urutan TRIAL_BALANCE_COLUMNS.
var TrialBalanceColumns = []ReportColumn{
${kolom}
}

// IncomeStatementColumns: judul (INCOME_STATEMENT_HEADERS) dan lebar
// (INCOME_STATEMENT_WIDTHS) kolom Laba Rugi satu periode.
var IncomeStatementColumns = []ReportColumn{
${kolomIs}
}

// BalanceSheetColumns: judul (BALANCE_SHEET_HEADERS) dan lebar
// (BALANCE_SHEET_WIDTHS) kolom Neraca satu tanggal.
var BalanceSheetColumns = []ReportColumn{
${kolomBs}
}

// CashFlowColumns: judul (CASH_FLOW_HEADERS) dan lebar (CASH_FLOW_WIDTHS)
// kolom Arus Kas, dalam urutan CASH_FLOW_COLUMNS.
var CashFlowColumns = []ReportColumn{
${kolomCf}
}

// MonthNamesID: nama bulan id-ID dari Intl — formatter yang dipakai formatDate.
var MonthNamesID = [12]string{
${namaBulan().map((m) => `\t${q(m)},`).join("\n")}
}

// ComparisonModes: kosakata \`?compare=\` (COMPARISON_MODES,
// src/lib/statement-compare.ts) — kolom pembanding Laba Rugi & Neraca (#557).
var ComparisonModes = map[string]bool{
${COMPARISON_MODES.map((m) => `\t${`${q(m)}:`.padEnd(Math.max(...COMPARISON_MODES.map((x) => q(x).length)) + 1)} true,`).join("\n")}
}

// LocaleCompareASCII: urutan \`localeCompare\` atas ASCII cetak, dari
// Intl.Collator runtime pembangkit — kelompok setara-dasar (huruf besar/kecil),
// berurutan; di dalam kelompok, urutan tersier. Dibaca jscompat.LocaleCompare.
var LocaleCompareASCII = []string{
${tabelLocaleCompare().map((k) => `\t${q(k)},`).join("\n")}
}
`;
}

// ═══ Tata letak Umur Piutang & Umur Utang (tahap 1d) ═══════════════════════
//
// Sumbernya `statement-layout.ts` (kalimat, judul, label ember & status),
// `report-export.ts` (lebar), dan `report-catalog.ts` (kolom yang bisa dipilih
// `?cols=` — `resolveColumns`). Kalimat ber-angka dibangkitkan dengan
// MEMANGGIL fungsinya dengan angka penanda, seperti `polaGo`.

/** Kalimat TS yang menerima BILANGAN BULAT (`${n}`, bukan Intl) → pola `%d`. */
function polaGoBulat(fn: (n: number) => string): string {
  const PENANDA = 987654321;
  const kalimat = fn(PENANDA);
  if (!kalimat.includes(String(PENANDA))) throw new Error(`pola Go: angka penanda hilang dari ${kalimat}`);
  return kalimat.replace(/%/g, "%%").replace(String(PENANDA), "%d");
}

function bangkitkanTataLetakUmurGo(k: KontrakAkuntansi): string {
  const kepala = `DIBANGKITKAN DARI \`src/lib/statement-layout.ts\`, \`src/lib/report-export.ts\`,
\`src/lib/report-catalog.ts\`, dan \`contract/accounting.yaml\` — JANGAN DISUNTING TANGAN.

Jalankan \`bun run contract:gen\` setelah mengubah salah satunya, dan commit
hasilnya bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila
berkas ini basi (penjaga \`tests/contract-jobs.test.ts\`).

Pembacanya \`internal/ledgerread/aging.go\` (kosakata status pembayaran) dan
\`internal/document/aging.go\` (lembar sebar Umur Piutang & Umur Utang). Isi
lembarnya wajib sama dengan \`buildAgingSheet\` — dibuktikan
\`bun run parity:receivables-xlsx\` dan \`bun run parity:payables-xlsx\`.`
    .split("\n")
    .map((b) => `// ${b}`.trimEnd())
    .join("\n");
  const q = (v: string) => JSON.stringify(v);

  /* Kolom katalog WAJIB = AGING_COLUMNS, berurutan: Go menyaring kolom
     tampil (`resolveColumns` → `agingColumns`) dari satu daftar ini. */
  const kolom = (kind: AgingKind) => {
    const def = REPORTS.find((r) => r.id === kind);
    const spesifikasi = def?.columns ?? [];
    const ids = spesifikasi.map((c) => c.id);
    if (ids.join(",") !== AGING_COLUMNS.join(",")) {
      throw new Error(`kolom katalog ${kind} (${ids.join(",")}) ≠ AGING_COLUMNS (${AGING_COLUMNS.join(",")})`);
    }
    const judul = agingHeaders(kind);
    return spesifikasi
      .map(
        (c) =>
          `\t{ID: ${q(c.id)}, Header: ${q(judul[c.id as keyof typeof judul])}, ` +
          `Width: ${AGING_WIDTHS[c.id as keyof typeof AGING_WIDTHS]}, Fixed: ${c.fixed === true}, ` +
          `DefaultOn: ${c.defaultOn !== false}},`
      )
      .join("\n");
  };

  const kunciEmber = k.aging.buckets.map((b) => b.key);
  const kunciLabel = Object.keys(AGING_BUCKET_PRINT_LABELS);
  if (kunciLabel.join(",") !== kunciEmber.join(",")) {
    throw new Error(`AGING_BUCKET_PRINT_LABELS (${kunciLabel.join(",")}) ≠ aging.buckets (${kunciEmber.join(",")})`);
  }
  const statusBayar = Object.entries(PAYMENT_STATUS_PRINT_LABELS);

  const konst = ratakan([
    { kiri: "ReceivablesSheetName", kanan: `= ${q(SHEET_NAMES.receivables)}` },
    { kiri: "ReceivablesTitle", kanan: `= ${q(STATEMENT_TITLES.receivables)}` },
    { kiri: "PayablesSheetName", kanan: `= ${q(SHEET_NAMES.payables)}` },
    { kiri: "PayablesTitle", kanan: `= ${q(STATEMENT_TITLES.payables)}` },
    { kiri: "AgingSummaryLabel", kanan: `= ${q(AGING_SHEET_LABELS.summary)}` },
    { kiri: "AgingDetailsLabel", kanan: `= ${q(AGING_SHEET_LABELS.details)}` },
    { kiri: "AgingTotalLabel", kanan: `= ${q(AGING_SHEET_LABELS.total)}` },
    { kiri: "AgingNoDueDate", kanan: `= ${q(AGING_SHEET_LABELS.noDueDate)}` },
    { kiri: "AgingIssueAgeFormat", kanan: `= ${q(polaGoBulat(agingIssueAgeText))}` },
    { kiri: "AgingEmptyLabel", kanan: `= ${q(EXPORT_EMPTY.unpaidDocuments)}` },
    { kiri: "AgingUndatedNote", kanan: `= ${q(AGING_UNDATED_NOTE)}` },
    { kiri: "AgingUnresolvedNoteFormat", kanan: `= ${q(polaGoBulat(unresolvedNote))}` },
    { kiri: "AgingPartyColumn", kanan: `= ${q(AGING_COLUMNS[0])}` },
    /* \`RECEIVABLES_NO_CUSTOMER\` (receivables.ts) — faktur tanpa pelanggan. */
    { kiri: "PayablesDocumentNoFormat", kanan: `= ${q(polaGoBulat(payableDocumentNo))}` },
    { kiri: "ReceivablesNoCustomer", kanan: `= ${q(PARTY_RECAP_NO_PARTY["sales-by-customer"])}` },
  ]);

  return `${kepala}

package contract

// AgingColumn adalah satu kolom lembar Umur Piutang/Utang: id katalog (nilai
// \`?cols=\`), judul, lebar, dan aturan pilihnya (\`resolveColumns\`).
type AgingColumn struct {
\tID        string
\tHeader    string
\tWidth     float64
\tFixed     bool
\tDefaultOn bool
}

// Kalimat cetak lembar Umur Piutang/Utang. Pola ber-%d disusun fmt.Sprintf.
const (
${konst}
)

// ReceivablesColumns: kolom Umur Piutang dalam urutan AGING_COLUMNS.
var ReceivablesColumns = []AgingColumn{
${kolom("receivables")}
}

// PayablesColumns: kolom Umur Utang dalam urutan AGING_COLUMNS.
var PayablesColumns = []AgingColumn{
${kolom("payables")}
}

// AgingBucketLabels: label cetak tiap ember (AGING_BUCKET_PRINT_LABELS).
var AgingBucketLabels = map[AgingBucket]string{
${ratakan(k.aging.buckets.map((b) => ({ kiri: `AgingBucket${pengenalGo(b.key)}:`, kanan: `${q(AGING_BUCKET_PRINT_LABELS[b.key as keyof typeof AGING_BUCKET_PRINT_LABELS])},` })))}
}

// PaymentStatus: status pembayaran turunan (\`deriveStatus\`, receivables.ts) —
// dihitung saat dibaca, tidak pernah disimpan.
type PaymentStatus string

const (
${ratakan(statusBayar.map(([s]) => ({ kiri: `PaymentStatus${pengenalGo(s)}`, kanan: `PaymentStatus = ${q(s)}` })))}
)

// PaymentStatusLabels: label cetak tiap status (PAYMENT_STATUS_PRINT_LABELS).
var PaymentStatusLabels = map[PaymentStatus]string{
${ratakan(statusBayar.map(([s, l]) => ({ kiri: `PaymentStatus${pengenalGo(s)}:`, kanan: `${q(l)},` })))}
}
`;
}

// ═══ contract/db-instances.yaml (tahap 4) ══════════════════════════════════
//
// Sumber KEEMPAT: bentuk instans basis data. Pembacanya penyelesai URL buku PT
// (`@sai/db/company-url`) dan jalur `tenant` Go yang mencadangkan tiap
// instans. Bangkitan TS-nya hidup di `packages/db` — bukan `packages/core` —
// sebab pembacanya di `@sai/db`, dan arah paket tidak mengizinkan `db` →
// `core`.

const SUMBER_INSTANS = join(AKAR, "contract", "db-instances.yaml");
const TUJUAN_INSTANS_TS = join(AKAR, "packages", "db", "src", "generated", "db-instances.ts");
const TUJUAN_INSTANS_GO = join(
  AKAR,
  "services",
  "integrator",
  "internal",
  "contract",
  "dbinstances_gen.go"
);

interface KontrakInstans {
  version: number;
  default_label: string;
  key_pattern: string;
  url_env_var: { prefix: string; suffix: string; pattern: string };
  backup: { instance_object_prefix: string };
}

/**
 * Pola yang artinya SAMA di RegExp JS dan RE2 Go: berjangkar penuh, tanpa
 * lookaround/backreference/kelas Unicode. Pola di luar subset ini ditolak
 * di sini — ia bisa mengompilasi di satu bahasa dan berarti lain di yang lain.
 */
function polaLintasBahasa(nama: string, pola: unknown, salah: string[]): void {
  if (typeof pola !== "string" || !pola.startsWith("^") || !pola.endsWith("$")) {
    salah.push(`\`${nama}\` wajib string berjangkar ^…$`);
    return;
  }
  /* `/` juga ditolak: pola ditulis sebagai literal RegExp TS, dan `.source`-nya
     wajib sama byte demi byte dengan YAML, Go, dan CHECK 0009. */
  if (/\(\?|\\[1-9pPkbB]|\\u|\//.test(pola)) {
    salah.push(`\`${nama}\` memakai konstruksi yang tidak sama di JS dan RE2: ${pola}`);
    return;
  }
  try {
    new RegExp(pola);
  } catch (e) {
    salah.push(`\`${nama}\` bukan regex sah: ${String(e)}`);
  }
}

function bacaInstans(): KontrakInstans {
  const k = load(readFileSync(SUMBER_INSTANS, "utf8")) as KontrakInstans;
  const salah: string[] = [];
  if (k.version !== 1) salah.push("`version` harus 1");
  polaLintasBahasa("key_pattern", k.key_pattern, salah);
  polaLintasBahasa("url_env_var.pattern", k.url_env_var?.pattern, salah);
  if (salah.length === 0) {
    const kunci = new RegExp(k.key_pattern);
    const env = new RegExp(k.url_env_var.pattern);
    /* Label bawaan berbentuk kunci, dan itu sebabnya ia ditolak eksplisit
       sebagai kunci baris. Label yang TIDAK berbentuk kunci akan membuat
       penolakan eksplisit itu kode mati yang terlihat menjaga sesuatu. */
    if (!kunci.test(k.default_label)) {
      salah.push(`\`default_label\` (${k.default_label}) tidak berbentuk kunci`);
    }
    const { prefix, suffix } = k.url_env_var;
    if (!/^[A-Z][A-Z0-9_]*$/.test(prefix ?? "") || !/^[A-Z0-9_]+$/.test(suffix ?? "")) {
      salah.push("`url_env_var.prefix`/`suffix` bukan nama env var");
    } else if (!env.test(`${prefix}${k.default_label.toUpperCase()}${suffix}`)) {
      /* Nama yang DISARANKAN (prefix + KUNCI + suffix) wajib lolos pola —
         CLI yang menyarankan nama yang kemudian ditolak adalah jebakan. */
      salah.push("nama yang disarankan (prefix + KUNCI + suffix) tidak lolos `url_env_var.pattern`");
    }
  }
  const awalan = k.backup?.instance_object_prefix;
  if (typeof awalan !== "string" || !/^[a-z][a-z0-9_]*\/$/.test(awalan)) {
    salah.push("`backup.instance_object_prefix` wajib `nama/` huruf kecil");
  }
  if (salah.length > 0) {
    console.error("✗ contract/db-instances.yaml tidak sah:");
    for (const s of salah) console.error(`  • ${s}`);
    process.exit(1);
  }
  return k;
}

const JANGAN_SUNTING_INSTANS = (versi: number) => `DIBANGKITKAN DARI \`contract/db-instances.yaml\` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan \`bun run contract:gen\` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila
 * berkas ini basi, dan penjaga \`tests/contract-db-instances.test.ts\` memanggilnya.
 *
 * Kontrak instans basis data versi ${versi}.`;

function bangkitkanInstans(k: KontrakInstans): string {
  const q = (v: string) => JSON.stringify(v);
  return `/**
 * ${JANGAN_SUNTING_INSTANS(k.version)}
 *
 * Dibaca \`company-url.ts\` (penyelesai URL buku PT) dan
 * \`scripts/prove-backup-restore.ts\`; cermin Go-nya dibaca jalur \`tenant\`.
 */

/** Label instans bawaan di log, laporan fan-out, argumen CLI, dan cadangan. */
export const DEFAULT_DB_INSTANCE_LABEL = ${q(k.default_label)};

/** Bentuk \`db_instances.key\` — sama dengan CHECK migration kendali 0009. */
export const DB_INSTANCE_KEY_PATTERN = /${k.key_pattern}/;

/** Bentuk \`db_instances.url_env_var\` — sama dengan CHECK migration kendali 0009. */
export const DB_INSTANCE_URL_ENV_PATTERN = /${k.url_env_var.pattern}/;

/** Nama env var yang disarankan = PREFIX + KUNCI (huruf besar) + SUFFIX. */
export const DB_INSTANCE_URL_ENV_PREFIX = ${q(k.url_env_var.prefix)};
export const DB_INSTANCE_URL_ENV_SUFFIX = ${q(k.url_env_var.suffix)};

/** Direktori objek instans tambahan di dalam putaran cadangan. */
export const BACKUP_INSTANCE_OBJECT_PREFIX = ${q(k.backup.instance_object_prefix)};
`;
}

function bangkitkanInstansGo(k: KontrakInstans): string {
  const kepala = JANGAN_SUNTING_INSTANS(k.version)
    .split("\n")
    .map((b) => `// ${b.replace(/^ \* ?/, "")}`.trimEnd())
    .join("\n");
  /* Pola ditulis sebagai raw string Go: tanpa lolos-ganda, jadi teksnya sama
     byte demi byte dengan YAML dan dengan \`.source\` di TS. */
  const raw = (v: string) => {
    if (v.includes("`")) throw new Error(`pola memuat backtick: ${v}`);
    return `\`${v}\``;
  };
  const q = (v: string) => JSON.stringify(v);
  return `${kepala}

package contract

// DBInstanceDefaultLabel: label instans bawaan, yang tidak punya baris
// \`db_instances\`. Berbentuk kunci, dan karena itu ditolak eksplisit sebagai
// kunci baris.
const DBInstanceDefaultLabel = ${q(k.default_label)}

// DBInstanceKeyPattern: bentuk \`db_instances.key\` (CHECK kendali 0009).
const DBInstanceKeyPattern = ${raw(k.key_pattern)}

// DBInstanceURLEnvPattern: bentuk \`db_instances.url_env_var\` (CHECK kendali 0009).
const DBInstanceURLEnvPattern = ${raw(k.url_env_var.pattern)}

// Nama env var yang disarankan = prefix + KUNCI (huruf besar) + suffix.
const (
	DBInstanceURLEnvPrefix = ${q(k.url_env_var.prefix)}
	DBInstanceURLEnvSuffix = ${q(k.url_env_var.suffix)}
)

// BackupInstanceObjectPrefix: direktori objek instans tambahan di dalam
// putaran cadangan.
const BackupInstanceObjectPrefix = ${q(k.backup.instance_object_prefix)}
`;
}

const kontrak = baca();
const kontrakAkuntansi = bacaAkuntansi();
const kontrakInstans = bacaInstans();

const berkas: { jalur: string; isi: string }[] = [
  { jalur: TUJUAN_TS, isi: bangkitkan(kontrak) },
  { jalur: TUJUAN_ANGKA, isi: bangkitkanAngka(kontrak) },
  { jalur: TUJUAN_GO, isi: bangkitkanGo(kontrak) },
  { jalur: TUJUAN_AKUNTANSI_TS, isi: bangkitkanAkuntansi(kontrakAkuntansi) },
  { jalur: TUJUAN_AKUNTANSI_GO, isi: bangkitkanAkuntansiGo(kontrakAkuntansi) },
  { jalur: TUJUAN_TATA_LETAK_GO, isi: bangkitkanTataLetakGo(kontrakAkuntansi) },
  { jalur: TUJUAN_TATA_LETAK_UMUR_GO, isi: bangkitkanTataLetakUmurGo(kontrakAkuntansi) },
  { jalur: TUJUAN_INSTANS_TS, isi: bangkitkanInstans(kontrakInstans) },
  { jalur: TUJUAN_INSTANS_GO, isi: bangkitkanInstansGo(kontrakInstans) },
];

if (CEK) {
  const basi: string[] = [];
  for (const { jalur, isi } of berkas) {
    if (!existsSync(jalur)) {
      basi.push(`${jalur} belum ada`);
      continue;
    }
    if (readFileSync(jalur, "utf8") !== isi) basi.push(`${jalur} BASI`);
  }
  if (basi.length > 0) {
    console.error("✗ berkas bangkitan tidak sinkron dengan contract/*.yaml:");
    for (const b of basi) console.error(`  • ${b}`);
    console.error("  Jalankan `bun run contract:gen` lalu commit hasilnya.");
    process.exit(1);
  }
  console.log(`✓ kontrak dan ${berkas.length} berkas bangkitannya sinkron.`);
  process.exit(0);
}

for (const { jalur, isi } of berkas) {
  mkdirSync(dirname(jalur), { recursive: true });
  writeFileSync(jalur, isi);
  console.log(`✓ ${jalur}`);
}
console.log(
  `  ${Object.keys(kontrak.kinds).length} kind · ${Object.keys(kontrak.lanes).length} jalur · ` +
    `${kontrak.statuses.length} status · ${KUNCI_ANGKA.length} angka · ` +
    `${kontrakAkuntansi.account_types.length} tipe akun`
);
