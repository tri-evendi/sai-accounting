-- Auto-posting engine (issue #9):
--   1. `account_mappings` — posting rules resolve accounts through this table
--      instead of hardcoding COA codes.
--   2. FX retrofit on legacy transaction tables (`rate` + `base_amount`), as
--      scheduled by docs/DATABASE.md §10 for this issue.
--   3. `stock.unit_cost` — the cost input for weighted-average COGS.
--
-- The retrofit columns are NULLable on purpose: a DEFAULT 1 would silently
-- value historical foreign-currency rows at rate 1. NULL forces the posting
-- engine to demand an explicit rate instead of guessing.

-- CreateTable: account_mappings
CREATE TABLE `account_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `account_id` INTEGER NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'any',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `account_mappings_key_currency_key`(`key`, `currency`),
    INDEX `account_mappings_account_id_idx`(`account_id`),
    INDEX `account_mappings_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `account_mappings` ADD CONSTRAINT `account_mappings_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: FX retrofit (docs/DATABASE.md §10)
ALTER TABLE `invoice_payments`
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL;

ALTER TABLE `contract_payments`
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL;

ALTER TABLE `supplier_transactions`
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE `cash_accounts`
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL;

-- AlterTable: weighted-average COGS input
ALTER TABLE `stock`
    ADD COLUMN `unit_cost` DECIMAL(15, 2) NULL;
