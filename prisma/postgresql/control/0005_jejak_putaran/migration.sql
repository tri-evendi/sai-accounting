-- ═══════════════════════════════════════════════════════════════════════════
-- JEJAK PUTARAN PINDAH KE KENDALI — penjadwal, kesesuaian data, cadangan
--
-- Kenapa di KENDALI, bukan platform: lihat komentar model `SchedulerRun` di
-- packages/db/prisma/control/schema.prisma (doktrin #137).
--
-- ══ LANGKAH EXPAND, BUKAN PINDAH SEKALI JALAN ══════════════════════════════
-- Ketiga tabel ini masih ada di `sai_platform` dan TIDAK dihapus di sini.
-- Barisnya diangkut terpisah (`bun run trails:move`), pembacanya dialihkan di
-- rilis yang sama, dan DROP di platform menyusul di rilis BERIKUTNYA — versi
-- aplikasi lama yang masih berjalan selama deploy tidak boleh kehilangan
-- tabelnya di tengah putaran.
--
-- DDL di bawah disalin dari prisma/postgresql/platform/0001_baseline tanpa satu
-- perubahan tipe, supaya pengangkutan barisnya menjadi INSERT apa adanya.
--
-- `IF NOT EXISTS`: aman dijalankan pada pemasangan yang tabelnya sudah dibuat
-- lebih dulu oleh pengangkutan manual.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "scheduler_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "invoices_issued" INTEGER NOT NULL DEFAULT 0,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "status_changes" INTEGER NOT NULL DEFAULT 0,
    "adoptions" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "conformance_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "companies_checked" INTEGER NOT NULL DEFAULT 0,
    "companies_failed" INTEGER NOT NULL DEFAULT 0,
    "finding_count" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conformance_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "backup_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "error" TEXT,
    "artifact" VARCHAR(255),
    "size_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduler_runs_started_at_idx" ON "scheduler_runs"("started_at");
CREATE INDEX IF NOT EXISTS "conformance_runs_finished_at_idx" ON "conformance_runs"("finished_at");
CREATE INDEX IF NOT EXISTS "conformance_runs_status_finished_at_idx" ON "conformance_runs"("status", "finished_at");
CREATE INDEX IF NOT EXISTS "backup_runs_finished_at_idx" ON "backup_runs"("finished_at");
CREATE INDEX IF NOT EXISTS "backup_runs_status_finished_at_idx" ON "backup_runs"("status", "finished_at");
