-- CreateTable: accounts (Chart of Accounts)
CREATE TABLE `accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `normal_balance` VARCHAR(6) NOT NULL,
    `parent_id` INTEGER NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accounts_code_key`(`code`),
    INDEX `accounts_parent_id_idx`(`parent_id`),
    INDEX `accounts_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey (self-referential hierarchy; RESTRICT so a used parent cannot be deleted)
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
