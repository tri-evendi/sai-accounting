/**
 * METRIK ANTREAN — kedalaman, laju, dan histogram durasi (rancangan §11).
 *
 * ══ §11 MENUNTUT "PENYIMPAN RIWAYAT". TERNYATA TIDAK ══════════════════════
 * Rancangannya menulis bahwa ketiga metrik ini "butuh penyimpan riwayat yang
 * belum dipilih", sebab "laju menuntut dua titik waktu". Itu benar untuk
 * metrik berbentuk COUNTER — angka yang hanya bisa naik, yang lajunya hanya
 * terbaca dengan mengurangi dua pembacaan, yang karena itu menuntut sesuatu
 * yang menyimpan pembacaan sebelumnya.
 *
 * Tapi baris `jobs` bukan counter. Ia **peristiwa yang membawa cap waktunya
 * sendiri** — dan laju atas peristiwa bercap waktu adalah satu `COUNT(*)`
 * berjendela, bukan selisih dua pembacaan:
 *
 *     laju terbit = COUNT(*) WHERE created_at > now() - jendela
 *
 * Riwayat yang §11 cari karena itu SUDAH ADA di tabelnya, dan ia sudah punya
 * retensi: `archiveDoneJobs` memangkasnya pada `DONE_RETENTION_DAYS` (14 hari).
 * Yang sungguh kurang hanya satu kolom — `started_at`, sebab `claimed_at`
 * diperpanjang berkala sehingga durasi tidak bisa dihitung dari kolom mana pun
 * yang ada (lihat migration `0007_jobs_started_at`).
 *
 * Konsekuensi keputusan ini pantas disebut, sebab ia besar: **tidak ada
 * Prometheus, tidak ada Grafana, tidak ada layanan kedua belas.** Kotak ini
 * ~3,6 GB RAM dengan produksi hidup di atasnya, dan dua proses lagi untuk
 * menyimpan angka yang sudah tersimpan adalah ongkos yang dibayar tanpa
 * membeli apa pun.
 *
 * ══ YANG HILANG DARI KEPUTUSAN ITU, DAN PEMICUNYA ═════════════════════════
 * Satu hal nyata: **tren di luar 14 hari tidak bisa dijawab.** Begitu
 * pengarsipan membuang barisnya, durasinya hilang bersamanya — jadi "apakah
 * ekspor lebih lambat dibanding kuartal lalu" bukan pertanyaan yang bisa
 * dijawab di sini.
 *
 * Itu diterima karena bukan pertanyaan yang §11 ajukan: ia menuntut histogram
 * sebagai PRASYARAT ambang per-jalur, dan ambang disetel dari minggu terakhir,
 * bukan dari kuartal lalu. **Pemicu** untuk membangun rollup (satu baris per
 * jam per jalur, bertahan setelah pangkasan): ada orang yang sungguh bertanya
 * tentang tren lebih panjang dari retensinya — bukan sekarang, atas dugaan.
 *
 * ══ SATU PERNYATAAN, DAN ITU BUKAN KERAPIAN ═══════════════════════════════
 * Keenam angka datang dari SATU kueri dengan klausa `FILTER`, bukan dari enam
 * kueri yang dijalankan berurutan. Sebabnya bukan ongkos melainkan KONSISTENSI:
 * kedalaman yang dibaca sesudah sebuah pekerjaan selesai akan saling
 * bertentangan dengan laju selesai yang dibaca sebelumnya, dan pembacanya tidak
 * punya cara menduga mana yang lebih baru. Angka yang saling bertentangan lebih
 * buruk daripada angka yang kurang.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { JOB_KINDS, JOB_LANES, type JobKind } from "@sai/core/generated/job-kinds";

/** Jendela bawaan — cukup panjang untuk punya sampel, cukup pendek untuk masih berarti. */
export const METRICS_WINDOW_MINUTES = 15;

export interface LaneMetrics {
  lane: string;
  /** Menunggu DAN sudah waktunya jalan — bukan termasuk yang masih di-*backoff*. */
  depth: number;
  /** Per menit, atas jendelanya. */
  publishedPerMin: number;
  completedPerMin: number;
  /**
   * Persentil durasi dalam milidetik, `null` bila tak ada sampel.
   *
   * `null` BUKAN nol: jalur yang tidak menjalankan apa pun di jendelanya dan
   * jalur yang menjalankan pekerjaan nol-detik terlihat sama bila keduanya
   * dilaporkan `0`.
   */
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  /**
   * BERAPA pekerjaan yang menopang persentil di atas.
   *
   * Ia ditampilkan bersama angkanya, dan itu syarat — bukan hiasan: p95 atas
   * tiga pekerjaan adalah angka, bukan fakta, dan ambang per-jalur yang disetel
   * darinya akan berteriak untuk hal normal. Pembaca yang tidak melihat jumlah
   * sampelnya tidak punya cara membedakan keduanya.
   */
  samples: number;
}

const JALUR_TAK_DIKENAL = "(tak dikenal)";

