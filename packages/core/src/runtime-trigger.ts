/**
 * PEMICU TAHAP 1d — vonis yang dibaca dari pengukuran (rancangan 09 §3.3, §9).
 *
 * Tahap 1d (perhitungan laporan pindah ke Go) adalah satu-satunya tahap yang
 * MENULIS ULANG aturan akuntansi, dan karena itu ia dibuka oleh pengukuran,
 * bukan oleh rencana. Pemicunya dua, dan sampai berkas ini ada, tidak satu pun
 * diukur:
 *
 *   (a) jalur ekspor memblokir event loop sampai p95 permintaan interaktif
 *       terpengaruh;
 *   (b) memori jalur dokumen memaksa `--max-old-space-size` lagi.
 *
 * Berkas ini MURNI — ambang, jumlah sampel minimum, dan fungsi vonisnya. Yang
 * mengukur dan menyimpan ada di `@sai/platform/runtime-samples`; yang
 * menampilkan di konsol operator `/scheduler`. Dipisah supaya vonisnya teruji
 * tanpa basis data: vonis yang salah membuka (atau menahan) penulisan ulang
 * berminggu-minggu, dan itu kesalahan yang tidak boleh lahir dari kueri.
 *
 * ══ TIGA KEADAAN, BUKAN DUA ═══════════════════════════════════════════════
 * `insufficient` bukan "belum terpicu". Pemasangan yang baru menyalakan
 * pengukurannya punya tiga sampel, dan p95 atas tiga sampel adalah angka, bukan
 * fakta — kejujuran yang sama dengan `samples` di `job-metrics.ts`. Halaman
 * tetap menyebutnya "belum terpicu", tapi dengan jumlah sampel dan minimumnya
 * di sampingnya, supaya tak seorang pun membacanya sebagai bukti.
 *
 * Sampel kurang TIDAK pernah menghasilkan `triggered`, bahkan bila satu-satunya
 * angka sudah di atas ambang. Sebabnya ongkos: 1d adalah penulisan ulang yang
 * tidak bisa ditarik kembali dengan satu commit, dan satu ekspor ganjil (mis.
 * permintaan dengan rentang tanggal sepuluh tahun) bukan beban kerja.
 */
import type { JobLane } from "./generated/job-kinds";

/** Panjang satu jendela potret event loop. Satu baris per proses per jendela. */
export const RUNTIME_SAMPLE_WINDOW_MS = 5 * 60_000;

/**
 * Rentang yang dinilai vonis — minggu terakhir, alasan yang sama dengan
 * ambang antrean (§11): ambang disetel dari minggu terakhir, bukan dari
 * kuartal lalu.
 */
export const RUNTIME_EVAL_WINDOW_DAYS = 7;

/**
 * Retensi baris `runtime_samples`. SAMA dengan `DONE_RETENTION_DAYS` tabel
 * `jobs` (14 hari) dengan sengaja: kedua panel di `/scheduler` lalu melihat
 * cakrawala yang sama, dan jendela vonis 7 hari muat dua kali di dalamnya.
 */
export const RUNTIME_SAMPLE_RETENTION_DAYS = 14;

/**
 * Ambang (a): p99 tunda event loop `app-customer` di satu jendela.
 *
 * 100 ms adalah batas "terasa seketika" (model RAIL): tunda event loop
 * ditambahkan ke SETIAP permintaan yang tiba saat loop tertahan, jadi jendela
 * yang p99-nya 100 ms adalah jendela tempat satu dari seratus putaran loop
 * membuat orang menunggu jeda yang terasa.
 */
export const LOOP_DELAY_TRIGGER_MS = 100;

/**
 * Bagian jendela yang boleh melewati ambang sebelum (a) terpicu — vonisnya
 * membaca p95 atas p99-per-jendela. Satu jendela buruk per hari (1 dari 288)
 * adalah ganjil; 5% jendela (±14 per hari) adalah pola.
 */
export const LOOP_TRIGGER_PERCENTILE = 0.95;

/** Satu hari penuh jendela 5 menit — kurang dari itu, siklus harian belum terlihat. */
export const LOOP_MIN_SNAPSHOTS = (24 * 60 * 60_000) / RUNTIME_SAMPLE_WINDOW_MS;

