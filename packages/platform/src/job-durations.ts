/**
 * SEBARAN DURASI PEKERJAAN — jendela HARIAN, setiap jalur Node dan Go, dan
 * bahan vonis SLO (09 §11, docs/TATA-KELOLA.md §2).
 *
 * Berkas sendiri, bukan kueri kedua di `job-metrics.ts`: yang di sana SATU
 * pernyataan atas jendela 15 menit supaya keenam angkanya saling konsisten
 * (`tests/metrik-antrean.test.ts`). Yang di sini pertanyaan lain — sebaran
 * berhari-hari — dan menyatukannya akan memaksa satu jendela untuk dua
 * pertanyaan yang jawabannya menuntut jendela berbeda.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { Prisma } from "@sai/db/client/control";
import { JOB_KINDS, JOB_LANES, type JobKind } from "@sai/core/generated/job-kinds";
import { DONE_RETENTION_DAYS } from "@sai/core/generated/job-numbers";

const JALUR_TAK_DIKENAL = "(tak dikenal)";

/* ═══ SEBARAN DURASI JENDELA PANJANG — SETIAP JALUR, NODE DAN GO (09 §11) ════
 *
 * ══ KENAPA JALUR GO "TAK TERUKUR" PADAHAL `started_at`-NYA SUDAH DITULIS ══
 * Sampai 0.23.0 klaim Go memang tidak menulis `started_at` (diperbaiki di
 * `contract/jobs.sql` → `ClaimJob`). Tetapi sesudah itu pun durasinya tetap
 * tidak akan pernah tampil, karena SATU-SATUNYA permukaan durasi adalah
 * `jobMetrics` di atas: jendela 15 menit, vonis yang menuntut ≥ 10 sampel di
 * jendela itu dan ambang `alarm:` yang menuntut ≥ 200 sampel. Jalur Go
 * menjalankan belasan pekerjaan SEHARI (produksi 21–23 Okt: 16 ekspor Go,
 * 11 denyut, 11 cadangan/kesesuaian) — jendela 15 menitnya hampir selalu nol
 * sampel, jadi p95-nya `—` dan vonisnya `unset` selamanya. Datanya ada di
 * tabel; jendelanya yang terlalu sempit untuk volumenya.
 *
 * Fungsi ini jawabannya: jendela HARIAN (bawaan = retensi `done`, 14 hari —
 * seluruh riwayat yang tabelnya simpan), p50/p95/p99/maks per jalur DAN per
 * `kind`, ditambah hitungan pekerjaan yang melewati SLO jalurnya — bahan vonis
 * SLO (`sloVerdict`, `@sai/core/queue-health`) yang dijanjikan TATA-KELOLA §2.
 *
 * ══ PERSENTIL JALUR DIHITUNG ATAS GABUNGAN BARIS, BUKAN DILIPAT ══════════════
 * `jobMetrics` melipat p95 per `kind` menjadi yang TERTINGGI — benar untuk
 * detektor "jenis mana yang melambat". SLO "p95 < 10 dtk, 5% boleh melampaui"
 * adalah pernyataan tentang HIMPUNAN pekerjaan jalurnya (`report.export` Node
 * + `report.export_go` Go), jadi di sini persentil jalur dihitung atas gabungan
 * barisnya (`GROUPING SETS`), dalam pernyataan yang sama dengan per `kind`.
 * Peta `kind → jalur` dikirim sebagai `VALUES` terikat dari kontrak
 * bangkitan — bukan `CASE WHEN` tulisan tangan.
 *
 * ══ YANG DIHITUNG ══════════════════════════════════════════════════════════
 * Setiap baris yang `finished_at`-nya di jendela dan `started_at`-nya ada —
 * `done` DAN `dead`: ekspor yang mati sesudah 40 detik adalah pengguna yang
 * menunggu 40 detik lalu tidak mendapat apa-apa; membuangnya menyanjung angka.
 * Bentuk saringannya sama dengan `jobMetrics`; `claimed_at` tidak pernah
 * disebut (lihat kepala berkas dan `tests/metrik-antrean.test.ts`).
 */

export interface DurationStats {
  lane: string;
  /** `null` = baris GABUNGAN jalur; selain itu satu `kind` di jalur itu. */
  kind: string | null;
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  /**
   * Pekerjaan yang durasinya MELEWATI SLO jalurnya — porsi *error budget*
   * yang terpakai (`overSlo / samples` vs 5%). `null` bila jalurnya tanpa SLO.
   */
  overSlo: number | null;
}

