-- Ganti nama tabel `cash_accounts` → `cash_movements` (issue #104).
--
-- KENAPA: nama `cash_accounts` menjanjikan DAFTAR AKUN KAS — satu baris per
-- kas/bank, dengan saldonya. Isinya bukan itu. Satu baris = SATU TRANSAKSI kas:
-- ia punya `date`, `description`, `debit`, `credit`, `note`, penanda
-- rekonsiliasi, dan pusat biaya. Saldo sebuah kas adalah HASIL PENJUMLAHAN
-- baris-baris ini dan tidak tersimpan di mana pun; "akun kas" itu sendiri tidak
-- punya tabel sama sekali — ia hanya pasangan (`type`, `currency`) yang muncul
-- di baris-baris ini (lihat komentar `BankStatement` di skema).
--
-- Persis kekeliruan yang sama dengan `stock` → `stock_movements` (issue #92,
-- migration 0035): nama yang menyiratkan SALDO padahal isinya PERGERAKAN.
-- Kodenya pun sudah lama menyebut mereka `movements` — relasi
-- `BankStatement.movements`, komentar "book movement", variabel `movement` —
-- hanya nama tabelnya yang tertinggal.
--
-- Kenapa sekarang: skema ini akan digandakan menjadi satu basis data per
-- perusahaan. Setelah itu, satu ganti nama harus diputar ulang di N basis data
-- milik N perusahaan yang berbeda-beda jam sibuknya. Hari ini ia satu perintah.
--
-- ══ KOLOM `bank_statement_lines.cash_account_id` IKUT ══════════════════════
-- Kolom itu menunjuk SATU BARIS GERAKAN yang dicocokkan dengan satu baris
-- rekening koran — bukan sebuah akun. Namanya ikut diperbaiki jadi
-- `cash_movement_id`, sebab meninggalkannya berarti mempertahankan tepat
-- kesalahpahaman yang sedang dibereskan migration ini, di kolom yang paling
-- sering dibaca saat rekonsiliasi.
--
-- ══ MURNI GANTI NAMA — TIDAK ADA PERUBAHAN PERILAKU ════════════════════════
-- Tidak ada kolom yang ditambah/dihapus/diubah tipenya, tidak ada satu baris
-- pun di-UPDATE. Saldo kas, Arus Kas, Neraca, dan status rekonsiliasi
-- menghasilkan angka yang sama persis sebelum dan sesudah.
--
-- ══ INDEX, FK, DAN NAMA CONSTRAINT ═════════════════════════════════════════
-- `RENAME TABLE` memindahkan tabel beserta seluruh index, PK, dan FK-nya; FK
-- dari tabel lain yang menunjuk ke tabel ini ikut diperbarui otomatis oleh
-- MariaDB. Nama INDEX ikut diganti di bawah supaya awalannya tetap sama dengan
-- nama tabelnya (konvensi Prisma) — operasi metadata, tidak menyentuh data.
--
-- Nama CONSTRAINT FK sengaja DIBIARKAN (`cash_accounts_statement_id_fkey`,
-- `cash_accounts_cost_center_id_fkey`, `bank_statement_lines_cash_account_id_fkey`),
-- alasan yang sama seperti 0035: MariaDB tidak mengganti nama constraint saat
-- RENAME TABLE, Prisma mencocokkan FK berdasarkan KOLOM bukan nama, dan
-- DROP + ADD pada DDL MySQL yang non-transaksional sempat meninggalkan tabel
-- tanpa FK di antara kedua perintah. Nama yang tertinggal jauh lebih murah
-- daripada jendela tanpa integritas referensial.

-- RenameTable
RENAME TABLE `cash_accounts` TO `cash_movements`;

-- RenameIndex: awalan nama index mengikuti nama tabel yang baru.
ALTER TABLE `cash_movements` RENAME INDEX `cash_accounts_statement_id_idx` TO `cash_movements_statement_id_idx`;
ALTER TABLE `cash_movements` RENAME INDEX `cash_accounts_reconciled_idx` TO `cash_movements_reconciled_idx`;
ALTER TABLE `cash_movements` RENAME INDEX `cash_accounts_cost_center_id_idx` TO `cash_movements_cost_center_id_idx`;
ALTER TABLE `cash_movements` RENAME INDEX `cash_accounts_date_idx` TO `cash_movements_date_idx`;

-- RenameColumn: baris koran menunjuk satu GERAKAN, bukan satu akun.
ALTER TABLE `bank_statement_lines`
  CHANGE COLUMN `cash_account_id` `cash_movement_id` INTEGER NULL;
ALTER TABLE `bank_statement_lines`
  RENAME INDEX `bank_statement_lines_cash_account_id_key` TO `bank_statement_lines_cash_movement_id_key`;

-- ══ NILAI `journals.source_type` IKUT DIGANTI ══════════════════════════════
-- Jurnal yang lahir dari sebuah transaksi kas menyimpan asal-usulnya sebagai
-- (`source_type`, `source_id`) = ('cash_account', id). Nilai itu BUKAN sekadar
-- label: mesin posting memakainya untuk menemukan kembali barisnya saat sebuah
-- transaksi kas diubah atau dihapus (`unpostForSource`). Kalau kodenya menulis
-- 'cash_movement' sementara baris lama masih berbunyi 'cash_account', jurnal
-- lama itu menjadi YATIM — tidak akan pernah ditemukan untuk dibalik, dan
-- menghapus transaksi kasnya akan meninggalkan jurnalnya hidup di buku besar.
-- Karena itu nilainya ikut dipindahkan, dalam migration yang sama.
--
-- `stock_movement` sudah memakai nama gerakan sejak awal (issue #9), jadi hanya
-- kas yang perlu diperbaiki di sini.
UPDATE `journals` SET `source_type` = 'cash_movement' WHERE `source_type` = 'cash_account';

-- Persetujuan tidak pernah menggerbangi transaksi kas (lihat
-- `documentTypeForSource`), jadi baris di bawah normalnya tidak menyentuh apa
-- pun. Ia ada supaya tidak ada satu pun nilai 'cash_account' yang tertinggal
-- seandainya aturan itu pernah berubah.
UPDATE `approval_requests` SET `source_type` = 'cash_movement' WHERE `source_type` = 'cash_account';
