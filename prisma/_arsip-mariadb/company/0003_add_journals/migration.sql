-- CreateTable: journals (double-entry header)
CREATE TABLE `journals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` VARCHAR(30) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'general',
    `source_type` VARCHAR(30) NULL,
    `source_id` INTEGER NULL,
    `note` TEXT NULL,
    `is_reversed` BOOLEAN NOT NULL DEFAULT false,
    `reversal_of_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `journals_number_key`(`number`),
    INDEX `journals_date_idx`(`date`),
    INDEX `journals_type_idx`(`type`),
    INDEX `journals_source_type_source_id_idx`(`source_type`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: journal_lines
CREATE TABLE `journal_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `journal_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `base_debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `base_credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `memo` VARCHAR(255) NULL,

    INDEX `journal_lines_journal_id_idx`(`journal_id`),
    INDEX `journal_lines_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journals` ADD CONSTRAINT `journals_reversal_of_id_fkey` FOREIGN KEY (`reversal_of_id`) REFERENCES `journals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
