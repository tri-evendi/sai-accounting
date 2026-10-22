/**
 * PENGUKURAN PEMICU TAHAP 1d — tunda event loop & memori per pekerjaan.
 *
 * Vonisnya (ambang, sampel minimum, tiga keadaan) ada di
 * `@sai/core/runtime-trigger`; berkas ini yang MENGUKUR, MENYIMPAN, dan
 * MERINGKAS. Tabelnya `runtime_samples` di basis data kendali — kenapa tabel
 * sendiri dan bukan kolom di `jobs`: kepala migration `0008_runtime_samples`.
 *
 * Tiga pemakai:
 *   • `src/instrumentation.ts` — `startLoopSampler("app-customer")`, sekali per
 *     proses server Next;
 *   • `workers/runner.ts` — `startLoopSampler(<jalur>)` + `trackJobMemory()` per
 *     percobaan + `pruneRuntimeSamples()` di putaran upkeep;
 *   • konsol operator `/scheduler` — `runtimeSummary()`.
 *
 * ⚠ TANPA `import "server-only"`, berbeda dari tetangganya, dan itu disengaja:
 * berkas ini dimuat dari hook `register` Next (`instrumentation.ts`), yang
 * tidak dijamin dimuat di bawah kondisi `react-server` — dan `server-only` di
 * luar kondisi itu MELEMPAR saat dimuat (kejadian 21 Okt, lihat
 * `tests/worker-server-only.test.ts`). Pengukuran yang mematikan boot aplikasi
 * jauh lebih buruk daripada tidak ada pengukuran. Berkas ini tidak memuat
 * rahasia apa pun yang perlu pagar itu.
 *
 * ══ SEMUA PENULIS FAIL-SOFT ══════════════════════════════════════════════
 * Galat tulis dicatat lalu ditelan. Sampel yang hilang menurunkan JUMLAH
 * sampel — dan vonis yang membaca jumlah itu menjadi "sampel kurang", jadi
 * kehilangannya terlihat. Permintaan atau pekerjaan yang gagal karena
 * pengukurannya gagal tidak terlihat sebagai apa pun selain kerusakan.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { hostname } from "node:os";

import { controlDb } from "@sai/core/control-db";
import {
  LOOP_TRIGGER_PERCENTILE,
  RUNTIME_EVAL_WINDOW_DAYS,
  RUNTIME_SAMPLE_RETENTION_DAYS,
  RUNTIME_SAMPLE_WINDOW_MS,
  jobRssPeakBytes,
  loopDelayMs,
  loopTriggerVerdict,
  memoryTriggerVerdict,
  type JobMemorySummary,
  type LoopSummary,
  type TriggerVerdict,
} from "@sai/core/runtime-trigger";

/** Resolusi histogram — bawaan Node. Lebih rapat tidak membeli apa pun untuk ambang 100 ms. */
const RESOLUTION_MS = 10;

/** Jeda cuplikan memori selama satu pekerjaan berjalan. */
const MEMORY_POLL_MS = 250;

const IS_BUN = typeof process.versions.bun === "string";
const RUNTIME = IS_BUN ? "bun" : "node";

function instanceName(): string {
  return `${hostname()}:${process.pid}`.slice(0, 100);
}

/** `maxRSS` dari kernel dalam KiB → byte. */
function maxRssBytes(): number {
  return process.resourceUsage().maxRSS * 1024;
}

const KUNCI_GLOBAL = Symbol.for("sai.runtimeLoopSampler");
type GlobalSampler = { [KUNCI_GLOBAL]?: () => void };

/**
 * Mulai memotret tunda event loop proses ini — satu baris `loop` per jendela.
 *
 * Idempoten per proses (kunci di `globalThis`): `register` bisa terpanggil
 * ulang oleh HMR di mode pengembangan, dan dua histogram di satu proses
 * menggandakan barisnya tanpa menambah satu informasi pun.
 *
 * Timer-nya `unref()`: pengukuran tidak boleh menahan proses tetap hidup
 * sesudah pekerjaannya selesai.
 */
export function startLoopSampler(source: string): () => void {
  const g = globalThis as GlobalSampler;
  const ada = g[KUNCI_GLOBAL];
  if (ada) return ada;

  const histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
  const instance = instanceName();

  const potret = async () => {
    /* Histogram dibaca LALU direset sebelum tulisan yang asinkron: putaran
       loop selama menunggu basis data milik jendela berikutnya. */
    const count = histogram.count;
    const p50 = histogram.percentile(50);
    const p99 = histogram.percentile(99);
    const max = histogram.max;
    histogram.reset();
    if (count === 0) return;

    const mem = process.memoryUsage();
    try {
      await controlDb.runtimeSample.create({
        data: {
          source,
          instance,
          runtime: RUNTIME,
          sampleKind: "loop",
          windowMs: RUNTIME_SAMPLE_WINDOW_MS,
          loopP50Ms: loopDelayMs(p50, RESOLUTION_MS, IS_BUN),
          loopP99Ms: loopDelayMs(p99, RESOLUTION_MS, IS_BUN),
          loopMaxMs: loopDelayMs(max, RESOLUTION_MS, IS_BUN),
          heapUsedBytes: BigInt(mem.heapUsed),
          rssBytes: BigInt(mem.rss),
        },
      });
    } catch (e) {
      console.error(`[runtime-samples] potret event loop \`${source}\` gagal ditulis:`, e);
    }
  };

  const timer = setInterval(() => void potret(), RUNTIME_SAMPLE_WINDOW_MS);
  timer.unref();

  const berhenti = () => {
    clearInterval(timer);
    histogram.disable();
    delete g[KUNCI_GLOBAL];
  };
  g[KUNCI_GLOBAL] = berhenti;
  return berhenti;
}

