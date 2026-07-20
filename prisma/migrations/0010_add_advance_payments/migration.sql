-- Uang Muka / advance payments and their compensation (issue #26).
--
-- SAI's primary export flow: Chinese customers pay before the final invoice
-- exists. The live Accurate books show 210106 "Uang Muka Penjualan CNY" being
-- compensated into Piutang when the invoice is finally issued. Until now the
-- app had no way to record that first leg at all.
--
-- ── WHY TWO NEW TABLES, NOT A FLAG ON THE EXISTING PAYMENT MODELS ───────────
-- `invoice_payments.invoice_id` and `contract_payments.contract_id` are both NOT
-- NULL, and an advance's defining property is that no such document exists yet.
-- Making either FK nullable would turn the column into a lie for every other row
-- and force every existing reader to grow a null branch — including the posting
-- engine, which dereferences `payment.invoice.invoice_no` to build a memo.
--
-- `supplier_transactions.type` is the precedent for discriminating direction
-- inside one table, and that is precisely how `advance_payments.type` is used:
-- `sales` and `purchase` advances are one fact pointing opposite ways. What that
-- precedent cannot cover is the sales side — there is no customer-facing
-- equivalent of `supplier_transactions` to hang a new type on. One table serving
-- both directions is the smaller, more symmetric change.
--
-- ── WHY A SEPARATE APPLICATION TABLE ────────────────────────────────────────
-- Same argument 0009 makes for `supplier_payment_allocations`: one advance
-- covers several invoices and one invoice is covered by several advances, so a
-- single `compensated_invoice_id` column cannot hold the real shape, and faking
-- it by splitting the advance row would invent cash receipts that never landed.
--
-- BUT NOTE THE DIFFERENCE FROM 0009. A supplier allocation is pure reporting
-- data and posts nothing, because the payment and the purchase are each already
-- journalled. A compensation is NOT: moving value out of Uang Muka and against
-- Piutang/Hutang appears in neither the advance's journal nor the invoice's.
-- Every `advance_applications` row is therefore a posting source in its own
-- right and carries its own journal.
--
-- ── FX COLUMNS: NULLABLE, NO DEFAULT 1, NO BACKFILL ─────────────────────────
-- Following 0004/0005/0007/0008 exactly. A foreign advance with no rate has no
-- honest IDR value; `DEFAULT 1` would book a CNY advance as if 1 CNY = 1 IDR,
-- the precise bug #35/#36 fixed. Such rows are excluded from IDR sums and
-- surfaced, never folded in at face value. There are no pre-existing advances to
-- backfill — this is a new concept, not a retrofit — so every row starts honest.
--
-- Money is DECIMAL(15,2) and rates DECIMAL(18,6) per docs/DATABASE.md §4;
-- `amount` on an application is a slice of its advance and so is denominated in
-- the ADVANCE's currency, with `base_amount` its IDR value at the advance's own
-- rate — the rate the ledger relieves Uang Muka at.

-- CreateTable: the advance itself (money in/out before the document exists)
CREATE TABLE `advance_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `advance_no` VARCHAR(50) NOT NULL,
    -- enum-like: sales | purchase. Validated by z.enum, per docs/DATABASE.md §2.
    `type` VARCHAR(20) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    -- Exactly one of customer_id / supplier_id is set, decided by `type`. Both
    -- NULLable: a sales advance has no supplier and vice versa. The XOR is
    -- enforced in Zod rather than a CHECK, matching how every other enum-like
    -- invariant in this schema is enforced.
    `customer_id` INTEGER NULL,
    `supplier_id` INTEGER NULL,
    -- Optional link to the contract the advance was received against. Advisory:
    -- compensation always targets an invoice or a purchase, never the contract.
    `contract_id` INTEGER NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    `base_amount` DECIMAL(15, 2) NULL,
    -- enum-like: open | canceled. "Fully compensated" is DERIVED from the
    -- applications, never stored — a stored copy would drift the moment one is
    -- added or reversed (the argument receivables.ts makes for payment_status).
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `advance_payments_advance_no_key`(`advance_no`),
    INDEX `advance_payments_customer_id_idx`(`customer_id`),
    INDEX `advance_payments_supplier_id_idx`(`supplier_id`),
    INDEX `advance_payments_contract_id_idx`(`contract_id`),
    INDEX `advance_payments_date_idx`(`date`),
    -- The list every screen asks for: open advances of one direction.
    INDEX `advance_payments_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: compensation of an advance into an invoice / supplier purchase
CREATE TABLE `advance_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `advance_id` INTEGER NOT NULL,
    -- Exactly one target is set, decided by the advance's `type`.
    `invoice_id` INTEGER NULL,
    `purchase_id` INTEGER NULL,
    `date` DATETIME(3) NOT NULL,
    -- A slice of the advance, so in the ADVANCE's currency.
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    `base_amount` DECIMAL(15, 2) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- One row per (advance, target). Compensating the same advance into the same
    -- invoice twice is an edit of the first, not a second event. MySQL treats
    -- NULLs as distinct in a UNIQUE index, so the unused half of each pair (all
    -- those NULL purchase_ids on sales rows) never collides.
    UNIQUE INDEX `advance_applications_advance_id_invoice_id_key`(`advance_id`, `invoice_id`),
    UNIQUE INDEX `advance_applications_advance_id_purchase_id_key`(`advance_id`, `purchase_id`),
    INDEX `advance_applications_invoice_id_idx`(`invoice_id`),
    INDEX `advance_applications_purchase_id_idx`(`purchase_id`),
    INDEX `advance_applications_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- RESTRICT to the master parties, per docs/DATABASE.md §5 — a customer or
-- supplier holding an advance is in use and must not be deleted out from under
-- a live liability.
ALTER TABLE `advance_payments`
    ADD CONSTRAINT `advance_payments_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `advance_payments`
    ADD CONSTRAINT `advance_payments_supplier_id_fkey`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL, matching `documents.contract_id`: the contract link is advisory, and
-- the money the advance records still exists once the contract is gone.
ALTER TABLE `advance_payments`
    ADD CONSTRAINT `advance_payments_contract_id_fkey`
    FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT ON DELETE, NOT CASCADE — the one place this table deliberately
-- departs from 0009. A `supplier_payment_allocations` row carries no journal, so
-- cascading it away loses nothing. An `advance_applications` row IS journalled:
-- cascading would delete the row while leaving its journal standing, silently
-- unbalancing Uang Muka against Piutang with no record of why. RESTRICT forces
-- the delete paths to reverse the compensation's journal first (as the supplier
-- transaction DELETE route already does via `unpostForSource`) — an accounting
-- correction, which is what deleting a posted transaction has to be.
ALTER TABLE `advance_applications`
    ADD CONSTRAINT `advance_applications_advance_id_fkey`
    FOREIGN KEY (`advance_id`) REFERENCES `advance_payments`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `advance_applications`
    ADD CONSTRAINT `advance_applications_invoice_id_fkey`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `advance_applications`
    ADD CONSTRAINT `advance_applications_purchase_id_fkey`
    FOREIGN KEY (`purchase_id`) REFERENCES `supplier_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
