-- Selisih Persediaan (issue #57) — akun + mapping untuk penyesuaian stok opname.
--
-- Instalasi baru mendapat akun ini dari COA_TEMPLATE + DEFAULT_MAPPINGS saat
-- setup. Migrasi ini menambahkannya ke DB yang SUDAH berjalan agar posting
-- opname tidak gagal-loud karena mapping belum ada. Idempoten (INSERT IGNORE
-- pada unique `code` / unique `[key, currency]`) — aman dijalankan berulang,
-- dan tidak menimpa bila perusahaan sudah memetakannya sendiri.

-- Akun 610105 Selisih Persediaan (expense, debit-normal), anak dari 6101.
-- Bila 6101 tidak ada (bagan akun kustom), SELECT kosong → tak ada yang
-- ditambahkan; perusahaan itu memetakan sendiri lewat pengaturan.
INSERT IGNORE INTO `accounts`
  (`code`, `name`, `type`, `normal_balance`, `parent_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT '610105', 'Selisih Persediaan', 'expense', 'debit', `p`.`id`, 'IDR', 1, NOW(3), NOW(3)
FROM `accounts` `p`
WHERE `p`.`code` = '6101';

-- Mapping inventory_adjustment → 610105 (currency "any"). Menunjuk akun lewat
-- code, jadi tetap benar entah baris di atas baru dibuat atau sudah ada.
INSERT IGNORE INTO `account_mappings`
  (`key`, `account_id`, `currency`, `is_active`, `created_at`, `updated_at`)
SELECT 'inventory_adjustment', `a`.`id`, 'any', 1, NOW(3), NOW(3)
FROM `accounts` `a`
WHERE `a`.`code` = '610105';