/**
 * Ambang (b): puncak RSS satu pekerjaan di jalur dokumen.
 *
 * ⚠ RSS, BUKAN heap, dan BUKAN `heap_size_limit`. Pelari jalur dijalankan
 * **Bun** (`bun --conditions=react-server workers/…`), yaitu JavaScriptCore —
 * yang MENGABAIKAN `--max-old-space-size` (02 §9). Jadi "memaksa
 * `--max-old-space-size` lagi" di proses ini tidak bisa dibaca sebagai heap
 * mendekati batasnya: batas itu tidak ada. Yang ada RSS, dan RSS yang dilihat
 * OOM-killer kernel.
 *
 * 768 MiB adalah pagar yang SUDAH terbukti wajib di kotak ini: Dockerfile
 * memasangnya pada `next build` karena tanpa itu build dibunuh (exit 137).
 * Satu ekspor yang butuh lebih dari pagar itu adalah pekerjaan yang di Node
 * butuh flag yang sama — dan di Bun tidak punya flag apa pun untuk menahannya.
 */
export const MEMORY_TRIGGER_BYTES = 768 * 1024 * 1024;

/** Jumlah pekerjaan minimum di jalur dokumen sebelum puncaknya boleh disebut fakta. */
export const MEMORY_MIN_RUNS = 20;

/**
 * Jalur "dokumen" untuk pemicu (b) — ekspor & dokumen (`interactive`) dan paket
 * laporan (`bulk`). Jalur lain tidak menghasilkan berkas, jadi memorinya bukan
 * pertanyaan 1d.
 */
export const DOCUMENT_LANES: readonly JobLane[] = ["interactive", "bulk"];

/** Sumber potret event loop untuk aplikasi web customer. Jalur memakai nama jalurnya. */
export const APP_CUSTOMER_SOURCE = "app-customer";

export type TriggerStatus = "triggered" | "not_triggered" | "insufficient";

export interface TriggerVerdict {
  status: TriggerStatus;
  /** Angka yang dinilai — `null` bila tidak ada sampel sama sekali. */
  observed: number | null;
  threshold: number;
  samples: number;
  minSamples: number;
}

/** Ringkasan potret event loop per sumber, atas jendela vonis. */
export interface LoopSummary {
  source: string;
  /** Jumlah jendela (baris) — bukan jumlah putaran loop. */
  snapshots: number;
  /** Median p50-per-jendela. */
  p50Ms: number | null;
  /** p95 atas p99-per-jendela — angka yang dinilai pemicu (a). */
  p99Ms: number | null;
  /** Tunda terburuk satu putaran di seluruh rentang. */
  maxMs: number | null;
  /** RSS tertinggi yang terpotret — konteks, tidak dinilai. */
  rssMaxBytes: number | null;
}

/** Ringkasan memori per jalur, atas jendela vonis. */
export interface JobMemorySummary {
  lane: string;
  runs: number;
  /** Puncak RSS tertinggi satu pekerjaan — angka yang dinilai pemicu (b). */
  rssPeakMaxBytes: number | null;
  /** Puncak heap tertinggi yang terpotret — batas bawah, lihat `runtime-samples`. */
  heapPeakMaxBytes: number | null;
}

function verdict(
  observed: number | null,
  threshold: number,
  samples: number,
  minSamples: number
): TriggerVerdict {
  const status: TriggerStatus =
    samples < minSamples || observed === null
      ? "insufficient"
      : observed >= threshold
        ? "triggered"
        : "not_triggered";
  return { status, observed, threshold, samples, minSamples };
}

/**
 * Pemicu (a) — dinilai HANYA dari `app-customer`.
 *
 * Event loop pelari jalur sendiri TIDAK ikut dinilai, dan itu inti jalurnya:
 * ekspor besar sudah di proses `svc-interactive`, jadi loop yang ditahannya
 * adalah loop pelari, bukan loop yang melayani halaman. Angka pelari tetap
 * ditampilkan sebagai konteks — ia memperlihatkan seberapa keras ekspor
 * menahan loop bila suatu saat ia dikerjakan di dalam permintaan lagi.
 *
 * ⚠ Vonis ini tidak tahu PENYEBABnya. Loop `app-customer` yang tertahan bisa
 * karena ekspor sinkron (< `EXPORT_QUEUE_HANDOFF_ROWS` baris, masih dirakit di
 * dalam permintaan), tapi bisa juga karena render halaman berat. "Terpicu"
 * berarti 1d pantas DITIMBANG, dengan pemeriksaan penyebab lebih dulu.
 */
