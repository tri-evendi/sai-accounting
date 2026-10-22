-- PPN (Indonesian VAT) as a first-class field on invoices + a per-customer
-- exempt flag (issue #16).
--
-- Before this, an invoice's PPN Keluaran was a raw amount typed into
-- `tax_amount` (added by migration 0005). This makes PPN first-class: a `taxable`
-- flag and a `tax_rate` drive the amount, and the tax base (`dpp`) is stored, so
-- the whole DPP / PPN / Total breakdown is captured rather than only the amount.
--
-- BACKFILL: none, and deliberately.
--   * `taxable` DEFAULTs FALSE. Every pre-#16 invoice already carried
--     `tax_amount` = 0 for the untaxed case, and the posting engine keys the VAT
--     line off `tax_amount > 0`, not off this flag — so no existing journal
--     changes. A historical invoice that really was taxed still has its
--     `tax_amount`; it simply reads back as `taxable = false` with a NULL rate,
--     which is honest: we do not know the rate that produced that amount.
--   * `tax_rate` and `dpp` are NULLable with no DEFAULT, following the posture
--     migrations 0005/0008 set for `rate` / `base_amount`: a legacy row's rate is
--     UNKNOWN, not zero, so it is left NULL and never invented. `dpp` for a legacy
--     row is recomputed from its item lines where a UI needs it.
--
-- `customers.tax_exempt` DEFAULTs FALSE — existing customers keep the standard
-- domestic 11% default; only a buyer explicitly marked exempt (export / non-PKP)
-- flips the invoice form's default to non-taxable, and even then it is overridable.
--
-- The Chart of Accounts already carries 2103 Hutang PPN Keluaran and 1105 PPN
-- Masukan, and account_mappings already binds `vat_out` → 2103 / `vat_in` → 1105
-- (seeded since the auto-posting groundwork). This migration adds NO account rows.

-- AlterTable: PPN fields on invoices
ALTER TABLE `invoices`
    ADD COLUMN `taxable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `tax_rate` DECIMAL(15, 2) NULL,
    ADD COLUMN `dpp` DECIMAL(15, 2) NULL;

-- AlterTable: per-customer exempt flag
ALTER TABLE `customers`
    ADD COLUMN `tax_exempt` BOOLEAN NOT NULL DEFAULT false;
