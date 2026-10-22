-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant tahap 5 (issue #138) — pendaftaran mandiri + pembatas laju
-- persisten.
--
-- `registrations`: pendaftaran yang BELUM terverifikasi. Tenant + User(owner)
-- + TenantMembership baru lahir (satu transaksi) saat tautan verifikasi
-- diklik; sebelum itu TIDAK ADA basis data yang dibuat dan tidak ada baris
-- users/tenants yang menempati email unik.
--
-- `rate_limit_counters`: penghitung jendela-tetap yang selamat dari restart
-- dan terbagi antar-instance — syarat endpoint yang terbuka ke internet.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE `registrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `terms_accepted_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `registrations_token_hash_key`(`token_hash`),
    INDEX `registrations_email_idx`(`email`),
    INDEX `registrations_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limit_counters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(160) NOT NULL,
    `window_started_at` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rate_limit_counters_key_key`(`key`),
    INDEX `rate_limit_counters_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
