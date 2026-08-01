-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant tahap 3 (issue #136) — email menjadi pengenal login.
--
-- Dua hal, dan keduanya menyusul 0003 (yang sudah menjamin email terisi+unik):
--
-- 1. `username` BERHENTI unik se-pemasangan. Ia tinggal sebagai nama tampilan;
--    Pelanggan B boleh punya `budi` walau Pelanggan A sudah punya. Keunikan
--    per-TENANT ditegakkan lapisan aplikasi (users-directory.ts) — indeks unik
--    per-tenant di sini akan salah selama kolom keduanya belum NOT NULL
--    bersama, dan keunikan lintas-tenant justru yang sedang dibuang.
--
-- 2. `password_reset_tokens` — token atur-ulang kata sandi: TER-HASH (SHA-256,
--    token mentah tidak pernah disimpan), berbatas waktu (`expires_at`),
--    sekali pakai (`used_at`).
-- ─────────────────────────────────────────────────────────────────────────────

-- DropIndex — username tinggal nama tampilan; pencarian login kini lewat email
ALTER TABLE `users` DROP INDEX `users_username_key`;

-- Pencarian per-tenant ("adakah budi di tenant ini?") tetap butuh jalan cepat
CREATE INDEX `users_tenant_id_username_idx` ON `users`(`tenant_id`, `username`);

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_user_id_idx`(`user_id`),
    INDEX `password_reset_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
