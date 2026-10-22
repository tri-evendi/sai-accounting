-- Penagihan Indonesia (issue #141): instruksi bayar VA/QRIS pada payments
-- (TIDAK PERNAH data kartu — itu urusan gerbang) + profil penagihan tenant
-- (NPWP lawan transaksi untuk Faktur Pajak kami).

-- AlterTable
ALTER TABLE `payments`
    ADD COLUMN `bank` VARCHAR(20) NULL,
    ADD COLUMN `va_number` VARCHAR(40) NULL,
    ADD COLUMN `qr_string` TEXT NULL,
    ADD COLUMN `expires_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `tenant_billing_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `npwp` VARCHAR(25) NULL,
    `name` VARCHAR(150) NULL,
    `address` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_billing_profiles_tenant_id_key`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
