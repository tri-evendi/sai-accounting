-- PEMBERITAHUAN DALAM APLIKASI — kanal yang tidak ada saat paling dibutuhkan.
--
-- KENAPA: empat perusahaan mandek di wisaya penyiapan selama enam hari
-- (issue #416). Tidak ada satu pun kanal yang memberi tahu siapa pun — tidak
-- pemiliknya, tidak operatornya. Bahkan sesudah diperbaiki, satu-satunya cara
-- mengabari mereka adalah surel yang dikirim tangan, satu per satu.
--
-- DI BASIS DATA KENDALI, bukan buku perusahaan: pemberitahuan milik PENGGUNA,
-- dan pengguna hidup di kendali sejak #104. Menaruhnya per-perusahaan berarti
-- orang dengan dua PT punya dua kotak masuk yang tak pernah bertemu — dan
-- pemberitahuan terpenting (penyiapan belum selesai) justru lahir sebelum ada
-- buku yang bisa dibaca.
--
-- `dedupe_key` + UNIQUE = doktrin `reminder_logs` (#140): produser yang jalan
-- dua kali menabrak constraint, bukan melahirkan kembar. Penjadwal per-jam
-- karena itu aman memanggilnya per jam.
CREATE TABLE `notifications` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `user_id`    INT NOT NULL,
  `kind`       VARCHAR(40) NOT NULL,
  `title`      VARCHAR(150) NOT NULL,
  `body`       VARCHAR(1000) NOT NULL,
  `href`       VARCHAR(255) NULL,
  `dedupe_key` VARCHAR(120) NOT NULL,
  `read_at`    DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `notifications_user_id_kind_dedupe_key_key` (`user_id`, `kind`, `dedupe_key`),
  KEY `notifications_user_id_read_at_idx` (`user_id`, `read_at`),
  CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
