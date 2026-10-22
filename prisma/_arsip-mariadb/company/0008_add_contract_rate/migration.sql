-- Contract exchange rate + IDR base value (issue #36).
--
-- `contracts` already carried `currency` (DEFAULT 'USD') but no rate and no IDR
-- value. Three things followed from that: posting a foreign contract demanded an
-- explicit `ctx.rate` on every call, the edit form had to re-enter the rate on
-- every edit because nothing remembered it, and /receivables (#12) had to exclude
-- foreign contracts from its IDR totals for want of a rate. This is the same gap
-- migration 0005 closed for `invoices`.
--
-- `rate` is NULLable with NO DEFAULT and NO backfill, following the precedent set
-- by 0004 (payments), 0005 (invoices) and 0007 (due dates). A DEFAULT 1 would
-- retro-value every historical USD contract at 1:1 IDR — precisely the bug being
-- fixed. Because `contracts.currency` defaults to 'USD', most legacy rows are
-- foreign AND rateless: they stay excluded from the IDR totals and keep showing
-- "Kurs belum diisi", which is the honest answer. Their real rate is not on
-- record anywhere, so inventing one would write a fabricated fact into the books.
--
-- No existing journal moves: before this migration a foreign contract could only
-- post with an explicitly supplied rate, and that path is unchanged.

-- AlterTable: FX rate + IDR base on contracts
ALTER TABLE `contracts`
    ADD COLUMN `rate` DECIMAL(18, 6) NULL,
    ADD COLUMN `base_amount` DECIMAL(15, 2) NULL;
