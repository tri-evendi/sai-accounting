-- ═══════════════════════════════════════════════════════════════════════════
-- JEJAK AUDIT BIDANG OPERATOR — dari berkas ke tabel
-- (dok 14 §5: syarat pemisahan `apps/operator`)
--
-- Sampai migration ini jejak operator di-`appendFile` ke
-- `data/audit/operators/audit.jsonl` di volume `audit`: dibaca UTUH setiap
-- kali, tidak ter-paginasi, tidak ikut `pg_dump`, dan terikat pada SATU
-- container yang memasang volumenya. Masalah yang sama persis dengan #370
-- (jejak PT) dan #484 (jejak tenant), yang sudah memindahkan dua jejak lainnya.
--
-- Rumahnya `sai_platform`, dengan sebab yang sama seperti `site_settings` dan
-- `mail_settings`: ia milik PENYEDIA, bukan pelanggan, dan layarnya konsol
-- operator.
--
-- `legacy_id` diisi HANYA oleh `bun run migrate:operator-audit`: id entri JSONL
-- lama (`<epoch>-<acak>`). UNIK, jadi pemindahan idempoten lewat constraint,
-- bukan periksa-lalu-tulis. NULL berulang diizinkan PostgreSQL pada kolom unik.
--
-- Tanpa FK ke mana pun: akun operator hidup di env (`OPERATOR_USERS`), dan
-- percobaan masuk yang GAGAL mencatat nama yang DIKETIK — yang memang tidak
-- ada sebagai akun.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "operator_audit_logs" (
    "id" SERIAL NOT NULL,
    "legacy_id" VARCHAR(40),
    "operator" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "details" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_audit_logs_legacy_id_key" ON "operator_audit_logs"("legacy_id");
CREATE INDEX "operator_audit_logs_created_at_idx" ON "operator_audit_logs"("created_at");
CREATE INDEX "operator_audit_logs_operator_created_at_idx" ON "operator_audit_logs"("operator", "created_at");
CREATE INDEX "operator_audit_logs_action_idx" ON "operator_audit_logs"("action");
