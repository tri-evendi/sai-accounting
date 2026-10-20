/**
 * PENJAGA metrik antrean (rancangan §11) — dan satu di antaranya menjaga
 * kekeliruan yang paling mudah dibuat di seluruh berkas ini.
 *
 * ══ KEKELIRUAN ITU: MENGHITUNG DURASI DARI `claimed_at` ════════════════════
 * `claimed_at` DIPERPANJANG berkala selama pekerjaan berjalan — itu *lease*
 * yang diperbarui, dan alasannya ada di komentar model `Job`. Akibatnya
 * `finished_at - claimed_at` bukan durasi melainkan jarak dari perpanjangan
 * TERAKHIR: sekitar satu interval perpanjangan untuk SETIAP pekerjaan, berapa
 * pun lamanya ia sungguh berjalan.
 *
 * Histogram yang dibangun darinya akan terlihat rapi, sempit, dan seluruhnya
 * salah — dan tidak ada satu pun gejala yang memberi tahu pembacanya.
 *
 * Diukur terhadap PostgreSQL sungguhan, sepuluh pekerjaan berdurasi 100–1000 ms
 * dengan `claimed_at` diperpanjang 30 detik sebelum selesai:
 *
 *     dari `started_at` (benar)   p50 =    550 ms   p95 =  955 ms
 *     dari `claimed_at` (salah)   p50 = 30.000 ms   p95 = 30.000 ms
 *
 * `p50 = p95` pada baris kedua adalah intinya: ia tidak sekadar salah angkanya,
 * ia kehilangan seluruh SEBARAN — satu-satunya hal yang dicari histogram. Itu
 * sebabnya `started_at` ada, dan sebabnya penjaga di bawah menolak `claimed_at`
 * muncul di kueri metrik mana pun.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import { drainMinutes, METRICS_WINDOW_MINUTES, type LaneMetrics } from "@sai/platform/job-metrics";
import { JOB_LANES } from "@sai/core/generated/job-kinds";

const metrik = readFileSync(join(AKAR_REPO, "packages/platform/src/job-metrics.ts"), "utf8");
const metrikTanpaKomentar = tanpaKomentar(metrik);
const antrean = readFileSync(join(AKAR_REPO, "packages/platform/src/job-queue.ts"), "utf8");
const skema = readFileSync(
  join(AKAR_REPO, "packages/db/prisma/control/schema.prisma"),
  "utf8"
);

const dasar = (ubah: Partial<LaneMetrics> = {}): LaneMetrics => ({
  lane: "interactive",
  depth: 0,
  publishedPerMin: 0,
  completedPerMin: 0,
  p50Ms: null,
  p95Ms: null,
  p99Ms: null,
  samples: 0,
  ...ubah,
});

describe("durasi diukur dari `started_at`, BUKAN dari `claimed_at`", () => {
  it("kueri metrik tidak menyebut `claimed_at` satu kali pun", () => {
    /* Lihat kepala berkas: selisih terhadap `claimed_at` adalah jarak dari
       perpanjangan lease terakhir, bukan durasi — dan tidak ada gejala yang
       memberi tahu pembacanya. */
    expect(metrikTanpaKomentar).not.toMatch(/claimed_at/);
  });

  it("persentilnya dihitung dari `finished_at - started_at`", () => {
    expect(metrikTanpaKomentar).toMatch(/finished_at - started_at/);
    expect(metrikTanpaKomentar).toContain("percentile_cont");
  });

  it("baris tanpa `started_at` DIBUANG, tidak dianggap nol", () => {
    /*
     * Baris yang selesai sebelum migration `0007` tidak punya durasi terukur.
     * Memasukkannya berarti NULL masuk ke urutan persentil; mengarangnya dari
     * `claimed_at` berarti nilai fiktif masuk ke sana. Keduanya ditolak, dan
     * harganya `samples` yang kecil selama retensi pertama.
     */
    const saringan = metrikTanpaKomentar.match(/started_at IS NOT NULL/g) ?? [];
    /* Sekali untuk `samples`, sekali untuk masing-masing dari tiga persentil. */
    expect(saringan.length).toBe(4);
  });

  it("`started_at` disetel pada KLAIM dan tidak pernah oleh perpanjangan lease", () => {
    const bersih = tanpaKomentar(antrean);
    const klaim = bersih.slice(bersih.indexOf("UPDATE jobs SET status = 'claimed'"));
    expect(klaim.slice(0, 300)).toContain("started_at = now()");

    /* `renewLease` memperbarui `claimed_at` — dan HANYA itu. Satu baris
       `started_at = now()` di sana menghapus seluruh gunanya kolom itu. */
    const perpanjang = bersih.slice(bersih.indexOf("UPDATE jobs SET claimed_at = now()"));
    expect(perpanjang.slice(0, 200)).not.toContain("started_at");
  });

  it("skemanya menyebut keduanya, dan menjelaskan bedanya", () => {
    /* Penjaga "X ADA" boleh membaca teks penuh: komentar di repo ini bagian
       dari apa yang dijaga, dan kolom ini TIDAK bisa dipahami tanpa alasannya. */
    expect(skema).toContain('startedAt DateTime? @map("started_at")');
    expect(skema).toMatch(/renewLease` TIDAK menyentuhnya/);
  });
});

describe("tidak ada penyimpan metrik kedua, dan itu keputusan", () => {
  it("lajunya dihitung dari cap waktu barisnya, bukan dari selisih dua pembacaan", () => {
    /*
     * §11 menulis bahwa laju "menuntut dua titik waktu, jadi menuntut riwayat".
     * Itu benar untuk COUNTER. Baris `jobs` bukan counter — ia peristiwa yang
     * membawa cap waktunya sendiri, jadi lajunya satu `COUNT(*)` berjendela.
     */
    expect(metrikTanpaKomentar).toMatch(/created_at > \$\{batas\}/);
    expect(metrikTanpaKomentar).toMatch(/finished_at > \$\{batas\}/);
  });

  it("tidak ada layanan kedua belas: nol rujukan ke Prometheus/Grafana/StatsD", () => {
    /* Kotak ini ~3,6 GB RAM dengan produksi hidup di atasnya. Dua proses lagi
       untuk menyimpan angka yang SUDAH tersimpan adalah ongkos tanpa imbalan. */
    const compose = readFileSync(join(AKAR_REPO, "docker-compose.yml"), "utf8");
    for (const nama of ["prometheus", "grafana", "statsd", "victoriametrics"]) {
      expect(tanpaKomentar(compose).toLowerCase(), nama).not.toContain(nama);
    }
  });

  it("satu pernyataan SQL, bukan enam — angkanya harus saling konsisten", () => {
    /*
     * Kedalaman yang dibaca sesudah sebuah pekerjaan selesai bertentangan
     * dengan laju selesai yang dibaca sebelumnya, dan pembacanya tidak punya
     * cara menduga mana yang lebih baru. Angka yang saling bertentangan lebih
     * buruk daripada angka yang kurang.
     */
    expect(metrikTanpaKomentar.match(/\$queryRaw/g) ?? []).toHaveLength(1);
    expect(metrikTanpaKomentar.match(/FILTER \(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("peta `kind → jalur` DIBANGKITKAN, tidak ditulis lagi sebagai CASE WHEN", () => {
    /* Dua daftar menyimpang tanpa galat: `kind` yang hanya dikenal satu sisi
       jadi baris yang tidak masuk jalur mana pun. */
    expect(metrikTanpaKomentar).toContain("JOB_KINDS[r.kind as JobKind]?.lane");
    expect(metrikTanpaKomentar).not.toMatch(/CASE\s+WHEN/i);
  });
});

describe("`null` berarti TIDAK ADA BAHAN, dan tidak pernah berarti nol", () => {
  it("setiap jalur muncul meski tak punya satu pekerjaan pun", () => {
    /* Jalur yang hilang dari tabel terbaca sebagai jalur yang tidak ada, dan
       jalur yang tidak ada tidak pernah diperiksa orang. */
    expect(Object.keys(JOB_LANES).length).toBeGreaterThan(1);
    expect(metrikTanpaKomentar).toContain("for (const lane of Object.keys(JOB_LANES)) per.set(lane, kosong(lane));");
  });

  it("persentil tanpa sampel `null`, bukan 0", () => {
    const m = dasar();
    expect(m.p95Ms).toBeNull();
    /* Jalur yang tidak menjalankan apa pun dan jalur yang menjalankan pekerjaan
       nol-milidetik terlihat sama bila keduanya dilaporkan `0`. */
    expect(metrikTanpaKomentar).toContain("p50Ms: null");
  });

  it("perkiraan kuras `null` ketika antrean KOSONG", () => {
    expect(drainMinutes(dasar({ depth: 0, completedPerMin: 4 }))).toBeNull();
  });

  it("perkiraan kuras `null` ketika laju selesai NOL — bukan angka besar", () => {
    /*
     * Ini keadaan paling gawat yang bisa dialami antrean: ada yang menunggu dan
     * tak ada yang selesai — pekerjanya mati. Melaporkannya "4.812 menit"
     * terbaca sebagai LAMBAT, sementara yang sebenarnya terjadi adalah TIDAK
     * BERGERAK, dan pembacanya akan menunggu alih-alih memeriksa pekerjanya.
     *
     * Keadaan itu punya sinyalnya sendiri yang sudah ada dan berambang: umur
     * pekerjaan tertua yang belum jalan (02 §14). Fungsi ini tidak
     * mengulanginya, dan tidak menyamarkannya.
     */
    expect(drainMinutes(dasar({ depth: 900, completedPerMin: 0 }))).toBeNull();
  });

  it("perkiraan kuras = kedalaman ÷ laju selesai", () => {
    expect(drainMinutes(dasar({ depth: 10, completedPerMin: 4 }))).toBe(2.5);
  });
});

describe("persentil tidak dirata-ratakan antar `kind`", () => {
  it("yang dipakai nilai TERTINGGI, dan alasannya tertulis", () => {
    /*
     * p95 bukan besaran yang bisa dijumlahkan, jadi p95 per jalur tidak bisa
     * dirata-ratakan dari p95 per `kind`. Yang dipakai nilai terburuk — dan itu
     * angka yang BENAR untuk ambang, sebab gunanya ambang mendeteksi satu jenis
     * yang melambat. Rata-rata justru menyembunyikan tepat apa yang dicari.
     */
    expect(metrikTanpaKomentar).toContain("m.p95Ms = tertinggi(m.p95Ms, r.p95);");
    expect(metrik).toMatch(/p95 bukan besaran yang bisa dijumlahkan/);
  });

  it("`tertinggi` memperlakukan `null` sebagai TIDAK ADA, bukan sebagai nol", () => {
    /* `Math.max(null, 5)` adalah 5; `Math.max(null, -1)` adalah 0. Yang kedua
       mengarang angka dari ketiadaan. */
    expect(metrikTanpaKomentar).toContain("if (a === null) return b;");
    expect(metrikTanpaKomentar).toContain("if (b === null) return a;");
  });
});

describe("permukaan operator: tak terbaca ≠ nol", () => {
  const store = readFileSync(join(AKAR_REPO, "apps/operator/src/lib/operator/store.ts"), "utf8");
  const halaman = readFileSync(
    join(AKAR_REPO, "apps/operator/src/app/(operator)/scheduler/page.tsx"),
    "utf8"
  );

  it("kueri yang gagal memulangkan `null`, bukan daftar kosong", () => {
    /* Tabel `jobs` yang belum dimigrasikan dan antrean yang memang tak punya
       kerja terlihat identik sebagai angka nol — dan yang pertama berarti
       pemasangan ini belum siap. */
    expect(store).toContain("export async function jobMetricsForOperator");
    expect(tanpaKomentar(store)).toMatch(/metrik antrean tak terbaca/);
  });

  it("halamannya mengatakan 'belum bisa dibaca' untuk `null`", () => {
    expect(halaman).toContain("metrics === null");
    expect(halaman).toContain("operator.scheduler.metricsUnavailable");
  });

  it("jumlah SAMPEL ditampilkan bersama persentilnya", () => {
    /* Syarat, bukan hiasan: p95 atas tiga pekerjaan adalah angka bukan fakta,
       dan ambang yang disetel darinya akan berteriak untuk hal normal. */
    expect(halaman).toContain("operator.scheduler.metricsColSamples");
    expect(halaman).toContain("m.samples");
  });

  it("angka yang tidak ada dicetak `—`, bukan `0`", () => {
    expect(halaman).toContain('n === null ? "—" : n');
  });

  it("jendelanya disebut di layar, dari konstanta yang sama", () => {
    /* Angka tanpa jendelanya tidak bisa dibaca: "0,07/menit" atas lima menit
       dan atas sehari adalah dua kenyataan yang berbeda. */
    expect(halaman).toContain("METRICS_WINDOW_MINUTES");
    expect(METRICS_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});
