-- Aset Tetap + penyusutan otomatis (issue #28).
--
-- Empat tabel baru: kategori aset, aset, penyusutan periodik (satu baris per
-- aset per bulan), dan riwayat pindah lokasi. Plus satu akun COA baru (7103
-- Laba/Rugi Pelepasan Aset Tetap) dan empat mapping akun.
--
-- ── IDR SAJA (bukan valas) ──────────────────────────────────────────────────
-- Aset tetap TIDAK menyimpan currency/rate/base_amount. Bisnis inti SAI adalah
-- trading; aset operasionalnya (kendaraan, alat, bangunan gudang) dibeli dalam
-- rupiah. Menyusutkan aset valas dengan benar butuh perlakuan non-moneter IAS-21
-- (biaya dibekukan pada kurs tanggal perolehan, tak direvaluasi) — jauh di luar
-- "garis lurus dulu" — dan menilainya 1:1 justru bug yang #35/#36 perbaiki. Maka
-- `acquisition_cost` dan semua turunannya adalah IDR base, unit buku besar itu
-- sendiri (sikap yang sama dengan HPP di `buildCogsLines`).
--
-- ── AKUN = kolom Int + FK RESTRICT di migration ini, BUKAN relasi Prisma ─────
-- `asset_account_id`/`accumulated_account_id`/`expense_account_id` menunjuk
-- `accounts.id` dengan FK ON DELETE RESTRICT yang ditambahkan di sini, tetapi
-- tidak dideklarasikan sebagai relasi Prisma — sikap yang sama dengan
-- CompanySetting.opening_journal_id, agar tak menggantung enam back-relation di
-- model Account bersama. Lihat catatan di prisma/schema.prisma.
--
-- Gaya DDL mengikuti 0001/0010/0017 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: fixed_asset_categories (master data → is_active)
CREATE TABLE `fixed_asset_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    -- enum-like: straight_line (garis lurus). Divalidasi z.enum.
    `default_method` VARCHAR(20) NOT NULL DEFAULT 'straight_line',
    -- Umur manfaat default dalam BULAN.
    `default_useful_life_months` INTEGER NOT NULL,
    -- Default mapping akun; disalin ke aset saat pembuatan, bisa di-override.
    `asset_account_id` INTEGER NOT NULL,
    `accumulated_account_id` INTEGER NOT NULL,
    `expense_account_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fixed_asset_categories_name_key`(`name`),
    INDEX `fixed_asset_categories_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: fixed_assets
CREATE TABLE `fixed_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_no` VARCHAR(50) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `acquisition_date` DATETIME(3) NOT NULL,
    -- Uang IDR: Decimal(15,2). Tanpa currency/rate/base_amount — lihat catatan.
    `acquisition_cost` DECIMAL(15, 2) NOT NULL,
    `residual_value` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Umur manfaat dalam BULAN.
    `useful_life_months` INTEGER NOT NULL,
    `depreciation_method` VARCHAR(20) NOT NULL DEFAULT 'straight_line',
    `asset_account_id` INTEGER NOT NULL,
    `accumulated_account_id` INTEGER NOT NULL,
    `expense_account_id` INTEGER NOT NULL,
    `location` VARCHAR(150) NULL,
    -- enum-like: active | disposed.
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    -- Akumulasi penyusutan berjalan (denormalisasi dari fixed_asset_depreciations)
    -- + jangkar idempotensi run bulanan.
    `accumulated_depreciation` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Periode terakhir yang sudah dijurnal (idempotensi). NULL = belum pernah.
    `last_depreciation_year` INTEGER NULL,
    `last_depreciation_month` INTEGER NULL,
    -- Catatan pelepasan; terisi saat status jadi `disposed`.
    `disposal_date` DATETIME(3) NULL,
    `disposal_proceeds` DECIMAL(15, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fixed_assets_asset_no_key`(`asset_no`),
    INDEX `fixed_assets_category_id_idx`(`category_id`),
    INDEX `fixed_assets_status_idx`(`status`),
    INDEX `fixed_assets_acquisition_date_idx`(`acquisition_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: fixed_asset_depreciations (satu baris per aset per bulan)
CREATE TABLE `fixed_asset_depreciations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `accumulated_after` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Satu periode per aset — separuh DB dari jaminan idempotensi (separuh lain
    -- adalah cek jurnal-hidup di postForSource).
    UNIQUE INDEX `fixed_asset_depreciations_asset_id_year_month_key`(`asset_id`, `year`, `month`),
    INDEX `fixed_asset_depreciations_asset_id_idx`(`asset_id`),
    INDEX `fixed_asset_depreciations_year_month_idx`(`year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: fixed_asset_location_histories (pindah lokasi; tanpa jurnal)
CREATE TABLE `fixed_asset_location_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `from_location` VARCHAR(150) NULL,
    `to_location` VARCHAR(150) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fixed_asset_location_histories_asset_id_idx`(`asset_id`),
    INDEX `fixed_asset_location_histories_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: category → accounts (RESTRICT — akun master yang dipakai tak boleh dihapus)
ALTER TABLE `fixed_asset_categories` ADD CONSTRAINT `fixed_asset_categories_asset_account_id_fkey` FOREIGN KEY (`asset_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_asset_categories` ADD CONSTRAINT `fixed_asset_categories_accumulated_account_id_fkey` FOREIGN KEY (`accumulated_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_asset_categories` ADD CONSTRAINT `fixed_asset_categories_expense_account_id_fkey` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: asset → category (RESTRICT) + asset → accounts (RESTRICT)
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `fixed_asset_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_asset_account_id_fkey` FOREIGN KEY (`asset_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_accumulated_account_id_fkey` FOREIGN KEY (`accumulated_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_expense_account_id_fkey` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: depreciation → asset (RESTRICT — baris ini memikul jurnal, aset
-- tak boleh lenyap di bawahnya) ; location history → asset (CASCADE — anak murni)
ALTER TABLE `fixed_asset_depreciations` ADD CONSTRAINT `fixed_asset_depreciations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fixed_asset_location_histories` ADD CONSTRAINT `fixed_asset_location_histories_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Akun COA baru: 7103 Laba/Rugi Pelepasan Aset Tetap ──────────────────────
-- Satu akun menampung laba (kredit) & rugi (debit) pelepasan, seperti 7101 untuk
-- selisih kurs. type = other_income → normal_balance credit. Idempoten: hanya
-- disisipkan bila kode 7103 belum ada (mis. DB yang belum menjalankan seed-coa).
INSERT INTO `accounts` (`code`, `name`, `type`, `normal_balance`, `parent_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT '7103', 'Laba/Rugi Pelepasan Aset Tetap', 'other_income', 'credit', NULL, 'IDR', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `code` FROM `accounts`) `x` WHERE `x`.`code` = '7103');

-- ── Mapping akun aset tetap (issue #28) ─────────────────────────────────────
-- Untuk DB yang sudah ter-seed. DEFAULT_MAPPINGS menangani install baru; ini
-- menyisipkan empat baris 'any' idempoten bila akun targetnya ada dan mapping-nya
-- belum ada — pola yang sama dengan opening_equity (0017) & cash_default (0011).
INSERT INTO `account_mappings` (`key`, `account_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT `k`.`key`, `a`.`id`, 'any', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `accounts` `a`
JOIN (
    SELECT 'fixed_asset' AS `key`, '120101' AS `code`
    UNION ALL SELECT 'accumulated_depreciation', '120102'
    UNION ALL SELECT 'depreciation_expense', '610103'
    UNION ALL SELECT 'disposal_gain_loss', '7103'
) `k` ON `k`.`code` = `a`.`code`
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT `key`, `currency` FROM `account_mappings`) `m`
    WHERE `m`.`key` = `k`.`key` AND `m`.`currency` = 'any'
);
