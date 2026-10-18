-- ═══════════════════════════════════════════════════════════════════════════
-- LOGO PERUSAHAAN — diunggah pemilik PT di Pengaturan, dicetak di kepala PDF
--
-- Satu tabel per buku PT, seperti identitas perusahaan lainnya
-- (`company_settings`). Gambarnya di basis data (bukan volume `documents`)
-- supaya ikut cadangan dan bisa dibaca saat PDF dibuat di server (lampiran
-- surel faktur) tanpa jalur berkas.
--
-- Unggahan baru menonaktifkan yang lama; paling banyak satu baris aktif
-- (indeks unik parsial). `created_by_user_id` adalah id GLOBAL pengguna di
-- basis data kendali — tanpa FK, sesuai aturan multi-perusahaan.
--
-- CHECK menyamai validasi kode (`@sai/core/image-file`): PNG/JPEG, ≤ 512 KB,
-- sisi 64–4096 px.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "company_logos" (
    "id" SERIAL NOT NULL,
    "mime_type" VARCHAR(20) NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_logos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_logos_mime_check" CHECK ("mime_type" IN ('image/png', 'image/jpeg')),
    CONSTRAINT "company_logos_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 524288 AND "byte_size" = octet_length("content")),
    CONSTRAINT "company_logos_dimensions_check"
        CHECK (LEAST("width", "height") >= 64 AND GREATEST("width", "height") <= 4096),
    CONSTRAINT "company_logos_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "company_logos_active_key" ON "company_logos"("is_active") WHERE "is_active";
CREATE INDEX "company_logos_created_at_idx" ON "company_logos"("created_at");
