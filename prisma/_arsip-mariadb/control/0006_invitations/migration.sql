-- Undangan staf lewat email (issue #139) — token ter-hash, berbatas waktu,
-- sekali pakai; pola yang sama dengan password_reset_tokens (0004).

-- CreateTable
CREATE TABLE `invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `company_role` VARCHAR(20) NOT NULL,
    `invited_by_user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invitations_token_hash_key`(`token_hash`),
    INDEX `invitations_tenant_id_idx`(`tenant_id`),
    INDEX `invitations_company_id_idx`(`company_id`),
    INDEX `invitations_email_idx`(`email`),
    INDEX `invitations_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
