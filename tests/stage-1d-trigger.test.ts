/**
 * PENJAGA pemicu tahap 1d (09 §3.3, §9) — vonisnya, dan jalur pengukurannya.
 *
 * Vonis yang salah ke arah mana pun mahal: "terpicu" yang palsu membuka
 * penulisan ulang aturan akuntansi berminggu-minggu; "belum terpicu" yang
 * palsu menahan pemindahan yang sudah dibutuhkan. Dua kekeliruan yang paling
 * mudah dibuat dijaga di sini:
 *
 *   • menilai SAMPEL KURANG sebagai fakta — p95 atas tiga jendela adalah angka,
 *     bukan fakta (kejujuran yang sama dengan `samples` di `job-metrics`);
 *   • menilai proses yang SALAH — loop pelari `interactive` (`svc-worker`) yang tertahan
 *     tidak membuat siapa pun menunggu halaman, jadi ia tidak boleh memicu (a).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import {
  APP_CUSTOMER_SOURCE,
  LOOP_DELAY_TRIGGER_MS,
  LOOP_MIN_SNAPSHOTS,
  MEMORY_MIN_RUNS,
  MEMORY_TRIGGER_BYTES,
  RUNTIME_SAMPLE_RETENTION_DAYS,
  jobRssPeakBytes,
  loopDelayMs,
  loopTriggerVerdict,
  memoryTriggerVerdict,
  stage1dTriggered,
  type JobMemorySummary,
  type LoopSummary,
} from "@sai/core/runtime-trigger";
import { DONE_RETENTION_DAYS } from "@sai/core/job-backoff";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");

const loop = (ubah: Partial<LoopSummary> = {}): LoopSummary => ({
  source: APP_CUSTOMER_SOURCE,
  snapshots: LOOP_MIN_SNAPSHOTS,
  p50Ms: 1,
  p99Ms: 10,
  maxMs: 50,
  rssMaxBytes: 200 * 1024 * 1024,
  ...ubah,
});

const mem = (ubah: Partial<JobMemorySummary> = {}): JobMemorySummary => ({
  lane: "interactive",
  runs: MEMORY_MIN_RUNS,
  rssPeakMaxBytes: 100 * 1024 * 1024,
  heapPeakMaxBytes: 50 * 1024 * 1024,
  ...ubah,
});

describe("pemicu (a) — tunda event loop app-customer", () => {
  it("di bawah ambang dengan sampel cukup = belum terpicu", () => {
    expect(loopTriggerVerdict([loop()]).status).toBe("not_triggered");
  });

  it("di ambang dengan sampel cukup = terpicu", () => {
    const v = loopTriggerVerdict([loop({ p99Ms: LOOP_DELAY_TRIGGER_MS })]);
    expect(v.status).toBe("triggered");
    expect(v.observed).toBe(LOOP_DELAY_TRIGGER_MS);
  });

  it("sampel KURANG tidak pernah terpicu, seburuk apa pun angkanya", () => {
    const v = loopTriggerVerdict([loop({ snapshots: LOOP_MIN_SNAPSHOTS - 1, p99Ms: 5_000 })]);
    expect(v.status).toBe("insufficient");
    expect(v.samples).toBe(LOOP_MIN_SNAPSHOTS - 1);
    expect(v.minSamples).toBe(LOOP_MIN_SNAPSHOTS);
  });

  it("tanpa baris app-customer sama sekali = sampel kurang, bukan belum terpicu", () => {
    const v = loopTriggerVerdict([]);
    expect(v.status).toBe("insufficient");
    expect(v.observed).toBeNull();
    expect(v.samples).toBe(0);
  });

  it("loop PELARI yang tertahan tidak memicu (a) — ia tidak menahan halaman siapa pun", () => {
    const v = loopTriggerVerdict([
      loop(),
      loop({ source: "interactive", p99Ms: 10_000, snapshots: 10_000 }),
    ]);
    expect(v.status).toBe("not_triggered");
    expect(v.observed).toBe(10);
  });

  it("minimum sampel = satu hari penuh jendela 5 menit", () => {
    expect(LOOP_MIN_SNAPSHOTS).toBe(288);
  });
});

describe("pemicu (b) — puncak RSS jalur dokumen", () => {
  it("di bawah ambang = belum terpicu; di ambang = terpicu", () => {
    expect(memoryTriggerVerdict([mem()]).status).toBe("not_triggered");
    expect(memoryTriggerVerdict([mem({ rssPeakMaxBytes: MEMORY_TRIGGER_BYTES })]).status).toBe(
      "triggered"
    );
  });

  it("jalur BUKAN dokumen tidak dihitung — sampelnya maupun puncaknya", () => {
    const v = memoryTriggerVerdict([
      mem({ runs: 5 }),
      mem({ lane: "ledger", runs: 500, rssPeakMaxBytes: 4 * MEMORY_TRIGGER_BYTES }),
    ]);
    expect(v.samples).toBe(5);
    expect(v.status).toBe("insufficient");
  });

  it("sampel dijumlahkan lintas jalur dokumen; puncak = TERTINGGI, bukan rata-rata", () => {
    const v = memoryTriggerVerdict([
      mem({ runs: MEMORY_MIN_RUNS - 1, rssPeakMaxBytes: 10 }),
      mem({ lane: "bulk", runs: 1, rssPeakMaxBytes: MEMORY_TRIGGER_BYTES + 1 }),
    ]);
    expect(v.samples).toBe(MEMORY_MIN_RUNS);
    expect(v.observed).toBe(MEMORY_TRIGGER_BYTES + 1);
    expect(v.status).toBe("triggered");
  });

  it("sampel kurang tidak pernah terpicu", () => {
    const v = memoryTriggerVerdict([
      mem({ runs: 1, rssPeakMaxBytes: 10 * MEMORY_TRIGGER_BYTES }),
    ]);
    expect(v.status).toBe("insufficient");
  });
});

describe("1d terpicu bila SALAH SATU pemicunya terpicu", () => {
  const a = loopTriggerVerdict([loop({ p99Ms: 500 })]);
  const tidakA = loopTriggerVerdict([loop()]);
  const kurang = memoryTriggerVerdict([]);
  it("satu terpicu cukup", () => {
    expect(stage1dTriggered(a, kurang)).toBe(true);
  });
  it("belum terpicu + sampel kurang = belum", () => {
    expect(stage1dTriggered(tidakA, kurang)).toBe(false);
  });
});

describe("tunda event loop: Node dan Bun mencatat histogram dengan dasar berbeda", () => {
  it("Node: resolusi dikurangkan (ia mencatat selang antar-detak)", () => {
    expect(loopDelayMs(10_110_000, 10, false)).toBe(0.11);
  });
  it("Bun: nilai apa adanya (ia mencatat kelebihan)", () => {
    expect(loopDelayMs(90_303, 10, true)).toBe(0.09);
  });
  it("tidak pernah negatif", () => {
    expect(loopDelayMs(9_000_000, 10, false)).toBe(0);
  });
});

describe("puncak RSS satu pekerjaan", () => {
  it("tanda air kernel yang NAIK selama pekerjaan = puncak pekerjaan ini (cuplikan bisa terlewat)", () => {
    expect(jobRssPeakBytes(300, 400, 900)).toBe(900);
  });
  it("tanda air yang tidak naik = hanya cuplikan yang berlaku", () => {
    expect(jobRssPeakBytes(300, 900, 900)).toBe(300);
  });
});

describe("jalur pengukurannya", () => {
  const sampel = baca("packages/platform/src/runtime-samples.ts");
  const runner = tanpaKomentar(baca("workers/runner.ts"));
  const instrumentasi = tanpaKomentar(baca("src/instrumentation.ts"));
  const migration = baca("prisma/postgresql/control/0008_runtime_samples/migration.sql");

  it("`runtime-samples` TIDAK mengimpor `server-only` — ia dimuat hook `register` Next", () => {
    expect(tanpaKomentar(sampel)).not.toMatch(/import\s+["']server-only["']/);
  });

  it("instrumentasi hanya di runtime nodejs, dan tidak saat `next build`", () => {
    expect(instrumentasi).toMatch(/NEXT_RUNTIME\s*!==\s*"nodejs"/);
    expect(instrumentasi).toMatch(/phase-production-build/);
    expect(instrumentasi).toContain("startLoopSampler(APP_CUSTOMER_SOURCE)");
  });

  it("pelari memotret loop, mencatat memori di `finally`, dan memangkas di upkeep", () => {
    expect(runner).toContain("startLoopSampler(lane)");
    const akhir = runner.slice(runner.lastIndexOf("} finally {"));
    expect(akhir).toContain("recordJobRun(");
    expect(akhir).toContain("memori.finish()");
    const upkeep = runner.slice(runner.indexOf("async function upkeep"), runner.indexOf("export interface RunnerOptions"));
    expect(upkeep).toContain("pruneRuntimeSamples()");
  });

  it("migration tidak menyentuh `jobs` — tabel itu dibagi dengan pelari Go", () => {
    expect(tanpaKomentar(migration)).not.toMatch(/"jobs"/);
    expect(migration).toMatch(/CHECK \("sample_kind" IN \('loop', 'job'\)\)/);
  });

  it("retensi sampel sama dengan retensi baris `jobs` — kedua panel melihat cakrawala yang sama", () => {
    expect(RUNTIME_SAMPLE_RETENTION_DAYS).toBe(DONE_RETENTION_DAYS);
  });

  it("panel konsol menampilkan jumlah sampel BERSAMA minimumnya", () => {
    const halaman = baca("apps/operator/src/app/(operator)/scheduler/page.tsx");
    expect(halaman).toContain("runtimeSummaryForOperator");
    expect(halaman).toMatch(/r\.verdict\.samples\} \/ \{r\.verdict\.minSamples/);
  });
});

describe("`report:count` bisa diulang", () => {
  it("setiap pola cakupan menemukan berkas, dan totalnya tidak nol", () => {
    /* Skrip MELEMPAR bila satu pola kosong — cakupan yang diam-diam menyusut. */
    const keluaran = execFileSync("bun", ["scripts/report-stack-count.ts", "--json"], {
      cwd: AKAR_REPO,
      encoding: "utf8",
    });
    const hasil = JSON.parse(keluaran) as { files: number; lines: number };
    expect(hasil.files).toBeGreaterThan(0);
    expect(hasil.lines).toBeGreaterThan(0);
  });
});
