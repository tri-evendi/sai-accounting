-- Transaksi berulang (issue #469, tahap 2).
--
-- Aditif: dua tabel baru, tidak ada kolom lama yang disentuh, dan tidak ada
-- satu angka laporan pun yang bergeser. Buku tanpa templat hanya memiliki dua
-- tabel kosong.
--
-- Templat MENUNJUK dokumen sumbernya (`kind` + `source_id`) alih-alih
-- menyalin kolomnya. Tanpa foreign key, dengan sengaja: dua tipe sumber tidak
-- bisa menunjuk satu tabel, dan pola ini sama dengan `journals.source_type` &
-- `source_id` yang sudah dipakai mesin posting.
CREATE TABLE `recurring_templates` (
  `id`   INT          NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,

  `kind`      VARCHAR(20) NOT NULL,
  `source_id` INT         NOT NULL,

  `frequency`       VARCHAR(20) NOT NULL,
  `start_date`      DATETIME(3) NOT NULL,
  `end_date`        DATETIME(3) NULL,
  `max_occurrences` INT         NULL,

  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `recurring_templates_is_active_idx` (`is_active`),
  INDEX `recurring_templates_kind_idx` (`kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Kunci unik di bawah inilah yang sesungguhnya menjaga idempotensi: penjadwal
-- yang berjalan dua kali dalam sehari MENABRAK constraint, bukan melahirkan
-- dokumen kembar. Kuncinya memakai TANGGAL KEJADIAN, bukan tanggal hari ini —
-- kalau tidak, satu templat melahirkan dokumen baru setiap kali penjadwal jalan.
CREATE TABLE `recurring_occurrences` (
  `id`          INT         NOT NULL AUTO_INCREMENT,
  `template_id` INT         NOT NULL,

  `occurrence_date` DATETIME(3) NOT NULL,
  `status`          VARCHAR(20) NOT NULL,
  `document_id`     INT         NULL,
  `note`            TEXT        NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `recurring_occurrences_template_id_occurrence_date_key`
    (`template_id`, `occurrence_date`),
  INDEX `recurring_occurrences_status_idx` (`status`),
  CONSTRAINT `recurring_occurrences_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `recurring_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
