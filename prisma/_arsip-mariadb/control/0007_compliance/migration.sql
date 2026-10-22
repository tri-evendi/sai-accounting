-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant tahap 9 (issue #142) — kepatuhan & siklus hidup akun.
--
-- `tenant_deletion_requests`: permintaan penghapusan EKSPLISIT (UU PDP) dengan
-- masa tenggang; eksekusinya skrip operator bergerbang bukti, dan buku besar
-- TIDAK ikut terhapus — retensi UU KUP 10 tahun (docs/COMPLIANCE.md).
--
-- `registrations.terms_version`/`privacy_version`: persetujuan S&K/privasi
-- dicatat BESERTA VERSI dokumennya — tanpa versi, "sudah setuju" tidak
-- membuktikan apa-apa begitu dokumennya berubah. Nullable: baris lama lahir
-- sebelum kolomnya ada; alur daftar selalu mengisinya.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE `registrations` ADD COLUMN `terms_version` VARCHAR(30) NULL,
    ADD COLUMN `privacy_version` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `tenant_deletion_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `requested_by_user_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `grace_ends_at` DATETIME(3) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `executed_at` DATETIME(3) NULL,
    `retention_until` DATETIME(3) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tenant_deletion_requests_tenant_id_idx`(`tenant_id`),
    INDEX `tenant_deletion_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_deletion_requests` ADD CONSTRAINT `tenant_deletion_requests_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
