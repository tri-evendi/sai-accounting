-- DOKUMEN BIAYA IMPOR (issue #495 butir 1).
--
-- Dokumen ini TIDAK menerbitkan hutang: tagihannya sudah tercatat sebagai baris
-- `supplier_transactions` bertipe `purchase` (yang jurnalnya mendebet Persediaan
-- dan mengkredit Hutang Usaha). Yang dikerjakan dokumen ini hanya membagi nilai
-- itu ke barangnya: yang masih di gudang lewat baris `cost_adjust`, yang sudah
-- terjual lewat reklasifikasi ke Selisih Harga Pokok.
--
-- `purchase_id` UNIK — satu tagihan disebar SEKALI. Ia bukan hiasan: penyebaran
-- kedua atas tagihan yang sama menggandakan harga pokok tanpa satu pun galat,
-- dan constraint inilah satu-satunya penjaga yang tetap berlaku ketika dua
-- permintaan datang bersamaan.
CREATE TABLE `landed_cost_documents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `number` VARCHAR(30) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `purchase_id` INTEGER NOT NULL,
  `basis` VARCHAR(10) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `capitalized_amount` DECIMAL(15, 2) NOT NULL,
  `expensed_amount` DECIMAL(15, 2) NOT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `landed_cost_documents_number_key`(`number`),
  UNIQUE INDEX `landed_cost_documents_purchase_id_key`(`purchase_id`),
  INDEX `landed_cost_documents_date_idx`(`date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Setiap angka hasil hitungan DISIMPAN, bukan dihitung ulang saat ditampilkan:
-- `on_hand_quantity` (saldo barang saat dokumen dibuat) bergerak setiap hari,
-- jadi pembagian yang dihitung ulang bulan depan akan berselisih dengan jurnal
-- yang sudah terbit atas dokumen yang sama.
CREATE TABLE `landed_cost_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `item_id` INTEGER NOT NULL,
  `receipt_movement_id` INTEGER NULL,
  `adjustment_movement_id` INTEGER NULL,
  `quantity` DECIMAL(15, 3) NOT NULL,
  `value` DECIMAL(15, 2) NOT NULL,
  `on_hand_quantity` DECIMAL(15, 3) NOT NULL,
  `allocated` DECIMAL(15, 2) NOT NULL,
  `capitalized` DECIMAL(15, 2) NOT NULL,
  `expensed` DECIMAL(15, 2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `landed_cost_items_document_id_idx`(`document_id`),
  INDEX `landed_cost_items_item_id_idx`(`item_id`),
  INDEX `landed_cost_items_receipt_movement_id_idx`(`receipt_movement_id`),
  INDEX `landed_cost_items_adjustment_movement_id_idx`(`adjustment_movement_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `landed_cost_documents`
  ADD CONSTRAINT `landed_cost_documents_purchase_id_fkey`
  FOREIGN KEY (`purchase_id`) REFERENCES `supplier_transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `landed_cost_items`
  ADD CONSTRAINT `landed_cost_items_document_id_fkey`
  FOREIGN KEY (`document_id`) REFERENCES `landed_cost_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, bukan CASCADE: barang yang pernah menanggung biaya impor tidak
-- boleh lenyap dan membawa serta bukti kenapa harga pokoknya seperti itu.
-- Master data dinonaktifkan, tidak dihapus (docs/DATABASE.md §1.3).
ALTER TABLE `landed_cost_items`
  ADD CONSTRAINT `landed_cost_items_item_id_fkey`
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL untuk kedua gerakan: kalau barisnya hilang, dokumen ini tetap harus
-- bisa dibaca — angkanya sudah disimpan di sini, yang hilang cuma tautannya.
ALTER TABLE `landed_cost_items`
  ADD CONSTRAINT `landed_cost_items_receipt_movement_id_fkey`
  FOREIGN KEY (`receipt_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `landed_cost_items`
  ADD CONSTRAINT `landed_cost_items_adjustment_movement_id_fkey`
  FOREIGN KEY (`adjustment_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