export interface JobMemoryPeak {
  heapPeakBytes: number;
  rssPeakBytes: number;
}

/**
 * Mulai mencuplik memori satu percobaan pekerjaan; `finish()` memulangkan
 * puncaknya. Heap tercuplik adalah BATAS BAWAH (blok sinkron menahan timer
 * cuplikannya); RSS dikoreksi dengan tanda air kernel — `jobRssPeakBytes`.
 */
export function trackJobMemory(): { finish: () => JobMemoryPeak } {
  const tandaAirAwal = maxRssBytes();
  let heap = 0;
  let rss = 0;
  const cuplik = () => {
    const m = process.memoryUsage();
    if (m.heapUsed > heap) heap = m.heapUsed;
    if (m.rss > rss) rss = m.rss;
  };
  cuplik();
  const timer = setInterval(cuplik, MEMORY_POLL_MS);
  timer.unref();

  return {
    finish: () => {
      clearInterval(timer);
      cuplik();
      return { heapPeakBytes: heap, rssPeakBytes: jobRssPeakBytes(rss, tandaAirAwal, maxRssBytes()) };
    },
  };
}

/** Tulis satu baris `job`. Fail-soft — lihat kepala berkas. */
export async function recordJobRun(input: {
  lane: string;
  jobId: number;
  jobKind: string;
  durationMs: number;
  memory: JobMemoryPeak;
}): Promise<void> {
  try {
    await controlDb.runtimeSample.create({
      data: {
        source: input.lane,
        instance: instanceName(),
        runtime: RUNTIME,
        sampleKind: "job",
        jobId: input.jobId,
        jobKind: input.jobKind,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        heapUsedBytes: BigInt(Math.round(input.memory.heapPeakBytes)),
        rssBytes: BigInt(Math.round(input.memory.rssPeakBytes)),
      },
    });
  } catch (e) {
    console.error(`[runtime-samples] sampel memori #${input.jobId} gagal ditulis:`, e);
  }
}

/** Buang baris lewat retensi — idempoten, dipanggil upkeep setiap pelari. */
export async function pruneRuntimeSamples(
  retentionDays: number = RUNTIME_SAMPLE_RETENTION_DAYS,
  now: Date = new Date()
): Promise<number> {
  const ambang = new Date(now.getTime() - retentionDays * 86_400_000);
  return controlDb.$executeRaw`DELETE FROM runtime_samples WHERE created_at < ${ambang}`;
}

export interface RuntimeSummary {
  loop: LoopSummary[];
  jobs: JobMemorySummary[];
  loopVerdict: TriggerVerdict;
  memoryVerdict: TriggerVerdict;
}

interface BarisLoop {
  source: string;
  snapshots: bigint;
  p50: number | null;
  p99: number | null;
  max: number | null;
  rss: bigint | null;
}

interface BarisJob {
  lane: string;
  runs: bigint;
  rss: bigint | null;
  heap: bigint | null;
}

const angka = (n: number | bigint | null): number | null => (n === null ? null : Number(n));
const ms = (n: number | null): number | null => (n === null ? null : Math.round(Number(n) * 100) / 100);

/**
 * Ringkasan atas jendela vonis (7 hari) + kedua vonisnya.
 *
 * p99-per-jendela diringkas dengan p95 LINTAS jendela (`LOOP_TRIGGER_PERCENTILE`),
 * bukan rata-rata: rata-rata menenggelamkan jam sibuk di dalam malam yang sepi,
 * padahal jam sibuklah yang ditanyakan pemicu (a).
 */
export async function runtimeSummary(now: Date = new Date()): Promise<RuntimeSummary> {
  const batas = new Date(now.getTime() - RUNTIME_EVAL_WINDOW_DAYS * 86_400_000);

  const [barisLoop, barisJob] = await Promise.all([
    controlDb.$queryRaw<BarisLoop[]>`
      SELECT source,
             COUNT(*)::bigint AS snapshots,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY loop_p50_ms::float8) AS p50,
             percentile_cont(${LOOP_TRIGGER_PERCENTILE}::float8) WITHIN GROUP (ORDER BY loop_p99_ms::float8) AS p99,
             MAX(loop_max_ms)::float8 AS max,
             MAX(rss_bytes) AS rss
        FROM runtime_samples
       WHERE sample_kind = 'loop' AND created_at > ${batas}
       GROUP BY source
       ORDER BY source`,
    controlDb.$queryRaw<BarisJob[]>`
      SELECT source AS lane,
             COUNT(*)::bigint AS runs,
             MAX(rss_bytes) AS rss,
             MAX(heap_used_bytes) AS heap
        FROM runtime_samples
       WHERE sample_kind = 'job' AND created_at > ${batas}
       GROUP BY source
       ORDER BY source`,
  ]);

  const loop: LoopSummary[] = barisLoop.map((r) => ({
    source: r.source,
    snapshots: Number(r.snapshots),
    p50Ms: ms(r.p50),
    p99Ms: ms(r.p99),
    maxMs: ms(r.max),
    rssMaxBytes: angka(r.rss),
  }));
  const jobs: JobMemorySummary[] = barisJob.map((r) => ({
    lane: r.lane,
    runs: Number(r.runs),
    rssPeakMaxBytes: angka(r.rss),
    heapPeakMaxBytes: angka(r.heap),
  }));

  return { loop, jobs, loopVerdict: loopTriggerVerdict(loop), memoryVerdict: memoryTriggerVerdict(jobs) };
}
