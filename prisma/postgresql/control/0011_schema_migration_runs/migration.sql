-- ═══════════════════════════════════════════════════════════════════════════
-- Jejak fan-out migration BUKU: `schema_migration_runs` (09 §6).
--
-- ══ KENAPA ADA ═══════════════════════════════════════════════════════════
-- Sejak `db:migrate:release`, migration buku boleh GAGAL SEBAGIAN tanpa
-- menahan rilis: buku yang gagal ditutup gerbang skema per perusahaan, yang
-- lain dilayani image baru. Keadaan "berapa buku belum di kepala, dan
-- kenapa" karena itu harus terbaca SESUDAH container `migrate` hilang —
-- oleh `/api/health` (satu kata) dan oleh orang yang melanjutkan rilis dari
-- tengah. Log `docker compose run --rm` tidak bertahan untuk itu.
--
-- Satu baris per PUTARAN, hasil per buku di `details` (JSON) — pola yang sama
-- dengan `conformance_runs`. Kebenaran tentang skema SATU buku tetap
-- `_prisma_migrations` buku itu sendiri (konsol `/backup`, gerbang skema);
-- baris ini mencatat apa yang DICOBA putaran dan apa jawabannya.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Tabel baru; kode lama tidak menyebutnya.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "schema_migration_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "target_migration" VARCHAR(191) NOT NULL,
    "companies_total" INTEGER NOT NULL DEFAULT 0,
    "companies_migrated" INTEGER NOT NULL DEFAULT 0,
    "companies_skipped" INTEGER NOT NULL DEFAULT 0,
    "companies_failed" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schema_migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "schema_migration_runs_finished_at_idx" ON "schema_migration_runs"("finished_at");
