-- ═══════════════════════════════════════════════════════════════════════════
-- AKUN OPERATOR — dikelola dari layar, berperan, sesinya bisa dicabut
--
-- Sampai migration ini akun konsol hanya ada di env `OPERATOR_USERS`: setiap
-- operator memegang hak PENUH (termasuk eksekusi hapus tenant), menambah akun
-- berarti SSH + restart, dan mencabut sesi berarti memutar
-- `OPERATOR_SESSION_SECRET` (yang mengeluarkan SEMUA orang).
--
-- Akun env tetap berlaku sebagai akun DARURAT `owner` — tabel ini menambah,
-- tidak menggantikan. Kenapa di KENDALI, bukan platform: lihat komentar model
-- `OperatorAccount` di prisma/control/schema.prisma (doktrin #137).
--
-- CHECK pada `role`: Prisma tidak mengenalnya (dan tidak akan menghapusnya).
-- Peran di luar kosakata adalah bentuk data yang paling berbahaya di tabel ini
-- — matriks izin di kode tidak mengenalnya, dan penjaga yang menerima nilai
-- asing sebagai "bukan owner" pun masih menebak.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "operator_accounts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "totp_ciphertext" TEXT NOT NULL,
    "totp_iv" VARCHAR(32) NOT NULL,
    "totp_tag" VARCHAR(32) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMP(3),
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operator_accounts_role_check"
        CHECK ("role" IN ('owner', 'billing', 'support', 'viewer')),
    CONSTRAINT "operator_accounts_session_version_check" CHECK ("session_version" >= 1)
);

CREATE UNIQUE INDEX "operator_accounts_name_key" ON "operator_accounts"("name");
CREATE INDEX "operator_accounts_is_active_idx" ON "operator_accounts"("is_active");
