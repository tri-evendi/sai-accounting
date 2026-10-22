-- ═══════════════════════════════════════════════════════════════════════════
-- `db_instances` + `companies.db_instance_key` — tahap 4 rancangan 09 §9:
-- buku PT dipecah ke beberapa instans `db-postgres`.
--
-- ══ TABEL KOSONG = PERILAKU HARI INI ═════════════════════════════════════
-- Instans BAWAAN tidak punya baris di sini. Ia dinyatakan dengan
-- `companies.db_instance_key IS NULL`, dan URL-nya tetap template di
-- environment (`COMPANY_DATABASE_URL_TEMPLATE` → `DATABASE_URL` →
-- `CONTROL_DATABASE_URL`, urutan yang sama sejak #104). Migration ini tidak
-- menyisipkan satu baris pun dan tidak menyentuh baris `companies` mana pun:
-- setiap PT yang ada tetap di instans bawaan sampai seseorang memindahkannya
-- dengan `bun run tenant:move` — dengan sadar, satu per satu.
--
-- ══ TIDAK ADA RAHASIA DI SINI ════════════════════════════════════════════
-- `url_env_var` menyimpan NAMA env var, bukan URL. Bentuknya dipaku CHECK:
-- `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE`. Tanpa itu satu baris yang ditulis
-- tergesa bisa menunjuk `CONTROL_DATABASE_URL`, dan buku sebuah PT akan
-- dicari — lalu DIBUAT, oleh penyediaan — di basis data kendali.
--
-- ══ FK KE `key`, BUKAN KE `id` ═══════════════════════════════════════════
-- Menyimpang dari kebiasaan `<entitas>_id` di docs/DATABASE.md, dan sengaja:
-- kunci itulah yang dicerminkan nama env var dan konfigurasi pohon Go, ia
-- tidak pernah berubah seumur instansnya, dan `companies` yang dibaca dengan
-- mata (konsol, psql saat insiden) langsung menyebut servernya. `RESTRICT`:
-- instans yang masih memegang buku tidak bisa dihapus.
--
-- ══ EXPAND SAJA ══════════════════════════════════════════════════════════
-- Satu CREATE TABLE baru, satu kolom NULLABLE tanpa default, satu FK yang
-- seketika sah (semua nilainya NULL), satu indeks biasa. Kode lama tidak
-- menyebut kolom itu dan terus menulis `companies` tanpa mengetahuinya —
-- yang berarti NULL, yang berarti instans bawaan: persis yang benar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "db_instances" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(32) NOT NULL,
    "url_env_var" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "db_instances_pkey" PRIMARY KEY ("id"),

    -- `default` dicadangkan untuk instans bawaan (yang tak punya baris), supaya
    -- tidak ada dua cara menyebut satu server.
    CONSTRAINT "db_instances_key_check"
        CHECK ("key" ~ '^[a-z][a-z0-9_]{0,31}$' AND "key" <> 'default'),

    CONSTRAINT "db_instances_url_env_var_check"
        CHECK ("url_env_var" ~ '^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE$')
);

CREATE UNIQUE INDEX "db_instances_key_key" ON "db_instances"("key");
CREATE INDEX "db_instances_is_active_idx" ON "db_instances"("is_active");

ALTER TABLE "companies" ADD COLUMN "db_instance_key" VARCHAR(32);

CREATE INDEX "companies_db_instance_key_idx" ON "companies"("db_instance_key");

ALTER TABLE "companies" ADD CONSTRAINT "companies_db_instance_key_fkey"
    FOREIGN KEY ("db_instance_key") REFERENCES "db_instances"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE;
