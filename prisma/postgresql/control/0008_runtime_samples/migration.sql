-- ═══════════════════════════════════════════════════════════════════════════
-- `runtime_samples` — bahan vonis pemicu tahap 1d (rancangan 09 §3.3, §9)
--
-- Tahap 1d dibuka oleh PENGUKURAN: (a) event loop yang tertahan sampai p95
-- permintaan interaktif terpengaruh, atau (b) memori jalur dokumen yang memaksa
-- `--max-old-space-size` lagi. Sampai migration ini, tidak satu pun diukur —
-- yang ada hanya durasi per pekerjaan (`jobs.started_at`, 0007), dan durasi
-- tidak menjawab keduanya: ekspor 40 detik di proses terpisah tidak menahan
-- satu halaman pun, sementara ekspor 400 ms di dalam permintaan menahan semua.
--
-- ══ KENAPA TABEL SENDIRI, DAN BUKAN KOLOM DI `jobs` ═══════════════════════
-- Kolom memori di `jobs` tampak lebih hemat, dan ditolak karena tiga sebab:
--
--   • `jobs` DIBAGI dengan pelari Go, dan kosakatanya dibangkitkan dari
--     `contract/`. Kolom yang hanya diisi Node menjadi kolom yang Go
--     tinggalkan NULL selamanya, dan pembaca tabel tidak punya cara membedakan
--     "tak terukur" dari "pelari Go";
--   • setiap klaim, perpanjangan lease, dan penyelesaian menulis baris `jobs`
--     — tabel terpanas di kendali. Sampel ditulis SEKALI dan tak pernah
--     diubah; menaruhnya di sini tidak menambah satu tulisan pun ke jalur panas;
--   • pemicu (a) bukan peristiwa pekerjaan sama sekali. `app-customer` tidak
--     menjalankan `jobs`, jadi potret event loop-nya butuh rumah lain apa pun
--     keputusannya — dan dua rumah untuk satu pertanyaan lebih buruk daripada
--     satu.
--
-- Tidak ada layanan metrik (Prometheus dll.), alasan yang sama dengan 0007:
-- satu baris per proses per 5 menit adalah ±290 baris/hari/proses, dipangkas
-- setelah 14 hari — ribuan baris, bukan jutaan.
--
-- ══ DESIMAL, BUKAN FLOAT ═════════════════════════════════════════════════
-- Milidetik dua desimal cukup (resolusi histogram 10 ms), dan `Decimal` adalah
-- kebiasaan skema ini (docs/DATABASE.md). Byte memakai BIGINT: RSS di atas
-- 2 GiB melewati INTEGER.
--
-- ══ EXPAND SAJA ══════════════════════════════════════════════════════════
-- Satu CREATE TABLE baru; tak ada yang dibaca kode lama. Penulisnya fail-soft:
-- kode baru yang berjalan sebelum migration ini diterapkan hanya mencatat
-- galat di log, tidak menjatuhkan permintaan maupun pekerjaan.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "runtime_samples" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "instance" VARCHAR(100) NOT NULL,
    "runtime" VARCHAR(10) NOT NULL,
    "sample_kind" VARCHAR(10) NOT NULL,
    "window_ms" INTEGER,
    "loop_p50_ms" DECIMAL(10,2),
    "loop_p99_ms" DECIMAL(10,2),
    "loop_max_ms" DECIMAL(10,2),
    "job_id" INTEGER,
    "job_kind" VARCHAR(40),
    "duration_ms" INTEGER,
    "heap_used_bytes" BIGINT NOT NULL,
    "rss_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runtime_samples_pkey" PRIMARY KEY ("id"),

    -- Jenis di luar kosakata tidak pernah terbaca kueri vonis mana pun — sampel
    -- yang hilang tanpa galat, dan vonis yang bergeser ke "sampel kurang".
    CONSTRAINT "runtime_samples_sample_kind_check"
        CHECK ("sample_kind" IN ('loop', 'job'))
);

CREATE INDEX "runtime_samples_sample_kind_source_created_at_idx"
    ON "runtime_samples"("sample_kind", "source", "created_at");
CREATE INDEX "runtime_samples_created_at_idx" ON "runtime_samples"("created_at");
CREATE INDEX "runtime_samples_job_id_idx" ON "runtime_samples"("job_id");
