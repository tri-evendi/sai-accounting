-- Link supplier payments to the purchases they settle (issue #37).
--
-- WHY A TABLE, NOT A NULLABLE `applied_to_id` COLUMN:
-- issue #37 offers (a) a self-referencing FK on `supplier_transactions` — one
-- payment settles one purchase — or (b) a dedicated allocation table. (b) is
-- what is built here. A self-FK can express "this transfer paid that invoice"
-- and nothing else, but the two cases that actually break FIFO aging are the two
-- it cannot hold: one transfer clearing three invoices, and one invoice cleared
-- by three instalments. Forcing those through a self-FK means splitting the
-- payment into several rows — and every `supplier_transactions` row auto-posts a
-- journal (D: Hutang Usaha / K: Kas & Bank), so a display concern would start
-- fabricating cash movements that never left the bank. An allocation table keeps
-- the ledger exactly as it is: one purchase, one payment, one journal each, with
-- the split recorded beside them as reporting data. Allocation posts nothing.
--
-- NULLABILITY / NO BACKFILL:
-- there is deliberately no backfill. Every pre-existing payment genuinely has no
-- recorded allocation — which purchase it settled is not on record anywhere, and
-- writing a FIFO guess into the table would turn an openly-labelled assumption
-- into a stored fact that later readers cannot tell apart from user intent. This
-- follows the precedent of 0004/0005 (rate), 0007 (due_date) and 0008 (contract
-- rate): the unknown stays NULL/absent and is disclosed in the UI. `getPayables`
-- therefore runs both mechanisms side by side — real allocations where they
-- exist, FIFO for the unallocated remainder, with the estimated rows flagged.
--
-- MONEY COLUMNS:
-- `amount` is a slice of the payment and is denominated in the PAYMENT's own
-- currency; `base_amount` is its IDR value at the payment's `rate`, which is the
-- rate the ledger already posted at. Reporting sums `base_amount` only, so no
-- two currencies are ever added. `rate`/`base_amount` are NULLable because a
-- legacy foreign payment may have no rate at all — such an allocation has no
-- honest IDR value and is excluded from the totals rather than counted 1:1
-- (the bug class #35/#36 fixed elsewhere). Money is DECIMAL(15,2) and the rate
-- DECIMAL(18,6), per docs/DATABASE.md §4.

-- CreateTable: supplier payment → purchase allocations
CREATE TABLE `supplier_payment_allocations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_id` INTEGER NOT NULL,
    `purchase_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    `base_amount` DECIMAL(15, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- One row per (payment, purchase) pair: applying the same payment to the
    -- same purchase twice is an edit of the first allocation, not a new fact.
    UNIQUE INDEX `supplier_payment_allocations_payment_id_purchase_id_key`(`payment_id`, `purchase_id`),
    -- Payables aging walks allocations from the purchase side, one supplier at
    -- a time; docs/DATABASE.md §5 requires an index on every FK used that way.
    INDEX `supplier_payment_allocations_purchase_id_idx`(`purchase_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- CASCADE on both sides: an allocation is a line belonging to two parent rows and
-- is meaningless without either. Deleting a supplier transaction already reverses
-- its journal (see the transactions DELETE route); its allocations must go with
-- it rather than dangle at a row id that no longer exists.
ALTER TABLE `supplier_payment_allocations`
    ADD CONSTRAINT `supplier_payment_allocations_payment_id_fkey`
    FOREIGN KEY (`payment_id`) REFERENCES `supplier_transactions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `supplier_payment_allocations`
    ADD CONSTRAINT `supplier_payment_allocations_purchase_id_fkey`
    FOREIGN KEY (`purchase_id`) REFERENCES `supplier_transactions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
