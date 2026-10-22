-- Company setup wizard + Saldo Awal (issue #20).
--
-- Satu baris identitas + pengaturan perusahaan (singleton, id = 1), plus flag
-- `is_setup` agar wizard berjalan SEKALI. Nama/alamat perusahaan yang tadinya
-- di-hardcode di `src/lib/constants.ts` kini ditangkap di sini.
--
-- ── SALDO AWAL BUKAN KOLOM ──────────────────────────────────────────────────
-- Saldo awal tidak disimpan sebagai kolom di tabel ini. Input wizard menjadi
-- SATU jurnal pembuka yang seimbang (`journals.source_type = 'opening_balance'`)
-- — itulah kebenaran akuntansinya. `opening_journal_id` hanya penunjuk lunak ke
-- jurnal tersebut (Int biasa, bukan FK, agar tak perlu back-relation di model
-- Journal bersama); tautan otoritatif ada di source_type/source_id jurnal.
--
-- Bukan master data (record pengaturan), jadi TANPA `is_active`.
-- Gaya DDL mengikuti 0001/0016 (utf8mb4, DATETIME(3)).

CREATE TABLE `company_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- Nama perusahaan (identitas). Bekas constants.COMPANY_NAME.
    `name` VARCHAR(150) NOT NULL,
    -- Alamat perusahaan. Bekas constants.COMPANY_ADDRESS.
    `address` TEXT NULL,
    -- Mata uang pelaporan/base (ISO). "IDR" dalam praktik — base buku besar.
    `base_currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    -- Awal tahun buku. Jurnal pembuka ditanggali di sini agar mendahului semua
    -- transaksi operasional dan berada di periode pertama yang masih terbuka.
    `fiscal_year_start` DATETIME(3) NOT NULL,
    -- Flag run-once: true setelah wizard selesai & jurnal pembuka diposting.
    `is_setup` BOOLEAN NOT NULL DEFAULT false,
    -- Penunjuk lunak ke jurnal pembuka (lihat catatan di atas). NULL sebelum wizard jalan.
    `opening_journal_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `company_settings_is_setup_idx`(`is_setup`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Mapping akun: Modal/Ekuitas Saldo Awal (opening_equity) ──────────────────
-- Angka penyeimbang jurnal pembuka (aset − kewajiban) mendarat di 3101 Modal.
-- Idempoten: hanya sisipkan bila (key,currency) belum ada dan akun 3101 ada.
INSERT INTO `account_mappings` (`key`, `account_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT 'opening_equity', `a`.`id`, 'any', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `accounts` `a`
WHERE `a`.`code` = '3101'
  AND NOT EXISTS (
    SELECT 1 FROM `account_mappings` `m`
    WHERE `m`.`key` = 'opening_equity' AND `m`.`currency` = 'any'
  );
