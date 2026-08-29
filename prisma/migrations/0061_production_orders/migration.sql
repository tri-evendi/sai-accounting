-- Manufaktur, tahap 2: perintah produksi & Barang Dalam Proses (#495 butir 3).
--
-- ══ AKUNNYA LAHIR DI SINI, BUKAN DI 0060 ═══════════════════════════════════
-- Migrasi 0060 sengaja tidak membawa satu akun pun: akun tanpa mekanisme
-- pengisinya bersaldo nol selamanya sambil memenuhi setiap pemilih akun
-- (`coa-seeding.ts`). Tahap inilah yang bisa mempostingnya, jadi di sinilah
-- 1106 Barang Dalam Proses, 5103 Beban Upah Langsung, dan 5104 Beban Overhead
-- Pabrik mulai berarti. Ketiganya disemai `coa-seeding` untuk buku yang
-- modul `inventory`-nya aktif — bukan oleh migrasi ini.
--
-- ══ SATU JURNAL PER PERINTAH, BUKAN PER GERAKAN ════════════════════════════
-- `stock_movements.production_order_id` bukan sekadar jejak: `buildStock-
-- MovementEntry` MENOLAK memposting gerakan yang punya nilai di sana. Bahan
-- yang keluar ke produksi tidak menjadi HPP melainkan Barang Dalam Proses, dan
-- jurnalnya diterbitkan SEKALI oleh perintah produksinya. Tanpa penolakan itu,
-- memposting ulang gerakannya lewat jalur biasa akan membebankan HPP di atas
-- nilai yang sudah pindah ke WIP — dua kali, tanpa satu pun galat.
--
-- ══ SNAPSHOT, BUKAN CERMIN ═════════════════════════════════════════════════
-- Baris & operasi perintah menyalin resep dan tarif stasiun kerja saat
-- diterbitkan. Menaikkan tarif upah bulan depan karena itu tidak menulis ulang
-- harga pokok yang sudah diposting — doktrin yang sama dengan
-- `contract_items.item_name`.

ALTER TABLE `stock_movements` ADD COLUMN `production_order_id` INT NULL AFTER `supplier_id`;
CREATE INDEX `stock_movements_production_order_id_idx` ON `stock_movements`(`production_order_id`);

CREATE TABLE `production_orders` (
  `id`                INT NOT NULL AUTO_INCREMENT,
  `order_no`          VARCHAR(50) NOT NULL,
  `bom_id`            INT NULL,
  `output_item_id`    INT NOT NULL,
  `date`              DATETIME(3) NOT NULL,
  `planned_quantity`  DECIMAL(15,3) NOT NULL,
  `produced_quantity` DECIMAL(15,3) NULL,
  `status`            VARCHAR(20) NOT NULL DEFAULT 'draft',
  `notes`             TEXT NULL,
  `cost_center_id`    INT NULL,
  `created_at`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3) NOT NULL,
  UNIQUE INDEX `production_orders_order_no_key`(`order_no`),
  INDEX `production_orders_bom_id_idx`(`bom_id`),
  INDEX `production_orders_output_item_id_idx`(`output_item_id`),
  INDEX `production_orders_status_idx`(`status`),
  INDEX `production_orders_date_idx`(`date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `production_order_components` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `production_order_id` INT NOT NULL,
  `item_id`             INT NOT NULL,
  `item_name`           VARCHAR(100) NOT NULL,
  `planned_quantity`    DECIMAL(15,3) NOT NULL,
  `issued_quantity`     DECIMAL(15,3) NULL,
  `issued_cost`         DECIMAL(15,2) NULL,
  `created_at`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          DATETIME(3) NOT NULL,
  INDEX `production_order_components_production_order_id_idx`(`production_order_id`),
  INDEX `production_order_components_item_id_idx`(`item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `production_order_operations` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `production_order_id` INT NOT NULL,
  `sequence`            INT NOT NULL,
  `name`                VARCHAR(100) NOT NULL,
  `work_center_id`      INT NULL,
  `standard_hours`      DECIMAL(15,3) NOT NULL,
  `actual_hours`        DECIMAL(15,3) NULL,
  `labor_rate`          DECIMAL(15,2) NOT NULL DEFAULT 0,
  `overhead_rate`       DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          DATETIME(3) NOT NULL,
  UNIQUE INDEX `production_order_operations_po_sequence_key`(`production_order_id`, `sequence`),
  INDEX `production_order_operations_work_center_id_idx`(`work_center_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- RESTRICT ke master (resep, barang, stasiun kerja, pusat biaya): yang pernah
-- dipakai perintah produksi DINONAKTIFKAN, tidak dihapus keras.
-- CASCADE dari perintah ke barisnya: baris tak punya arti tanpa perintahnya.
ALTER TABLE `production_orders`
  ADD CONSTRAINT `production_orders_bom_id_fkey`
  FOREIGN KEY (`bom_id`) REFERENCES `bills_of_material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `production_orders`
  ADD CONSTRAINT `production_orders_output_item_id_fkey`
  FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `production_orders`
  ADD CONSTRAINT `production_orders_cost_center_id_fkey`
  FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `production_order_components`
  ADD CONSTRAINT `production_order_components_production_order_id_fkey`
  FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `production_order_components`
  ADD CONSTRAINT `production_order_components_item_id_fkey`
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `production_order_operations`
  ADD CONSTRAINT `production_order_operations_production_order_id_fkey`
  FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `production_order_operations`
  ADD CONSTRAINT `production_order_operations_work_center_id_fkey`
  FOREIGN KEY (`work_center_id`) REFERENCES `work_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_movements`
  ADD CONSTRAINT `stock_movements_production_order_id_fkey`
  FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
