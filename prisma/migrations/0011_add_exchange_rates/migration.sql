-- Settlement-date exchange rates (issue #43) and per-currency cash mappings
-- (issue #40). Both are the same defect seen twice: the posting engine picking
-- an account by the wrong currency.
--
-- ── PART 1: `exchange_rates` ────────────────────────────────────────────────
-- Issue #23 deliberately rejected this table, on the grounds that a second rate
-- source can contradict the rate a document already asserts. That objection is
-- honoured by scope rather than waived: NOTHING values a document from this
-- table. Documents and payments are still valued at the rate stored on
-- themselves (`resolveRate`), and no code path lets a row here change an
-- invoice's, contract's, purchase's, advance's or payment's IDR value.
--
-- It answers only the question #23 could not, and which caused #43: a customer
-- wires IDR against a USD invoice — how many USD did that transfer settle? The
-- payment knows its own rate (1, it is IDR). The invoice knows the rate it was
-- booked at months ago. Neither knows what a dollar was worth on the day the
-- money landed, so before this table the engine relieved the receivable in the
-- PAYMENT's currency and credited 110201 (Piutang IDR) for a debt that lives in
-- 110202 (Piutang USD).
--
-- UNIQUE (currency, rate_date) is the anti-contradiction guard: one rate per
-- currency per day, so the table can never hold two answers at once. Lookups
-- match that exact day and nothing else — no nearest, previous or interpolated
-- fallback, all of which are the silent guess `resolveRate` exists to refuse.
-- A missing row refuses the posting with a message naming the currency and date.
--
-- No backfill. Inventing historical rates is precisely the guess this design
-- rejects, and there is no cross-currency settlement in the books that was
-- posted from a rate — they were posted from the payment's own currency, which
-- is the bug. Legacy journals are corrected per document via `repostForSource`
-- once the rate for that settlement date has been entered; see
-- src/lib/posting/rates.ts. There is deliberately no bulk repost.

-- CreateTable: exchange_rates
CREATE TABLE `exchange_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `currency` VARCHAR(5) NOT NULL,
    `rate_date` DATE NOT NULL,
    `rate` DECIMAL(18, 6) NOT NULL,
    `source` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exchange_rates_currency_rate_date_key`(`currency`, `rate_date`),
    INDEX `exchange_rates_rate_date_idx`(`rate_date`),
    INDEX `exchange_rates_currency_idx`(`currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── PART 2: per-currency `cash_default` mappings (issue #40) ────────────────
-- `account_mappings` has been currency-aware since 0004, but `cash_default` was
-- only ever seeded with an `any` row pointing at 110102 Kas Besar — an IDR
-- account. So a CNY payment landed in Kas Besar: balanced in IDR base, but the
-- CNY cash account stayed empty while an IDR one absorbed foreign movements.
--
-- WHY THIS IS IN A MIGRATION AND NOT LEFT TO scripts/seed-coa.ts:
-- `seedDefaultMappings` is idempotent by never touching rows that already
-- exist, which is right for a seed but means it can only ADD the per-currency
-- rows — it can never remove the `any` row that causes the bug. On an installed
-- database the fallback would keep swallowing every currency that has no
-- explicit row, which is exactly the behaviour this issue is about.
--
-- WHY `cash_default` LOSES ITS `any` ROW ENTIRELY:
-- an `any` mapping promises "this account can receive money in any currency".
-- For sales, VAT, COGS or fx_gain_loss that is true — they are currency-
-- agnostic slots. For cash it is a category error: a cash or bank account holds
-- exactly one currency, so there is no honest account for "some currency we
-- have not configured". Refusing to post (MissingMappingError, which already
-- names the key and the currency in Indonesian) is the same stance `resolveRate`
-- takes on a missing rate, and it is strictly better than silently booking
-- foreign money into an IDR account, because the fix is a one-row insert while
-- the silent version has to be found first.

-- Add IDR/USD/CNY cash_default rows wherever the target account exists.
-- INSERT IGNORE + the UNIQUE (key, currency) index makes this idempotent and
-- leaves any row a company has already customised untouched.
INSERT IGNORE INTO `account_mappings` (`key`, `account_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT 'cash_default', `a`.`id`, `c`.`cur`, true, NOW(3), NOW(3)
FROM `accounts` `a`
JOIN (
    SELECT '110103' AS `code`, 'IDR' AS `cur`
    UNION ALL SELECT '110104', 'USD'
    UNION ALL SELECT '110105', 'CNY'
) `c` ON `c`.`code` = `a`.`code`;

-- Retire the currency-agnostic fallback — but ONLY once an IDR row exists to
-- take over, so a chart that does not have 110103 is left exactly as it was
-- rather than stranded with no resolvable cash account at all. The nested
-- SELECT is the standard MySQL workaround for referencing the delete target.
DELETE `m` FROM `account_mappings` `m`
WHERE `m`.`key` = 'cash_default'
  AND `m`.`currency` = 'any'
  AND EXISTS (
      SELECT 1 FROM (SELECT `key`, `currency` FROM `account_mappings`) `x`
      WHERE `x`.`key` = 'cash_default' AND `x`.`currency` = 'IDR'
  );