export interface JobDurations {
  /** Jendela yang dipakai kueri, dalam hari. */
  windowDays: number;
  /** Satu baris gabungan per jalur kontrak (selalu ada), diikuti baris per `kind` yang punya sampel. */
  rows: DurationStats[];
}

export interface BarisDurasi {
  lane: string;
  kind: string | null;
  samples: bigint;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  over: bigint | null;
}

export async function jobDurations(windowDays: number = DONE_RETENTION_DAYS): Promise<JobDurations> {
  const hari = Math.max(1, Math.floor(windowDays));
  /* Jam yang sama dengan yang menulis `finished_at` — lihat `jobMetrics`. */
  const batas = Prisma.sql`(LOCALTIMESTAMP - ${hari}::int * interval '1 day')`;
  /* (kind, jalur, slo_ms) — slo 0 = jalur tanpa SLO. */
  const peta = Prisma.join(
    (Object.keys(JOB_KINDS) as JobKind[]).map((k) => {
      const lane = JOB_KINDS[k].lane;
      const slo = JOB_LANES[lane].slo?.durationP95Ms ?? 0;
      return Prisma.sql`(${k}::text, ${lane}::text, ${slo}::int)`;
    })
  );
  const rows = await controlDb.$queryRaw<BarisDurasi[]>`
    WITH peta(kind, lane, slo_ms) AS (VALUES ${peta}),
    d AS (
      SELECT COALESCE(p.lane, ${JALUR_TAK_DIKENAL}::text) AS lane,
             j.kind,
             COALESCE(p.slo_ms, 0) AS slo_ms,
             EXTRACT(EPOCH FROM (j.finished_at - j.started_at)) * 1000 AS ms
        FROM jobs j
        LEFT JOIN peta p ON p.kind = j.kind
       WHERE j.finished_at > ${batas} AND j.started_at IS NOT NULL
    )
    SELECT lane,
           kind,
           COUNT(*)::bigint AS samples,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY ms) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY ms) AS p99,
           MAX(ms)::float8 AS max,
           COUNT(*) FILTER (WHERE slo_ms > 0 AND ms > slo_ms)::bigint AS over
      FROM d
     GROUP BY GROUPING SETS ((lane, kind), (lane))`;
  return { windowDays: hari, rows: lipatDurasi(rows) };
}

/**
 * Baris SQL → `DurationStats`, terurut: jalur kontrak dulu (urutan
 * `JOB_LANES`), tiap jalur dengan baris gabungannya lalu `kind`-nya. Jalur
 * tanpa satu sampel pun TETAP muncul dengan persentil `null` — "tidak ada
 * bahan" harus terlihat, bukan hilang dari tabel. Diekspor untuk diuji.
 */
export function lipatDurasi(rows: BarisDurasi[]): DurationStats[] {
  const ms = (n: number | null) => (n === null ? null : Math.round(Number(n)));
  const jadi = (r: BarisDurasi): DurationStats => {
    const adaSlo = (JOB_LANES as Record<string, { slo: unknown } | undefined>)[r.lane]?.slo != null;
    return {
      lane: r.lane,
      kind: r.kind,
      samples: Number(r.samples),
      p50Ms: ms(r.p50),
      p95Ms: ms(r.p95),
      p99Ms: ms(r.p99),
      maxMs: ms(r.max),
      overSlo: adaSlo ? Number(r.over ?? 0) : null,
    };
  };
  const jalur = [...Object.keys(JOB_LANES)];
  for (const r of rows) if (!jalur.includes(r.lane)) jalur.push(r.lane);
  const hasil: DurationStats[] = [];
  for (const lane of jalur) {
    const gabungan = rows.find((r) => r.lane === lane && r.kind === null);
    hasil.push(
      gabungan
        ? jadi(gabungan)
        : jadi({ lane, kind: null, samples: BigInt(0), p50: null, p95: null, p99: null, max: null, over: BigInt(0) })
    );
    rows
      .filter((r) => r.lane === lane && r.kind !== null)
      .sort((a, b) => a.kind!.localeCompare(b.kind!))
      .forEach((r) => hasil.push(jadi(r)));
  }
  return hasil;
}
