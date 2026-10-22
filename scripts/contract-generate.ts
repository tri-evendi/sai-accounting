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
import {
  SHEET_NAMES,
  STATEMENT_TITLES,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  TRIAL_BALANCE_PRINT_LABELS,
  asOfPeriodLabel,
  trialBalanceBalanceNote,
} from "../src/lib/statement-layout";
import {
  IDR_NUMBER_FORMAT,
  SHEET_BANNER_STYLE,
  TRIAL_BALANCE_WIDTHS,
  sheetPrintedLine,
} from "../src/lib/report-export";
import { REPORT_ENGINES } from "../src/lib/report-engine";

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
}

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
 * HANYA konstanta yang punya pembaca Go hari ini (09 §3.5). Label, kategori,
 * dan saldo normal per tipe tetap di \`src/lib/accounting.ts\`.
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
function polaGo(fn: (isi: string) => string): string {
  const PENANDA = "\u0000";
  return fn(PENANDA).replace(/%/g, "%%").replace(PENANDA, "%s");
}

/** Nama bulan id-ID dari `Intl` — formatter yang SAMA dengan `formatDate`. */
function namaBulan(): string[] {
  const f = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2026, m, 15))));
}

function bangkitkanTataLetakGo(): string {
  const kepala = `DIBANGKITKAN DARI \`src/lib/statement-layout.ts\`, \`src/lib/report-export.ts\`,
dan \`@sai/core/constants\` — JANGAN DISUNTING TANGAN.

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
