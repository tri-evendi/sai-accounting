-- Riwayat pengiriman faktur ke pelanggan (issue #465).
--
-- Aditif: satu tabel baru, tidak ada kolom lama yang disentuh, tidak ada satu
-- angka laporan pun yang bergeser. Buku yang belum pernah mengirim apa pun
-- hanya memiliki tabel kosong.
--
-- `sent_by_user_id` TANPA foreign key — DISENGAJA. Sejak issue #104 pengguna
-- hidup di basis data KENDALI, sementara tabel ini hidup di basis data
-- perusahaan; FK lintas basis data tidak mungkin, dan nama pengirimnya dibaca
-- lewat `users-directory.ts`. Aturan yang sama dipakai kolom pengguna lain di
-- buku ini (lihat docs/MULTI-COMPANY.md).
--
-- ON DELETE CASCADE pada fakturnya: riwayat kirim adalah milik dokumen itu.
-- Faktur yang dihapus tidak meninggalkan catatan menagih yang menggantung tanpa
-- ada yang bisa dibuka.
CREATE TABLE `invoice_sends` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `invoice_id`      INT          NOT NULL,
  `channel`         VARCHAR(20)  NOT NULL,
  `recipient`       VARCHAR(190) NOT NULL,
  `sent_by_user_id` INT          NOT NULL,
  `sent_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `invoice_sends_invoice_id_idx` (`invoice_id`),
  INDEX `invoice_sends_sent_at_idx` (`sent_at`),
  CONSTRAINT `invoice_sends_invoice_id_fkey`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
