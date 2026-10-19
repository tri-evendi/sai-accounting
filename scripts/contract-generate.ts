/**
 * BANGKITKAN KONTRAK LINTAS BAHASA (rancangan §3.5) — `contract/` → kode.
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
 */
import { load } from "js-yaml";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();
const SUMBER = join(AKAR, "contract", "kinds.yaml");
const TUJUAN_TS = join(AKAR, "packages", "core", "src", "generated", "job-kinds.ts");

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
interface Kontrak {
  version: number;
  statuses: string[];
  lanes: Record<string, Lane>;
  kinds: Record<string, Kind>;
}

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
 * DIBANGKITKAN DARI \`contract/kinds.yaml\` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan \`bun run contract:gen\` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. \`bun run contract:gen -- --cek\` gagal bila
 * berkas ini basi, dan penjaga \`tests/contract-jobs.test.ts\` memanggilnya.
 *
 * Kontrak versi ${k.version}.
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

const kontrak = baca();
const isi = bangkitkan(kontrak);

if (CEK) {
  if (!existsSync(TUJUAN_TS)) {
    console.error(`✗ ${TUJUAN_TS} belum ada — jalankan \`bun run contract:gen\`.`);
    process.exit(1);
  }
  if (readFileSync(TUJUAN_TS, "utf8") !== isi) {
    console.error(
      "✗ berkas bangkitan BASI terhadap contract/kinds.yaml.\n" +
        "  Jalankan `bun run contract:gen` lalu commit hasilnya."
    );
    process.exit(1);
  }
  console.log("✓ kontrak dan berkas bangkitannya sinkron.");
  process.exit(0);
}

writeFileSync(TUJUAN_TS, isi);
console.log(`✓ ${TUJUAN_TS}`);
console.log(
  `  ${Object.keys(kontrak.kinds).length} kind · ${Object.keys(kontrak.lanes).length} jalur · ` +
    `${kontrak.statuses.length} status`
);
