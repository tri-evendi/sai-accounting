-- Manufaktur, tahap 1: resep (BOM), stasiun kerja, dan routing (issue #495 butir 3).
--
-- ══ KENAPA TAHAP INI TIDAK MEMBAWA SATU AKUN PUN ═══════════════════════════
-- `coa-seeding.ts` memperingatkan akun yang lahir tanpa mekanisme pengisinya:
-- ia bersaldo nol selamanya sambil tetap memenuhi setiap pemilih akun, dan
-- setiap orang yang melihatnya harus memutuskan lagi apakah ia rusak atau
-- memang kosong. Karena itu WIP, Tenaga Kerja Langsung, dan Overhead Diserap
-- TIDAK dibuat di sini — ia menyusul bersama perintah produksi, yaitu tahap
-- pertama yang benar-benar bisa mempostingnya.
--
-- Urutan yang sama sudah terbukti pada biaya impor: dokumen penyesuaian harga
-- pokok (#533) lebih dulu, akun bea masuk & freight menyusul.
--
-- ══ TIDAK ADA MESIN PERSEDIAAN KEDUA ═══════════════════════════════════════
-- Tabel di sini menyimpan RESEP dan RENCANA. Tidak satu pun menyimpan saldo,
-- dan tidak satu pun menyentuh `stock_movements`. Produksi nanti mengeluarkan
-- dan memasukkan barang lewat gerakan stok yang sudah ada, dengan rata-rata
-- tertimbang yang sudah ada.
--
-- ══ BERTINGKAT LEWAT DATA, BUKAN LEWAT KOLOM ═══════════════════════════════
-- Sebuah bahan boleh merupakan keluaran resep lain. Tidak ada kolom "level":
-- level adalah sifat pohonnya saat dihitung, dan menyimpannya berarti ia bisa
-- basi terhadap resep yang melahirkannya. Penurunannya (beserta pendeteksian
-- resep yang melingkar) hidup di `src/lib/manufacturing/bom.ts`, yang murni
-- dan bisa diuji tanpa MySQL.

CREATE TABLE `bills_of_material` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `code`            VARCHAR(30) NOT NULL,
  `output_item_id`  INT NOT NULL,
  `output_quantity` DECIMAL(15,3) NOT NULL,
  `notes`           TEXT NULL,
  `is_active`       BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3) NOT NULL,
  UNIQUE INDEX `bills_of_material_code_key`(`code`),
  INDEX `bills_of_material_output_item_id_idx`(`output_item_id`),
  INDEX `bills_of_material_is_active_idx`(`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bom_components` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `bom_id`        INT NOT NULL,
  `item_id`       INT NOT NULL,
  `quantity`      DECIMAL(15,3) NOT NULL,
  `scrap_percent` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL,
  INDEX `bom_components_bom_id_idx`(`bom_id`),
  INDEX `bom_components_item_id_idx`(`item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `work_centers` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(20) NOT NULL,
  `name`          VARCHAR(100) NOT NULL,
  `labor_rate`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  `overhead_rate` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `is_active`     BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL,
  UNIQUE INDEX `work_centers_code_key`(`code`),
  INDEX `work_centers_is_active_idx`(`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bom_operations` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `bom_id`          INT NOT NULL,
  `sequence`        INT NOT NULL,
  `work_center_id`  INT NOT NULL,
  `name`            VARCHAR(100) NOT NULL,
  `standard_hours`  DECIMAL(15,3) NOT NULL,
  `created_at`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3) NOT NULL,
  -- Dua langkah bernomor sama tidak punya urutan yang bisa ditentukan, dan
  -- laporan varians membacanya berurutan.
  UNIQUE INDEX `bom_operations_bom_id_sequence_key`(`bom_id`, `sequence`),
  INDEX `bom_operations_work_center_id_idx`(`work_center_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CASCADE dari resep ke barisnya: baris resep tidak punya arti tanpa resepnya.
-- RESTRICT ke `items`: barang yang dipakai resep DINONAKTIFKAN, tidak dihapus.
ALTER TABLE `bills_of_material`
  ADD CONSTRAINT `bills_of_material_output_item_id_fkey`
  FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `bom_components`
  ADD CONSTRAINT `bom_components_bom_id_fkey`
  FOREIGN KEY (`bom_id`) REFERENCES `bills_of_material`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bom_components`
  ADD CONSTRAINT `bom_components_item_id_fkey`
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `bom_operations`
  ADD CONSTRAINT `bom_operations_bom_id_fkey`
  FOREIGN KEY (`bom_id`) REFERENCES `bills_of_material`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bom_operations`
  ADD CONSTRAINT `bom_operations_work_center_id_fkey`
  FOREIGN KEY (`work_center_id`) REFERENCES `work_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
