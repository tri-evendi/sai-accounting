-- Surat Jalan / Delivery Order sebagai dokumen kelas satu (issue #14).
--
-- Dua tabel baru: `delivery_orders` (header — nomor, tanggal, dokumen sumber
-- kontrak/faktur, consignee, kendaraan/kontainer, catatan, status) dan
-- `delivery_order_items` (baris — barang stok + bentuk bags/kg mengikuti
-- `contract_items`, plus kuantitas KG yang dikeluarkan dari stok).
--
-- ── AKUNTANSI: TIDAK ADA ATURAN JURNAL BARU ─────────────────────────────────
-- Migration ini TIDAK menyentuh accounts/journals/mappings. HPP di app ini
-- diakui hanya pada pergerakan `stock` bertipe `out` (D: HPP, K: Persediaan,
-- biaya rata-rata tertimbang). Menerbitkan DO membuat baris `stock` `out` lalu
-- mempostingnya lewat jalur yang SUDAH ADA (`postForSource stock_movement`),
-- bukan sumber jurnal baru. Lihat komentar model di schema.prisma.
--
-- ── FK RESTRICT ke dokumen sumber & master ──────────────────────────────────
-- contract/invoice/consignee/item = ON DELETE RESTRICT: dokumen atau master
-- yang disebut sebuah surat jalan tak boleh dihapus dari bawahnya. Baris detail
-- (delivery_order_items) → header CASCADE, pola header+lines standar.
--
-- Gaya DDL mengikuti 0019/0021 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: delivery_orders (header surat jalan)
CREATE TABLE `delivery_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `no` VARCHAR(50) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `contract_id` INTEGER NULL,
    `invoice_id` INTEGER NULL,
    `consignee_id` INTEGER NULL,
    `vehicle_no` VARCHAR(50) NULL,
    `container_no` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    -- enum-like: issued | canceled
    `status` VARCHAR(20) NOT NULL DEFAULT 'issued',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `delivery_orders_no_key`(`no`),
    INDEX `delivery_orders_date_idx`(`date`),
    INDEX `delivery_orders_contract_id_idx`(`contract_id`),
    INDEX `delivery_orders_invoice_id_idx`(`invoice_id`),
    INDEX `delivery_orders_consignee_id_idx`(`consignee_id`),
    INDEX `delivery_orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: delivery_order_items (baris surat jalan — bags/kg + kuantitas KG)
CREATE TABLE `delivery_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_order_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `item_name` VARCHAR(100) NOT NULL,
    `bags` INTEGER NOT NULL DEFAULT 0,
    `kg_per_bag` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    -- Kuantitas KG yang dikeluarkan dari stok (= bags × kg_per_bag). Decimal(15,3).
    `quantity` DECIMAL(15, 3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `delivery_order_items_delivery_order_id_idx`(`delivery_order_id`),
    INDEX `delivery_order_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: delivery_order → contract / invoice / consignee (RESTRICT)
ALTER TABLE `delivery_orders` ADD CONSTRAINT `delivery_orders_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `delivery_orders` ADD CONSTRAINT `delivery_orders_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `delivery_orders` ADD CONSTRAINT `delivery_orders_consignee_id_fkey` FOREIGN KEY (`consignee_id`) REFERENCES `consignees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: delivery_order_item → delivery_order (CASCADE) / item (RESTRICT)
ALTER TABLE `delivery_order_items` ADD CONSTRAINT `delivery_order_items_delivery_order_id_fkey` FOREIGN KEY (`delivery_order_id`) REFERENCES `delivery_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `delivery_order_items` ADD CONSTRAINT `delivery_order_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
