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
}
interface Kontrak {
  version: number;
  statuses: string[];
  lanes: Record<string, Lane>;
  kinds: Record<string, Kind>;
  numbers: Numbers;
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
)
`;
}

const kontrak = baca();

const berkas: { jalur: string; isi: string }[] = [
  { jalur: TUJUAN_TS, isi: bangkitkan(kontrak) },
  { jalur: TUJUAN_ANGKA, isi: bangkitkanAngka(kontrak) },
  { jalur: TUJUAN_GO, isi: bangkitkanGo(kontrak) },
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
    console.error("✗ berkas bangkitan tidak sinkron dengan contract/kinds.yaml:");
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
    `${kontrak.statuses.length} status · ${KUNCI_ANGKA.length} angka`
);
