-- Structured due dates for AR/AP aging (issue #12).
--
-- WHY A NEW COLUMN INSTEAD OF PARSING `contracts.top1`/`top2`:
-- issue #12 says the due date comes "dari term of payment top1/top2", but those
-- are free-text VARCHAR(200) holding things like "30% advance, 70% on B/L".
-- They encode commercial terms, not a computable date, and `invoices` has no
-- payment-term field at all. Deriving a due date from that text would mean
-- guessing — and a guessed due date shown as fact in an AR report is worse than
-- no due date, because it drives the "Jatuh Tempo" alarm and dunning decisions.
-- So the term text stays exactly as it is (still displayed verbatim, as
-- information), and the date the aging report actually keys on becomes explicit,
-- user-entered data.
--
-- NULLable on purpose, with no DEFAULT and no backfill: every existing invoice,
-- contract and supplier purchase legitimately has an *unknown* due date. Filling
-- one in (date + 30, say) would invent a fact about historical documents and
-- could mark a long-settled row as overdue. Rows with a NULL due date are aged
-- from their document date and are reported as "umur sejak terbit" — they are
-- never flagged overdue. This mirrors the NULLable-`rate` precedent set by
-- migrations 0004 and 0005.
--
-- Indexed because the receivables/payables screens filter on it (the "sudah
-- jatuh tempo" filter) — docs/DATABASE.md §5 requires an index on date columns
-- that are filtered.

-- AlterTable: due date on the three payable/receivable document tables
ALTER TABLE `invoices` ADD COLUMN `due_date` DATETIME(3) NULL;
ALTER TABLE `contracts` ADD COLUMN `due_date` DATETIME(3) NULL;
ALTER TABLE `supplier_transactions` ADD COLUMN `due_date` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `invoices_due_date_idx` ON `invoices`(`due_date`);
CREATE INDEX `contracts_due_date_idx` ON `contracts`(`due_date`);
CREATE INDEX `supplier_transactions_due_date_idx` ON `supplier_transactions`(`due_date`);

-- Aging and outstanding both scan by document date and by counterparty, neither
-- of which was indexed before. `supplier_transactions.type` splits purchases
-- from payments on every payables query.
CREATE INDEX `invoices_date_idx` ON `invoices`(`date`);
CREATE INDEX `contracts_date_idx` ON `contracts`(`date`);
CREATE INDEX `supplier_transactions_supplier_id_type_idx` ON `supplier_transactions`(`supplier_id`, `type`);
