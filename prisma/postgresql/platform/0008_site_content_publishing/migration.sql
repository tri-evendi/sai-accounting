-- ═══════════════════════════════════════════════════════════════════════════
-- ISI HALAMAN DEPAN: DRAF → TERBIT, DENGAN RIWAYAT (konsol `/content`,
-- permintaan pemilik 23 Okt 2026)
--
-- `site_contents` (0001) menyimpan satu penimpa per kunci+bahasa yang LANGSUNG
-- tayang saat disimpan: tanpa draf, tanpa riwayat, tanpa jalan kembali ke
-- versi sebelumnya. Migration ini menambah empat tabel:
--
--   • `site_content_entries`      keadaan sekarang: satu baris `published` dan
--                                 paling banyak satu baris `draft` per
--                                 kunci+bahasa. Draf ber-`value` NULL berarti
--                                 "kembalikan ke bawaan saat diterbitkan".
--   • `site_content_publications` satu baris per penerbitan (siapa, kapan,
--                                 catatan, jumlah perubahan).
--   • `site_content_revisions`    satu baris per kunci+bahasa yang berubah di
--                                 sebuah penerbitan: nilai sebelum & sesudah.
--                                 NULL = kalimat bawaan dari kamus. Dari sini
--                                 versi lama bisa dikembalikan sebagai draf.
--   • `site_content_previews`     token pratinjau berumur pendek (hanya
--                                 SHA-256-nya yang disimpan). Aplikasi customer
--                                 memakai drafnya hanya bila tokennya sah.
--
-- ══ EXPAND SAJA (docs/DATABASE.md §7.1) ═══════════════════════════════════
-- `site_contents` TIDAK diubah dan tetap dibaca/ditulis:
--   • aplikasi versi lama tetap membacanya selama penukaran image;
--   • aplikasi baru menulis ulang hasil setiap penerbitan ke tabel itu
--     (dual-write), jadi rollback ke image lama tetap menampilkan kalimat yang
--     sama.
-- Paruh CONTRACT (DROP TABLE `site_contents` + cabut dual-write) menyusul di
-- migration tersendiri setelah tidak ada image yang membacanya, dan didaftarkan
-- di `KONTRAKSI_DIIZINKAN` (`tests/expand-contract.test.ts`).
--
-- ══ DATA LAMA DISALIN, BUKAN DIPINDAH ═════════════════════════════════════
-- Setiap baris `site_contents` yang lolos aturan baru disalin sebagai baris
-- `published` dengan nilai APA ADANYA (tanpa trim), supaya kalimat yang tayang
-- sesudah deploy sama persis dengan sebelumnya. Satu penerbitan `baseline`
-- mencatatnya di riwayat. Baris yang tidak lolos (bahasa asing, kunci di luar
-- `landing.<nama>`, nilai kosong atau > 4000 karakter) tetap di `site_contents`
-- dan tidak tayang — sama seperti hari ini, karena `applySiteContent` sudah
-- mengabaikannya.
--
-- Seluruh berkas bisa dijalankan ulang tanpa efek ganda (IF NOT EXISTS +
-- ON CONFLICT DO NOTHING + penerbitan `baseline` paling banyak satu). Dibuktikan
-- `tests/site-content-migration.test.ts` di PGlite.
--
-- Produksi 23 Okt 2026: `site_contents` berisi 0 baris.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "site_content_entries" (
    "id" SERIAL NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "content_key" VARCHAR(120) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    -- NULL hanya untuk draf: "terbitkan sebagai kembali ke bawaan".
    "value" TEXT,
    "updated_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_content_entries_locale_check" CHECK ("locale" IN ('id', 'en', 'zh')),
    CONSTRAINT "site_content_entries_status_check" CHECK ("status" IN ('draft', 'published')),
    CONSTRAINT "site_content_entries_key_check" CHECK ("content_key" ~ '^landing\.[A-Za-z][A-Za-z0-9]*$'),
    CONSTRAINT "site_content_entries_value_check" CHECK (
        ("value" IS NULL AND "status" = 'draft')
        OR ("value" IS NOT NULL AND char_length("value") BETWEEN 1 AND 4000)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_content_entries_locale_content_key_status_key"
    ON "site_content_entries"("locale", "content_key", "status");
CREATE INDEX IF NOT EXISTS "site_content_entries_status_idx" ON "site_content_entries"("status");

CREATE TABLE IF NOT EXISTS "site_content_publications" (
    "id" SERIAL NOT NULL,
    -- publish = penerbitan biasa · baseline = salinan dari `site_contents`
    -- (migration ini) · purge = pembersihan kunci yang sudah tidak ada di kamus.
    "kind" VARCHAR(20) NOT NULL,
    "note" VARCHAR(200),
    "change_count" INTEGER NOT NULL,
    "published_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_content_publications_kind_check" CHECK ("kind" IN ('publish', 'baseline', 'purge')),
    CONSTRAINT "site_content_publications_change_count_check" CHECK ("change_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "site_content_publications_created_at_idx" ON "site_content_publications"("created_at");

CREATE TABLE IF NOT EXISTS "site_content_revisions" (
    "id" SERIAL NOT NULL,
    "publication_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "content_key" VARCHAR(120) NOT NULL,
    -- NULL = kalimat bawaan dari kamus.
    "previous_value" TEXT,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_content_revisions_publication_id_fkey" FOREIGN KEY ("publication_id")
        REFERENCES "site_content_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "site_content_revisions_locale_check" CHECK ("locale" IN ('id', 'en', 'zh')),
    -- Kunci revisi `purge` boleh kunci yang sudah dicabut dari kamus, tapi
    -- bentuknya tetap bentuk kunci pendaratan.
    CONSTRAINT "site_content_revisions_key_check" CHECK ("content_key" ~ '^landing\.[A-Za-z][A-Za-z0-9]*$'),
    CONSTRAINT "site_content_revisions_value_check" CHECK (
        ("value" IS NULL OR char_length("value") BETWEEN 1 AND 4000)
        AND ("previous_value" IS NULL OR char_length("previous_value") BETWEEN 1 AND 4000)
    ),
    -- Revisi yang tidak mengubah apa pun bukan revisi.
    CONSTRAINT "site_content_revisions_changed_check" CHECK ("value" IS DISTINCT FROM "previous_value")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_content_revisions_publication_id_locale_content_key_key"
    ON "site_content_revisions"("publication_id", "locale", "content_key");
CREATE INDEX IF NOT EXISTS "site_content_revisions_locale_content_key_idx"
    ON "site_content_revisions"("locale", "content_key");

CREATE TABLE IF NOT EXISTS "site_content_previews" (
    "id" SERIAL NOT NULL,
    -- SHA-256 (heks) atas token. Tokennya sendiri hanya ada di tautan.
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_previews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_content_previews_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_content_previews_token_hash_key" ON "site_content_previews"("token_hash");
CREATE INDEX IF NOT EXISTS "site_content_previews_expires_at_idx" ON "site_content_previews"("expires_at");

-- ── Salin penimpa yang sudah tayang ─────────────────────────────────────────
INSERT INTO "site_content_entries"
    ("locale", "content_key", "status", "value", "updated_by", "created_at", "updated_at")
SELECT "locale", "content_key", 'published', "value", "updated_by", "created_at", "updated_at"
FROM "site_contents"
WHERE "locale" IN ('id', 'en', 'zh')
  AND "content_key" ~ '^landing\.[A-Za-z][A-Za-z0-9]*$'
  AND char_length("value") BETWEEN 1 AND 4000
ON CONFLICT ("locale", "content_key", "status") DO NOTHING;

-- Satu penerbitan `baseline`, hanya bila ada yang disalin dan belum pernah dibuat.
INSERT INTO "site_content_publications" ("kind", "note", "change_count", "published_by", "updated_at")
SELECT 'baseline', 'site_contents (migration 0008)', count(*), 'migration', CURRENT_TIMESTAMP
FROM "site_content_entries"
WHERE "status" = 'published'
HAVING count(*) > 0
   AND NOT EXISTS (SELECT 1 FROM "site_content_publications" WHERE "kind" = 'baseline');

INSERT INTO "site_content_revisions"
    ("publication_id", "locale", "content_key", "previous_value", "value", "updated_at")
SELECT b."id", e."locale", e."content_key", NULL, e."value", CURRENT_TIMESTAMP
FROM "site_content_entries" e
CROSS JOIN (
    SELECT "id" FROM "site_content_publications" WHERE "kind" = 'baseline' ORDER BY "id" LIMIT 1
) b
WHERE e."status" = 'published'
ON CONFLICT ("publication_id", "locale", "content_key") DO NOTHING;
