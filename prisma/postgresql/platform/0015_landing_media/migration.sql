-- ═══════════════════════════════════════════════════════════════════════════
-- GAMBAR & BUKTI SOSIAL HALAMAN DEPAN (konsol `/landing/media`)
--
-- Melanjutkan migration 0014 (`landing_settings`). Dua bagian:
--
--   1. `landing_images` — berkas gambar unggahan operator: gambar utama hero,
--      galeri tangkapan layar, gambar pratinjau tautan (OG), foto testimoni,
--      logo klien, logo mitra. Pola `brand_assets` (0005): isi di basis data
--      supaya ikut cadangan `pg_dumpall` dan bisa dibaca kedua aplikasi tanpa
--      volume bersama. Baris TIDAK PERNAH diubah sesudah dibuat (sidiknya
--      dirujuk dari JSON setelan dan dari URL yang di-cache selamanya).
--      CHECK menyamai validasi kode (`@sai/core/landing-media`): PNG/JPEG/WebP
--      (SVG tidak pernah), ≤ 1 MB, sisi 32–4096 px. Metadata (EXIF/XMP/teks)
--      sudah dibuang kode sebelum disimpan.
--
--   2. Kolom baru di `landing_settings` — daftar testimoni, logo klien, mitra
--      resmi, gambar hero, galeri, dan rujukan gambar OG. Teks JSON seperti
--      kolom 0014; NULL = perilaku hari ini (seksi tidak ada, purwarupa yang
--      digambar kode tetap tampil, gambar OG bawaan).
--
-- ══ EXPAND SAJA ══════════════════════════════════════════════════════════
-- Tabel baru + kolom NULLABLE tanpa default. Kode lama tidak menyebutnya.
-- Bisa dijalankan ulang (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "landing_images" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "mime_type" VARCHAR(20) NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "landing_images_kind_check"
        CHECK ("kind" IN ('hero', 'gallery', 'og', 'testimonial', 'client_logo', 'partner_logo')),
    CONSTRAINT "landing_images_mime_check" CHECK ("mime_type" IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT "landing_images_size_check"
        CHECK ("byte_size" > 0 AND "byte_size" <= 1048576 AND "byte_size" = octet_length("content")),
    CONSTRAINT "landing_images_dimensions_check"
        CHECK (LEAST("width", "height") >= 32 AND GREATEST("width", "height") <= 4096),
    CONSTRAINT "landing_images_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS "landing_images_kind_created_at_idx" ON "landing_images"("kind", "created_at");

ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "testimonials_json" TEXT;
ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "client_logos_json" TEXT;
ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "partners_json" TEXT;
ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "hero_image_json" TEXT;
ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "gallery_json" TEXT;
ALTER TABLE "landing_settings" ADD COLUMN IF NOT EXISTS "og_image_json" TEXT;
