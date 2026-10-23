-- ═══════════════════════════════════════════════════════════════════════════
-- e-Faktur Coretax: identitas pajak Coretax, kredensial PJAP milik PT, dan
-- jejak kiriman faktur keluaran (docs/EFAKTUR.md).
--
-- EXPAND-ONLY (DATABASE.md §7.1): semua kolom baru NULLable atau ber-DEFAULT,
-- tabel baru tidak dirujuk kode lama. Image sebelumnya tetap benar di skema
-- ini, jadi migration-nya aman dijalankan sebelum swap.
--
-- Tidak ada backfill: NIK/NITKU pelanggan dan NITKU penjual tidak pernah
-- dicatat, dan kosong punya arti yang sah (NITKU kosong = kantor pusat,
-- NPWP + 000000 — dihitung saat berkas dibuat, bukan disimpan).
-- ═══════════════════════════════════════════════════════════════════════════

-- Pelanggan: identitas pembeli Coretax.
ALTER TABLE "customers" ADD COLUMN "nik" VARCHAR(16);
ALTER TABLE "customers" ADD COLUMN "nitku" VARCHAR(22);
ALTER TABLE "customers" ADD COLUMN "efaktur_trx_code" VARCHAR(2);

-- Penjual: ID TKU + kredensial PJAP (tersandi bertiga, pola #466).
ALTER TABLE "company_settings" ADD COLUMN "nitku" VARCHAR(22);
ALTER TABLE "company_settings" ADD COLUMN "efaktur_provider" VARCHAR(20);
ALTER TABLE "company_settings" ADD COLUMN "efaktur_client_id" VARCHAR(120);
ALTER TABLE "company_settings" ADD COLUMN "efaktur_secret_ciphertext" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "efaktur_secret_iv" VARCHAR(32);
ALTER TABLE "company_settings" ADD COLUMN "efaktur_secret_tag" VARCHAR(32);
ALTER TABLE "company_settings" ADD COLUMN "efaktur_is_production" BOOLEAN NOT NULL DEFAULT false;

-- Jejak kiriman: satu baris per upaya kirim satu faktur.
CREATE TABLE "efaktur_submissions" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" VARCHAR(80) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "xml" TEXT NOT NULL,
    "provider_ref" VARCHAR(100),
    "tax_invoice_number" VARCHAR(30),
    "status_message" TEXT,
    "status_observed_at" TIMESTAMP(3),
    "requested_by_user_id" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "efaktur_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "efaktur_submissions_idempotency_key_key" ON "efaktur_submissions"("idempotency_key");
CREATE UNIQUE INDEX "efaktur_submissions_invoice_id_revision_key" ON "efaktur_submissions"("invoice_id", "revision");
CREATE INDEX "efaktur_submissions_invoice_id_idx" ON "efaktur_submissions"("invoice_id");
CREATE INDEX "efaktur_submissions_status_idx" ON "efaktur_submissions"("status");
CREATE INDEX "efaktur_submissions_requested_by_user_id_idx" ON "efaktur_submissions"("requested_by_user_id");

ALTER TABLE "efaktur_submissions"
    ADD CONSTRAINT "efaktur_submissions_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kosakata status dijaga di DB juga: ia dibaca DUA bahasa (Node menulis,
-- Go membaca untuk memutuskan apakah masih perlu menanyai PJAP). Tabelnya
-- baru, jadi tidak ada baris lama yang bisa menggagalkan constraint ini.
ALTER TABLE "efaktur_submissions"
    ADD CONSTRAINT "efaktur_submissions_status_check"
    CHECK ("status" IN ('queued', 'submitted', 'approved', 'rejected', 'failed', 'cancel_requested', 'canceled'));

-- Penyedia: kolom baru, semua baris NULL — constraint aman dipasang langsung.
ALTER TABLE "company_settings"
    ADD CONSTRAINT "company_settings_efaktur_provider_check"
    CHECK ("efaktur_provider" IS NULL OR "efaktur_provider" IN ('mock', 'pjap'));
