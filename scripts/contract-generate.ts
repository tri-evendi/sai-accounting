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
import idDictionary from "@sai/core/i18n/dictionaries/id.json";
import {
  BALANCE_SHEET_COLUMNS,
  BALANCE_SHEET_HEADERS,
  BALANCE_SHEET_PRINT_LABELS,
  INCOME_STATEMENT_COLUMNS,
  INCOME_STATEMENT_HEADERS,
  INCOME_STATEMENT_PRINT_LABELS,
  SHEET_NAMES,
  STATEMENT_TITLES,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  TRIAL_BALANCE_PRINT_LABELS,
  asOfPeriodLabel,
  balanceSheetBalanceNote,
  costCenterPeriodSuffix,
  periodRangeLabel,
  trialBalanceBalanceNote,
} from "../src/lib/statement-layout";
import {
  BALANCE_SHEET_WIDTHS,
  IDR_NUMBER_FORMAT,
  INCOME_STATEMENT_WIDTHS,
  SHEET_BANNER_STYLE,
  TRIAL_BALANCE_WIDTHS,
  sheetPrintedLine,
} from "../src/lib/report-export";
import { REPORT_ENGINES } from "../src/lib/report-engine";
import { UNASSIGNED_COST_CENTER, costCenterDisplayName } from "../src/lib/cost-centers";

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

const CEK = process.argv.includes("--cek");

interface Lane {
  description: string;
  single_instance: boolean;
}
interface Kind {
  lane: string;
  max_attempts: number;
  description: string;
  writes_ledger?: boolean;
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
      return `  ${nama}: { singleInstance: ${d.single_instance === true} },`;
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
}

export const JOB_LANES: Readonly<Record<JobLane, JobLaneSpec>> = {
${barisLane}
};

/** \`kind\` milik setiap jalur — klausa \`WHERE kind IN (…)\` pekerjanya. */
export const KINDS_BY_LANE: Readonly<Record<JobLane, readonly JobKind[]>> = {
${jalurKind}
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
        kanan: `{SingleInstance: ${d.single_instance === true}},`,
      };
    })
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
}

// JobLanes memetakan setiap jalur ke sifatnya.
var JobLanes = map[JobLane]LaneSpec{
${petaLane}
}

// KindsByLane adalah klausa WHERE kind = ANY(…) milik setiap pelari.
var KindsByLane = map[JobLane][]JobKind{
${petaJalurKind}
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
}

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
 * HANYA konstanta yang punya pembaca Go hari ini (09 §3.5). Label dan saldo
 * normal per tipe tetap di \`src/lib/accounting.ts\`.
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

/** Nama bulan id-ID dari `Intl` — formatter yang SAMA dengan `formatDate`. */
function namaBulan(): string[] {
  const f = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2026, m, 15))));
}

function bangkitkanTataLetakGo(): string {
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
  const konstLaporan2 = ratakan([
    { kiri: "BusinessTimeZone", kanan: `= ${q(BUSINESS_TIME_ZONE)}` },
    { kiri: "PeriodRangeFormat", kanan: `= ${q(polaGo(periodRangeLabel, 2))}` },
    { kiri: "CostCenterPeriodSuffixFormat", kanan: `= ${q(polaGo(costCenterPeriodSuffix))}` },
    { kiri: "CostCenterDisplayFormat", kanan: `= ${q(polaGo(costCenterDisplayName, 2))}` },
    { kiri: "CostCenterUnassigned", kanan: `= ${q(UNASSIGNED_COST_CENTER)}` },
    { kiri: "CostCenterUnassignedLabel", kanan: `= ${q(idDictionary.costCenters.filterUnassigned)}` },
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
  ]);
  const kolomIs = INCOME_STATEMENT_COLUMNS.map(
    (c) => `\t{Header: ${q(INCOME_STATEMENT_HEADERS[c])}, Width: ${INCOME_STATEMENT_WIDTHS[c]}},`
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
  const milikGo = idLaporan
    .filter((id) => REPORT_ENGINES[id as keyof typeof REPORT_ENGINES]?.engine === "go")
    .map((id) => `\tReport${pengenalGo(id)}: true,`)
    .join("\n");

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

// MonthNamesID: nama bulan id-ID dari Intl — formatter yang dipakai formatDate.
var MonthNamesID = [12]string{
${namaBulan().map((m) => `\t${q(m)},`).join("\n")}
}
`;
}

const kontrak = baca();
const kontrakAkuntansi = bacaAkuntansi();

const berkas: { jalur: string; isi: string }[] = [
  { jalur: TUJUAN_TS, isi: bangkitkan(kontrak) },
  { jalur: TUJUAN_ANGKA, isi: bangkitkanAngka(kontrak) },
  { jalur: TUJUAN_GO, isi: bangkitkanGo(kontrak) },
  { jalur: TUJUAN_AKUNTANSI_TS, isi: bangkitkanAkuntansi(kontrakAkuntansi) },
  { jalur: TUJUAN_AKUNTANSI_GO, isi: bangkitkanAkuntansiGo(kontrakAkuntansi) },
  { jalur: TUJUAN_TATA_LETAK_GO, isi: bangkitkanTataLetakGo() },
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
