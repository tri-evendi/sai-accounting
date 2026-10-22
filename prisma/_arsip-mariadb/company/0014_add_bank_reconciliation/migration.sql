-- Bank Reconciliation — Rekonsiliasi Bank (issue #24).
--
-- Cocokkan buku kas/bank internal (`cash_accounts`, type = 'bank') dengan
-- rekening koran bank agar saldo dapat dipercaya. Matching **tidak** memposting
-- jurnal — ia hanya menandai bahwa satu baris buku bersesuaian dengan satu baris
-- koran. Bila koran memuat mutasi yang belum ada di buku (mis. biaya admin bank),
-- itu DICATAT sebagai selisih, bukan diposting di sini (di luar scope engine).
--
-- ── MODEL BANK LEDGER YANG DIPAKAI ──────────────────────────────────────────
-- Tidak ada master "rekening bank" di skema ini. Buku kas adalah `cash_accounts`
-- di mana setiap BARIS adalah satu mutasi, dan `type` ('bank'/'kas_besar'/
-- 'kas_kecil') + `currency` menentukan buku mana. Jadi "rekening bank" = pasangan
-- (`cash_type`, `currency`), dan penanda rekonsiliasi menempel langsung pada baris
-- `cash_accounts` — itulah baris mutasi bank yang sebenarnya.
--
-- ── SATU MATA UANG PER REKENING ─────────────────────────────────────────────
-- `bank_statements` menyimpan `currency`; saldo awal/akhir dan seluruh barisnya
-- dalam mata uang itu. Buku vs koran hanya dibandingkan dalam SATU mata uang —
-- tidak ada penjumlahan lintas mata uang.
--
-- ── ARAH NILAI ──────────────────────────────────────────────────────────────
-- `bank_statement_lines.amount` bertanda: positif = uang masuk ke rekening
-- (menambah saldo), negatif = keluar. Ini sepadan dengan (debit − credit) pada
-- `cash_accounts`, sehingga cocok/tidaknya sepasang baris = nilai bertandanya sama.
--
-- Uang DECIMAL(15,2) per docs/DATABASE.md §4; gaya DDL mengikuti 0001/0010.

-- AlterTable: penanda rekonsiliasi pada baris mutasi bank (buku).
ALTER TABLE `cash_accounts`
    ADD COLUMN `reconciled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reconciled_at` DATETIME(3) NULL,
    ADD COLUMN `statement_id` INTEGER NULL;

CREATE INDEX `cash_accounts_statement_id_idx` ON `cash_accounts`(`statement_id`);
CREATE INDEX `cash_accounts_reconciled_idx` ON `cash_accounts`(`reconciled`);

-- CreateTable: satu rekening koran untuk satu rekening bank atas satu periode.
CREATE TABLE `bank_statements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- Buku kas yang direkonsiliasi. Praktisnya selalu 'bank'.
    `cash_type` VARCHAR(20) NOT NULL DEFAULT 'bank',
    -- Satu rekening = satu mata uang; saldo di bawah dalam mata uang ini.
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `opening_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `closing_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    -- enum-like: draft | locked. Validated by z.enum, per docs/DATABASE.md §2.
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `locked_at` DATETIME(3) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- One statement per (account, exact period). Re-importing the same period is
    -- an edit of the first, not a second statement.
    UNIQUE INDEX `bank_statements_cash_type_currency_period_start_period_end_key`(`cash_type`, `currency`, `period_start`, `period_end`),
    INDEX `bank_statements_status_idx`(`status`),
    INDEX `bank_statements_period_start_idx`(`period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: baris mutasi rekening koran (manual / CSV).
CREATE TABLE `bank_statement_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `statement_id` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    -- Signed: positif = masuk (menambah saldo), negatif = keluar.
    `amount` DECIMAL(15, 2) NOT NULL,
    `matched` BOOLEAN NOT NULL DEFAULT false,
    -- The 1:1 book movement this line is matched to. NULL = belum cocok.
    `cash_account_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- 1:1 matching — one book movement may back at most one koran line. MySQL
    -- treats NULLs as distinct, so many unmatched lines coexist.
    UNIQUE INDEX `bank_statement_lines_cash_account_id_key`(`cash_account_id`),
    INDEX `bank_statement_lines_statement_id_idx`(`statement_id`),
    INDEX `bank_statement_lines_date_idx`(`date`),
    INDEX `bank_statement_lines_matched_idx`(`matched`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- SET NULL: menghapus/menutup statement tidak menghapus baris buku; ia hanya
-- melepas penandanya. Baris buku (uang riil) tetap ada.
ALTER TABLE `cash_accounts`
    ADD CONSTRAINT `cash_accounts_statement_id_fkey`
    FOREIGN KEY (`statement_id`) REFERENCES `bank_statements`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Baris koran milik statement-nya → CASCADE (header + lines, docs/DATABASE.md §5).
ALTER TABLE `bank_statement_lines`
    ADD CONSTRAINT `bank_statement_lines_statement_id_fkey`
    FOREIGN KEY (`statement_id`) REFERENCES `bank_statements`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Link cocok ke baris buku → SET NULL: menghapus baris buku hanya melepas
-- kecocokan, tidak menghapus riwayat koran.
ALTER TABLE `bank_statement_lines`
    ADD CONSTRAINT `bank_statement_lines_cash_account_id_fkey`
    FOREIGN KEY (`cash_account_id`) REFERENCES `cash_accounts`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
