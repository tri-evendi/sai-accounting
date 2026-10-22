-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTER LISENSI ON-PREMISE (konsol `/licences`, keputusan pemilik 22 Okt
-- 2026 "opsi a")
--
-- Menggantikan tabel tangan "lisensi yang sudah diterbitkan" di
-- `docs/ONPREM-SERAH-TERIMA.md` §1. Konsol MENCATAT; penandatanganan tetap
-- LURING — kunci privat Ed25519 tidak pernah menyentuh server, CI, maupun repo
-- (06-KEAMANAN §3.7). Tidak ada kolom, unggahan, atau env untuk kunci privat.
--
-- ══ ARSIP, BUKAN KEWENANGAN ════════════════════════════════════════════════
-- Kewenangan lisensi ada pada TANDA TANGAN berkasnya, diverifikasi di mesin
-- customer (rancangan §8, 06 §3.7: "tidak pernah disimpan sebagai baris").
-- Tabel ini hanya arsip penerbitan: tidak satu pun kode di `app-customer`
-- atau di mana pun boleh membacanya untuk memutuskan status lisensi. Dijaga
-- `tests/licence-register-archive.test.ts`. Karena itu `revoked` di sini hanya
-- CATATAN: lisensi luring tidak bisa dicabut dari jauh.
--
-- Dua tabel:
--   • `licence_customers`        — satu baris per customer on-premise;
--   • `licence_register_entries` — satu baris per PENERBITAN (versi). Terbit
--     ulang (perpanjangan / ubah batas) = versi baru; yang lama `superseded`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "licence_customers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact" VARCHAR(300),
    -- Tenant SaaS asal bila customer pindah dari SaaS ke on-premise. Id dari
    -- basis data KENDALI — tanpa FK lintas basis data (docs/DATABASE.md).
    "source_tenant_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licence_customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "licence_customers_name_idx" ON "licence_customers"("name");
CREATE INDEX "licence_customers_source_tenant_id_idx" ON "licence_customers"("source_tenant_id");

CREATE TABLE "licence_register_entries" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- `licenceId` yang DIBERIKAN ke `licence:issue --id`, ditetapkan saat draf
    -- dibuat — berkas unggahan wajib membawa id yang sama.
    "licence_id" VARCHAR(64) NOT NULL,
    -- Isian `customer` di dalam lisensi, persis seperti yang ditandatangani.
    "licensee_name" VARCHAR(200) NOT NULL,
    "max_companies" INTEGER NOT NULL,
    "max_users" INTEGER NOT NULL,
    -- `all` atau daftar kunci modul berkoma.
    "modules" VARCHAR(500) NOT NULL,
    "support_ends_on" DATE,
    "max_version" VARCHAR(40),
    "notes" TEXT,
    -- Diisi saat berkas `.sai` diunggah dan LULUS verifikasi + pencocokan.
    "file_content" TEXT,
    "file_sha256" CHAR(64),
    "payload_json" TEXT,
    "issued_at" TIMESTAMP(3),
    "uploaded_by" VARCHAR(100),
    "uploaded_at" TIMESTAMP(3),
    "revoked_by" VARCHAR(100),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" VARCHAR(500),
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licence_register_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "licence_register_entries_customer_id_fkey" FOREIGN KEY ("customer_id")
        REFERENCES "licence_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "licence_register_entries_status_check"
        CHECK ("status" IN ('draft', 'issued', 'superseded', 'revoked')),
    CONSTRAINT "licence_register_entries_limits_check"
        CHECK ("max_companies" >= 0 AND "max_users" >= 0 AND "version" >= 1),
    CONSTRAINT "licence_register_entries_sha256_check"
        CHECK ("file_sha256" IS NULL OR "file_sha256" ~ '^[0-9a-f]{64}$'),
    -- Draf belum punya berkas; selain draf WAJIB punya berkas terverifikasi.
    CONSTRAINT "licence_register_entries_file_check"
        CHECK (("status" = 'draft') = ("file_content" IS NULL)),
    CONSTRAINT "licence_register_entries_file_hash_check"
        CHECK (("file_content" IS NULL) = ("file_sha256" IS NULL))
);

CREATE UNIQUE INDEX "licence_register_entries_licence_id_key" ON "licence_register_entries"("licence_id");
CREATE UNIQUE INDEX "licence_register_entries_customer_id_version_key" ON "licence_register_entries"("customer_id", "version");
CREATE INDEX "licence_register_entries_customer_id_idx" ON "licence_register_entries"("customer_id");
CREATE INDEX "licence_register_entries_status_idx" ON "licence_register_entries"("status");
