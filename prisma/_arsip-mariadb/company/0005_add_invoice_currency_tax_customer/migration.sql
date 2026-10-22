-- Invoice currency, rate, tax and customer (issue #35).
--
-- Before this, `invoices` carried no currency signal at all, so the auto-posting
-- engine (#9) booked every sales invoice as IDR 1:1 and untaxed. That silently
-- mis-valued foreign-currency invoices and kept Piutang Usaha in one bucket with
-- no counterparty, blocking per-customer aging (#12).
--
-- `rate` is NULLable on purpose: a DEFAULT 1 would retro-value historical rows at
-- 1:1, which is the bug being fixed. Migration 0004 set this precedent for
-- invoice_payments / contract_payments / supplier_transactions / cash_accounts.
--
-- `currency` DEFAULTs to 'IDR', which is exactly how existing rows are already
-- being posted today — so this migration changes no existing journal. Invoices
-- that were really USD/CNY must be corrected by hand; scripts/audit-invoice-currency.ts
-- lists the candidates (read-only).
--
-- `customer_id` is NULLable because legacy invoices have no customer, and
-- RESTRICT on delete because customers are master data (docs/DATABASE.md §5).

-- AlterTable: FX + tax + counterparty on invoices
ALTER TABLE `invoices`
    ADD COLUMN `customer_id` INTEGER NULL,
    ADD COLUMN `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `invoices_customer_id_idx` ON `invoices`(`customer_id`);

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