interface BarisMetrik {
  kind: string;
  depth: bigint;
  published: bigint;
  completed: bigint;
  samples: bigint;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

/**
 * Metrik per JALUR, dikumpulkan dari per-`kind`.
 *
 * Pengelompokan SQL-nya per `kind` lalu dilipat ke jalur di TypeScript — pola
 * yang sama dengan `queueSnapshot`, dan alasannya sama: peta `kind → jalur`
 * dibangkitkan dari `contract/kinds.yaml`, dan menuliskannya lagi sebagai
 * `CASE WHEN` di dalam SQL berarti dua daftar yang menyimpang tanpa galat.
 */
export async function jobMetrics(
  windowMinutes: number = METRICS_WINDOW_MINUTES,
  now: Date = new Date()
): Promise<LaneMetrics[]> {
  const menit = Math.max(1, Math.floor(windowMinutes));
  const batas = new Date(now.getTime() - menit * 60_000);

  /*
   * `EXTRACT(EPOCH FROM ...) * 1000` — milidetik, dan `percentile_cont` atas
   * angka alih-alih atas `interval` supaya hasilnya satu `double precision`
   * yang tidak perlu diurai di sisi JS.
   *
   * `FILTER` pada persentilnya menyaring DUA hal: jendelanya, dan baris yang
   * `started_at`-nya NULL — yaitu baris yang selesai sebelum kolom itu ada.
   * Memasukkannya berarti `NULL` masuk ke urutan persentil; mengarangnya dari
   * `claimed_at` berarti nilai fiktif masuk ke sana. Keduanya ditolak, dan
   * harganya `samples` yang kecil selama 14 hari pertama.
   */
  const rows = await controlDb.$queryRaw<BarisMetrik[]>`
    SELECT kind,
           COUNT(*) FILTER (WHERE status = 'queued' AND run_after <= ${now})::bigint AS depth,
           COUNT(*) FILTER (WHERE created_at > ${batas})::bigint AS published,
           COUNT(*) FILTER (WHERE status = 'done' AND finished_at > ${batas})::bigint AS completed,
           COUNT(*) FILTER (
             WHERE finished_at > ${batas} AND started_at IS NOT NULL
           )::bigint AS samples,
           percentile_cont(0.50) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
           ) FILTER (WHERE finished_at > ${batas} AND started_at IS NOT NULL) AS p50,
           percentile_cont(0.95) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
           ) FILTER (WHERE finished_at > ${batas} AND started_at IS NOT NULL) AS p95,
           percentile_cont(0.99) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
           ) FILTER (WHERE finished_at > ${batas} AND started_at IS NOT NULL) AS p99
      FROM jobs
     GROUP BY kind`;

  const per = new Map<string, LaneMetrics>();
  const kosong = (lane: string): LaneMetrics => ({
    lane,
    depth: 0,
    publishedPerMin: 0,
    completedPerMin: 0,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    samples: 0,
  });
  for (const lane of Object.keys(JOB_LANES)) per.set(lane, kosong(lane));

  /*
   * Persentil per jalur dari persentil per `kind` TIDAK bisa dirata-ratakan —
   * p95 bukan besaran yang bisa dijumlahkan. Yang dipakai: nilai TERTINGGI di
   * antara `kind` jalur itu, ditimbang keberadaan sampelnya.
   *
   * Itu pilihan yang disebutkan apa adanya, dan ia konservatif dengan sengaja:
   * ia menjawab "seburuk apa jalur ini bisa", bukan "berapa rata-ratanya".
   * Untuk ambang — yang gunanya mendeteksi satu jenis yang melambat — angka
   * terburuk adalah angka yang benar; rata-rata justru menyembunyikan tepat apa
   * yang §11 ingin dilihat.
   */
  for (const r of rows) {
    const lane = JOB_KINDS[r.kind as JobKind]?.lane ?? JALUR_TAK_DIKENAL;
    const m = per.get(lane) ?? kosong(lane);
    m.depth += Number(r.depth);
    m.publishedPerMin += Number(r.published) / menit;
    m.completedPerMin += Number(r.completed) / menit;
    m.samples += Number(r.samples);
    m.p50Ms = tertinggi(m.p50Ms, r.p50);
    m.p95Ms = tertinggi(m.p95Ms, r.p95);
    m.p99Ms = tertinggi(m.p99Ms, r.p99);
    per.set(lane, m);
  }

  return [...per.values()].map((m) => ({
    ...m,
    publishedPerMin: bulatkan(m.publishedPerMin),
    completedPerMin: bulatkan(m.completedPerMin),
    p50Ms: m.p50Ms === null ? null : Math.round(m.p50Ms),
    p95Ms: m.p95Ms === null ? null : Math.round(m.p95Ms),
    p99Ms: m.p99Ms === null ? null : Math.round(m.p99Ms),
  }));
}

function tertinggi(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Dua desimal — laju 0,07/menit berarti sesuatu, 0 tidak. */
function bulatkan(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Perkiraan waktu kuras, dalam menit — `null` bila tidak bisa diperkirakan.
 *
 * ⚠ `null` punya DUA sebab yang berbeda dan keduanya benar sebagai `null`:
 * antrean kosong (tak ada yang perlu dikuras) dan laju selesai nol sementara
 * ada yang menunggu (tak akan pernah terkuras). Yang kedua adalah keadaan
 * paling gawat yang bisa dialami antrean ini — pekerjanya mati — dan ia
 * TIDAK boleh dilaporkan sebagai angka besar: "4.812 menit" terbaca sebagai
 * lambat, sementara yang sebenarnya terjadi adalah tidak bergerak.
 *
 * Sinyal untuk keadaan itu sudah ada dan terpisah: umur pekerjaan tertua yang
 * belum jalan, dengan ambangnya ([02 §14]). Fungsi ini tidak mengulanginya.
 */
export function drainMinutes(m: LaneMetrics): number | null {
  if (m.depth === 0) return null;
  if (m.completedPerMin <= 0) return null;
  return bulatkan(m.depth / m.completedPerMin);
}
