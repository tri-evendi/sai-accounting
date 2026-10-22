-- Retur penjualan & pembelian — sales & purchase returns (issue #27).
--
-- A return reverses PART of an origin document (a sales invoice, or a supplier
-- `purchase` transaction), adjusting stock, piutang/utang and PPN. Every return
-- references its origin so the total returned can be capped at what was
-- transacted ("tidak bisa meretur melebihi kuantitas/nilai dokumen asal").
--
-- WHAT THIS MIGRATION ADDS NO ACCOUNTS FOR: returns reuse the existing Chart of
-- Accounts and `account_mappings` untouched — a sales return debits `sales_default`
-- (4101) + `vat_out` (2103) and credits `ar_default` (1102xx); a purchase return
-- debits `ap_default` (2101) and credits `inventory` (1104) + `vat_in` (1105).
-- No new mapping slot, no new COA row.
--
-- CURRENCY: a return inherits the origin document's `currency`/`rate` and is
-- booked at THAT rate (a partial reversal of the origin, valued as the origin was).
-- `rate`/`base_amount` are NULLable with the same posture as everywhere else
-- (migrations 0005/0008): an unrated foreign origin has no honest IDR value, so
-- Zod refuses to create such a return rather than book it 1:1.
--
-- SALES vs PURCHASE ASYMMETRY: a sales invoice HAS line items, so a sales return
-- references the source LINE (`invoice_item_id`) and the over-return cap is
-- per-line quantity. A supplier `purchase` is a single net amount with no lines,
-- so a purchase return references the origin DOCUMENT (`purchase_id`) and the cap
-- is by net VALUE. Both item tables carry an optional `item_id` → `items` so the
-- goods can move back through the existing Stock mechanism (sales return → in,
-- purchase return → out); NULL means the line is not tracked in inventory, which
-- is honest given invoice lines are free-text, not FKs to `items`.

-- CreateTable
CREATE TABLE `sales_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_no` VARCHAR(50) NOT NULL,
    `invoice_id` INTEGER NOT NULL,
    `customer_id` INTEGER NULL,
    `date` DATETIME(3) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(15, 2) NULL,
    `base_amount` DECIMAL(15, 2) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'posted',
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `sales_returns_return_no_key`(`return_no`),
    INDEX `sales_returns_invoice_id_idx`(`invoice_id`),
    INDEX `sales_returns_customer_id_idx`(`customer_id`),
    INDEX `sales_returns_date_idx`(`date`),
    INDEX `sales_returns_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sales_return_id` INTEGER NOT NULL,
    `invoice_item_id` INTEGER NOT NULL,
    `item_name` VARCHAR(100) NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `price` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `item_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `sales_return_items_sales_return_id_idx`(`sales_return_id`),
    INDEX `sales_return_items_invoice_item_id_idx`(`invoice_item_id`),
    INDEX `sales_return_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `return_no` VARCHAR(50) NOT NULL,
    `purchase_id` INTEGER NOT NULL,
    `supplier_id` INTEGER NULL,
    `date` DATETIME(3) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(15, 2) NULL,
    `base_amount` DECIMAL(15, 2) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'posted',
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `purchase_returns_return_no_key`(`return_no`),
    INDEX `purchase_returns_purchase_id_idx`(`purchase_id`),
    INDEX `purchase_returns_supplier_id_idx`(`supplier_id`),
    INDEX `purchase_returns_date_idx`(`date`),
    INDEX `purchase_returns_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_return_id` INTEGER NOT NULL,
    `item_name` VARCHAR(100) NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `price` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `item_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `purchase_return_items_purchase_return_id_idx`(`purchase_return_id`),
    INDEX `purchase_return_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_return_items` ADD CONSTRAINT `sales_return_items_sales_return_id_fkey` FOREIGN KEY (`sales_return_id`) REFERENCES `sales_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_return_items` ADD CONSTRAINT `sales_return_items_invoice_item_id_fkey` FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_return_items` ADD CONSTRAINT `sales_return_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `supplier_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_purchase_return_id_fkey` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
