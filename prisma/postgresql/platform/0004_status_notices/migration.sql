-- ═══════════════════════════════════════════════════════════════════════════
-- PENGUMUMAN STATUS — pemeliharaan & insiden yang diumumkan operator
--
-- Sampai migration ini satu-satunya pengumuman adalah jendela pemeliharaan
-- dari env (`STATUS_MAINTENANCE_FROM/UNTIL`, #374): mengubahnya berarti SSH +
-- membuat ulang container, dan insiden tidak bisa diumumkan sama sekali —
-- halaman status hanya bisa berkata apa yang diukur mesinnya.
--
-- TANPA kolom teks bebas (lihat komentar model): kalimat dirakit dari kamus
-- tiga bahasa. CHECK pada ketiga kosakata — nilai di luar kamus tidak punya
-- kalimat, dan halaman status yang menampilkan kunci kamus mentah merusak
-- satu-satunya hal yang ia jual.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "status_notices" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "component" VARCHAR(20) NOT NULL,
    "phase" VARCHAR(20) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "show_in_app" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "status_notices_kind_check" CHECK ("kind" IN ('maintenance', 'incident')),
    CONSTRAINT "status_notices_component_check" CHECK ("component" IN ('application', 'billing', 'email')),
    CONSTRAINT "status_notices_phase_check"
        CHECK ("phase" IN ('scheduled', 'investigating', 'identified', 'monitoring', 'resolved')),
    CONSTRAINT "status_notices_ends_after_starts" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE INDEX "status_notices_resolved_at_idx" ON "status_notices"("resolved_at");
CREATE INDEX "status_notices_starts_at_idx" ON "status_notices"("starts_at");
