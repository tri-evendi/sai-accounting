-- Jejak audit tingkat TENANT pindah dari berkas ke tabel (issue #484).
--
-- Aditif: satu tabel baru, tidak ada kolom lama yang disentuh. Isinya dipindah
-- oleh `bun run migrate:tenant-audit`, yang MENGGANTI NAMA berkas lamanya —
-- tidak menghapusnya. Menghapus jejak audit secara otomatis adalah kebalikan
-- dari alasan jejak itu ada.
--
-- ══ TANPA FOREIGN KEY KE `tenants` ═════════════════════════════════════════
-- Disengaja, dan inilah inti seluruh isu. Jejak ini mencatat PENGHAPUSAN
-- sebuah tenant; `ON DELETE CASCADE` akan menghapus justru baris yang paling
-- perlu dibaca sesudahnya. `tenant_slug` disalin supaya barisnya tetap terbaca
-- manusia setelah tenant-nya tiada.
--
-- Kebalikan dari migration `0044_audit_logs` di basis data PERUSAHAAN, di mana
-- jejak memang harus mati bersama bukunya. Bedanya bukan selera: jejak PT
-- adalah bagian dari buku PT itu; jejak tenant adalah catatan TENTANG tenant,
-- termasuk tentang akhirnya.
CREATE TABLE `tenant_audit_logs` (
  `id`        INT         NOT NULL AUTO_INCREMENT,
  `legacy_id` VARCHAR(40) NULL,

  `tenant_id`   INT         NOT NULL,
  `tenant_slug` VARCHAR(63) NOT NULL,

  `user_id`     VARCHAR(64)  NOT NULL,
  `username`    VARCHAR(100) NOT NULL,
  `tenant_role` VARCHAR(50)  NULL,

  `action`  VARCHAR(50) NOT NULL,
  `details` TEXT        NULL,

  `ip_address` VARCHAR(45) NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  -- Idempotensi pemindahan ditegakkan CONSTRAINT, bukan periksa-lalu-tulis:
  -- menjalankan skripnya dua kali menabrak kunci ini alih-alih menggandakan
  -- jejak. NULL boleh berulang, jadi baris yang lahir dari aplikasi bebas.
  UNIQUE INDEX `tenant_audit_logs_legacy_id_key` (`legacy_id`),
  INDEX `tenant_audit_logs_tenant_slug_created_at_idx` (`tenant_slug`, `created_at`),
  INDEX `tenant_audit_logs_tenant_id_idx` (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
