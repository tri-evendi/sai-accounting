-- ═══════════════════════════════════════════════════════════════════════════
-- Jejak relay outbox per buku: `outbox_relay_books` (09 §4).
--
-- ══ KENAPA DI KENDALI ════════════════════════════════════════════════════
-- Umur baris outbox tertua yang belum terbit adalah sinyal kesehatan, dan
-- pembacanya (`/api/health`, `watch:health`, konsol `/scheduler`) tidak boleh
-- menyapu setiap basis data PT untuk menjawabnya — probe yang biayanya tumbuh
-- dengan jumlah tenant adalah probe yang suatu hari menjadi beban yang ia
-- ukur. Relay sudah menyentuh setiap buku tiap putaran; ia menulis apa yang
-- dilihatnya di sini, satu baris per buku (upsert).
--
-- `last_pass_at` yang basi = relay mati atau buku itu tak terjangkau. Itulah
-- sebabnya umur saja tidak cukup: relay mati tidak menulis apa pun, dan umur
-- yang tidak diperbarui akan terbaca sehat selamanya.
--
-- Bukan FK ke `companies`: barisnya jejak, dan jejak tetap terbaca setelah
-- perusahaannya dihapus (pola `jobs.company_id`).
--
-- Jam: ditulis Prisma (UTC) — DATABASE.md §4.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Tabel baru; kode lama tidak menyebutnya.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "outbox_relay_books" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "last_pass_at" TIMESTAMP(3) NOT NULL,
    "oldest_unpublished_at" TIMESTAMP(3),
    "unpublished_count" INTEGER NOT NULL DEFAULT 0,
    "published_last_pass" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_relay_books_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_relay_books_company_id_key" ON "outbox_relay_books"("company_id");
CREATE INDEX IF NOT EXISTS "outbox_relay_books_last_pass_at_idx" ON "outbox_relay_books"("last_pass_at");