export function loopTriggerVerdict(summaries: readonly LoopSummary[]): TriggerVerdict {
  const app = summaries.find((s) => s.source === APP_CUSTOMER_SOURCE);
  return verdict(app?.p99Ms ?? null, LOOP_DELAY_TRIGGER_MS, app?.snapshots ?? 0, LOOP_MIN_SNAPSHOTS);
}

/**
 * Pemicu (b) — puncak RSS TERTINGGI di jalur dokumen.
 *
 * Tertinggi, bukan persentil, dan itu konservatif dengan sengaja (pola
 * `tertinggi` di `job-metrics.ts`): memori bukan latensi — satu pekerjaan yang
 * melewati batas sudah cukup untuk menjatuhkan prosesnya, dan rata-rata tidak
 * pernah dibunuh OOM-killer.
 *
 * ⚠ Pekerjaan yang SUNGGUH kehabisan memori tidak meninggalkan sampel: prosesnya
 * mati sebelum barisnya ditulis. Jejaknya ada di tempat lain — pekerjaan yang
 * dipulangkan `reclaimStaleJobs` dengan `attempts` bertambah.
 */
export function memoryTriggerVerdict(lanes: readonly JobMemorySummary[]): TriggerVerdict {
  let runs = 0;
  let peak: number | null = null;
  for (const l of lanes) {
    if (!(DOCUMENT_LANES as readonly string[]).includes(l.lane)) continue;
    runs += l.runs;
    if (l.rssPeakMaxBytes !== null) peak = peak === null ? l.rssPeakMaxBytes : Math.max(peak, l.rssPeakMaxBytes);
  }
  return verdict(peak, MEMORY_TRIGGER_BYTES, runs, MEMORY_MIN_RUNS);
}

/** 1d terpicu bila SALAH SATU pemicunya terpicu — keduanya sebab yang berdiri sendiri. */
export function stage1dTriggered(a: TriggerVerdict, b: TriggerVerdict): boolean {
  return a.status === "triggered" || b.status === "triggered";
}

/**
 * Nanodetik histogram → milidetik TUNDA, dan dua runtime menjawab berbeda.
 *
 * DIUKUR di mesin ini (Node 22.22, Bun 1.3.14), resolusi 10 ms, satu blok
 * sinkron 300 ms:
 *
 *     Node   min 10,04   p50 10,11   p99 13,14   max 302,25
 *     Bun    min  0,03   p50  0,09   p99  0,77   max 294,73
 *
 * Node mencatat SELANG antar-detak (resolusi ikut terhitung); Bun mencatat
 * KELEBIHANnya. Tanpa koreksi, `app-customer` (Node) dan pelari (Bun) yang
 * sama-sama sehat terbaca berbeda 10 ms — dan pembandingan keduanya di satu
 * tabel menjadi salah dengan tenang.
 */
export function loopDelayMs(valueNs: number, resolutionMs: number, isBun: boolean): number {
  const ms = valueNs / 1e6;
  const tunda = isBun ? ms : ms - resolutionMs;
  return Math.max(0, Math.round(tunda * 100) / 100);
}

/**
 * Puncak RSS satu pekerjaan dari dua sumber, dan keduanya dibutuhkan.
 *
 *  • `sampled` — RSS terbesar dari pencuplikan berkala. Ia BATAS BAWAH: blok
 *    sinkron (perakitan ExcelJS) menahan timer pencuplikannya juga, jadi
 *    puncak di tengah blok itu tidak pernah tercuplik.
 *  • `maxRss` sebelum/sesudah — tanda air tertinggi seumur proses dari kernel
 *    (`process.resourceUsage().maxRSS`), yang TIDAK bisa terlewat. Bila ia naik
 *    selama pekerjaan ini, pekerjaan inilah yang mencetak puncak baru, dan
 *    nilainya tepat.
 *
 * Bila tanda air tidak naik, puncak pekerjaan ini di bawah puncak proses
 * sebelumnya dan yang tersisa hanya cuplikan.
 */
export function jobRssPeakBytes(sampled: number, maxRssBefore: number, maxRssAfter: number): number {
  return maxRssAfter > maxRssBefore ? Math.max(sampled, maxRssAfter) : sampled;
}
