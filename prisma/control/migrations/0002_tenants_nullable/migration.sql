-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant tahap 1 (issue #134, epik #133) — langkah 1 dari 4.
--
-- SEMUA kolom baru NULLABLE dan tanpa keunikan pada `email`: urutan migrasi
-- pemasangan yang sudah berjalan (docs/MULTI-TENANT.md §8) tidak boleh ditukar:
--   1. migration ini (nullable)
--   2. scripts/adopt-tenant.ts        — buat satu Tenant, tautkan perusahaan +
--      pengguna, isi email (disiapkan operator, bukan ditebak mesin)
--   3. scripts/prove-tenant-adoption.ts — read-only, exit != 0 bila ada yang
--      kosong/kembar
--   4. migration 0003 (NOT NULL + unik) — HANYA setelah langkah 3 lulus
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(50) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
    `plan_key` VARCHAR(30) NOT NULL DEFAULT 'trial',
    `trial_ends_at` DATETIME(3) NULL,
    `max_companies` INTEGER NOT NULL DEFAULT 1,
    `max_users` INTEGER NOT NULL DEFAULT 3,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    INDEX `tenants_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_memberships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tenant_memberships_user_id_idx`(`user_id`),
    UNIQUE INDEX `tenant_memberships_tenant_id_user_id_key`(`tenant_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable — nullable dulu; NOT NULL menyusul di 0003 setelah adopsi terbukti
ALTER TABLE `companies` ADD COLUMN `tenant_id` INTEGER NULL;

-- AlterTable — email TANPA indeks unik dulu: keunikan baru dikunci 0003,
-- setelah skrip pembuktian menjamin tidak ada email kembar
ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255) NULL,
    ADD COLUMN `email_verified_at` DATETIME(3) NULL,
    ADD COLUMN `tenant_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `companies_tenant_id_idx` ON `companies`(`tenant_id`);

-- CreateIndex
CREATE INDEX `users_tenant_id_idx` ON `users`(`tenant_id`);

-- AddForeignKey — RESTRICT: menghapus tenant yang masih punya perusahaan /
-- pengguna berarti membuang registry buku & akun lewat cascade yang sunyi
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
