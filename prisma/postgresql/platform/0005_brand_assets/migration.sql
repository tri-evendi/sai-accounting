-- ═══════════════════════════════════════════════════════════════════════════
-- LOGO PRODUK yang diunggah operator (konsol `/brand`)
--
-- Sampai migration ini lambang produk hanya ada di kode
-- (`packages/ui/src/brand/mark.ts`), dan menggantinya berarti rilis. Kini
-- operator bisa mengunggah gambar pengganti; tanpa baris aktif, lambang bawaan
-- dari kode yang tampil.
--
-- Gambarnya disimpan di basis data (bukan volume) supaya ikut cadangan
-- `pg_dumpall` dan bisa dibaca kedua aplikasi tanpa volume bersama. Riwayat
-- tetap tersimpan: unggahan baru menonaktifkan yang lama, dan paling banyak
-- satu baris aktif per `kind` (indeks unik parsial).
--
-- CHECK menyamai validasi kode (`@sai/core/image-file`): PNG/JPEG, ≤ 512 KB,
-- sisi 256–4096 px.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "brand_assets" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "mime_type" VARCHAR(20) NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brand_assets_kind_check" CHECK ("kind" IN ('mark')),
    CONSTRAINT "brand_assets_mime_check" CHECK ("mime_type" IN ('image/png', 'image/jpeg')),
    CONSTRAINT "brand_assets_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 524288 AND "byte_size" = octet_length("content")),
    CONSTRAINT "brand_assets_dimensions_check"
        CHECK (LEAST("width", "height") >= 256 AND GREATEST("width", "height") <= 4096),
    CONSTRAINT "brand_assets_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "brand_assets_kind_active_key" ON "brand_assets"("kind") WHERE "is_active";
CREATE INDEX "brand_assets_kind_created_at_idx" ON "brand_assets"("kind", "created_at");
