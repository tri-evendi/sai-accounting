-- Server surel milik TENANT sendiri.
--
-- Aditif: satu tabel baru, tidak ada kolom lama yang disentuh. Tenant yang
-- belum mengisinya tidak punya baris sama sekali, dan itu berarti "pakai
-- pengaturan penyedia" — persis perilaku hari ini.
--
-- Kata sandi disimpan sebagai SEGEL AES-256-GCM (lib/settings-crypto.ts),
-- bukan teks. Tiga kolomnya kosong bersamaan = tidak ada kata sandi tersimpan;
-- relai yang mengautentikasi lewat IP juga sah.
--
-- ON DELETE CASCADE: pengaturan surel adalah milik tenant itu. Tenant yang
-- dihapus tidak boleh meninggalkan kredensial SMTP yang menggantung tanpa
-- pemilik.
CREATE TABLE `tenant_mail_settings` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `tenant_id` INT          NOT NULL,

  `transport` VARCHAR(10)  NOT NULL DEFAULT 'file',
  `host`      VARCHAR(191) NULL,
  `port`      INT          NULL,
  `username`  VARCHAR(191) NULL,

  `from_address`        VARCHAR(191) NULL,
  `password_ciphertext` VARCHAR(512) NULL,
  `password_iv`         VARCHAR(64)  NULL,
  `password_tag`        VARCHAR(64)  NULL,
  `archive_address`     VARCHAR(191) NULL,

  `last_test_at`      DATETIME(3)  NULL,
  `last_test_to`      VARCHAR(191) NULL,
  `last_test_status`  VARCHAR(10)  NULL,
  `last_test_message` TEXT         NULL,

  `updated_by` VARCHAR(50) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_mail_settings_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_mail_settings_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
