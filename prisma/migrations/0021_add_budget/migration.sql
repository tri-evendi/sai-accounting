-- Anggaran & Target (issue #29).
--
-- Dua tabel baru: `budgets` (anggaran satu akun COA per bulan) dan
-- `sales_targets` (target penjualan per bulan, opsional per pelanggan/komoditas).
-- Keduanya adalah RENCANA yang dibandingkan dengan realisasi buku besar — bukan
-- sumber jurnal. Migration ini TIDAK menyentuh accounts/journals/mappings; ia
-- hanya menambah tabel rencana + FK RESTRICT ke master (accounts/customers/items).
--
-- ── IDR SAJA (bukan valas) ──────────────────────────────────────────────────
-- `amount` adalah IDR base (unit buku besar). Tanpa currency/rate/base_amount:
-- rencana tak "diselesaikan pada kurs" apa pun — ia dibandingkan dengan realisasi
-- yang sudah IDR base. Sikap yang sama dengan aset tetap (#28).
--
-- ── AKUN/PELANGGAN/ITEM = FK RESTRICT di sini, BUKAN relasi Prisma ───────────
-- Sama seperti 0019 (fixed assets): kolom Int + FK ON DELETE RESTRICT ditambah
-- di migration ini, tak dideklarasikan sebagai relasi Prisma, agar tak
-- menggantung back-relation di hub Account/Customer/Item.
--
-- Gaya DDL mengikuti 0019/0017 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: budgets (anggaran satu akun per bulan, IDR base)
CREATE TABLE `budgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    -- Uang IDR: Decimal(15,2). Tanpa currency/rate/base_amount — lihat catatan.
    `amount` DECIMAL(15, 2) NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Satu anggaran per akun per bulan.
    UNIQUE INDEX `budgets_account_id_year_month_key`(`account_id`, `year`, `month`),
    INDEX `budgets_account_id_idx`(`account_id`),
    INDEX `budgets_year_month_idx`(`year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: sales_targets (target penjualan per bulan, opsional per pelanggan/komoditas)
CREATE TABLE `sales_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    -- Opsional; NULL = target lintas-pelanggan / lintas-komoditas.
    `customer_id` INTEGER NULL,
    `item_id` INTEGER NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Satu baris per (periode, pelanggan, komoditas). MySQL memperlakukan NULL
    -- sebagai berbeda, jadi kunci ini menjaga duplikat pada baris bertag penuh.
    UNIQUE INDEX `sales_targets_year_month_customer_id_item_id_key`(`year`, `month`, `customer_id`, `item_id`),
    INDEX `sales_targets_year_month_idx`(`year`, `month`),
    INDEX `sales_targets_customer_id_idx`(`customer_id`),
    INDEX `sales_targets_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: budget → accounts (RESTRICT — akun master yang dipakai tak boleh dihapus)
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: sales_target → customers / items (RESTRICT; nullable = target umum)
ALTER TABLE `sales_targets` ADD CONSTRAINT `sales_targets_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales_targets` ADD CONSTRAINT `sales_targets_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
