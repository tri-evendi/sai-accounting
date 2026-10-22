-- Pengaturan surel penyedia (issue #169) — supaya "ganti server SMTP" tidak
-- lagi menuntut sesi SSH untuk menyunting .env lalu menggelar ulang.
--
-- SATU baris untuk seluruh pemasangan: kolom `singleton` selalu 1 dan UNIQUE —
-- dua baris berarti dua kebenaran tentang server surel yang sama.
--
-- Kata sandi TIDAK PERNAH tersimpan mentah: hanya sandi-teks AES-256-GCM
-- (`password_ciphertext`) beserta IV dan tag autentikasinya; kuncinya tetap di
-- environment (`SETTINGS_ENCRYPTION_KEY`). Dump basis data yang bocor tanpa env
-- tidak membuka satu kata sandi pun.
--
-- Tabel ini SENGAJA kosong setelah migrasi: tanpa baris, pengirim surel jatuh
-- ke environment (`MAIL_TRANSPORT`/`SMTP_URL`/`MAIL_FROM`) persis seperti
-- sebelum issue ini — penggelaran tidak mengubah perilaku apa pun sampai
-- seorang operator menyimpan pengaturan dari konsol.

-- CreateTable
CREATE TABLE `mail_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `singleton` INTEGER NOT NULL DEFAULT 1,
    `transport` VARCHAR(10) NOT NULL,
    `host` VARCHAR(191) NULL,
    `port` INTEGER NULL,
    `username` VARCHAR(191) NULL,
    `from_address` VARCHAR(191) NOT NULL,
    `password_ciphertext` VARCHAR(512) NULL,
    `password_iv` VARCHAR(64) NULL,
    `password_tag` VARCHAR(64) NULL,
    `last_test_at` DATETIME(3) NULL,
    `last_test_to` VARCHAR(191) NULL,
    `last_test_status` VARCHAR(10) NULL,
    `last_test_message` TEXT NULL,
    `updated_by` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mail_settings_singleton_key`(`singleton`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
