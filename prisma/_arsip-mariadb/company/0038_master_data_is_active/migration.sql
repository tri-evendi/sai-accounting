-- `is_active` untuk master data yang belum punya: `items`, `suppliers`,
-- `customers` (utang teknis docs/DATABASE.md §10, issue #104).
--
-- KENAPA: aturan pertama basis data ini berbunyi "jangan hard-delete master
-- yang direferensikan — nonaktifkan". Tiga master terpenting justru tidak punya
-- kolom untuk menonaktifkan, jadi satu-satunya cara menyingkirkan pemasok yang
-- sudah tak dipakai adalah MENGHAPUSNYA. Dan menghapus pemasok yang punya
-- transaksi bukan sekadar dilarang aturan — FK `supplier_transactions` memakai
-- ON DELETE CASCADE, artinya menghapus satu pemasok akan ikut menghapus SELURUH
-- riwayat pembelian dan pembayarannya, beserta dasar dari jurnal yang sudah
-- diposting. Kolom ini memberi jalan keluar yang benar.
--
-- `consignees` (issue #22), `cost_centers` (#91), `accounts`, `roles`, dan
-- `fixed_asset_categories` sudah memakai pola ini sejak awal; migration ini
-- menyusulkan tiga tabel yang tertinggal, dengan nama & default yang sama persis.
--
-- ══ SEMUA BARIS LAMA AKTIF ═════════════════════════════════════════════════
-- DEFAULT TRUE dan tidak ada satu baris pun di-UPDATE: setiap pemasok,
-- pelanggan, dan barang yang ada hari ini tetap muncul di setiap pemilih persis
-- seperti sebelumnya. Kolom ini menambah kemampuan, bukan menyembunyikan data.
--
-- ══ INDEX ══════════════════════════════════════════════════════════════════
-- Setiap pemilih menyaring `is_active = TRUE`, jadi kolomnya di-index — sama
-- seperti `consignees_is_active_idx` yang sudah ada.

-- AlterTable: items
ALTER TABLE `items` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX `items_is_active_idx` ON `items`(`is_active`);

-- AlterTable: suppliers
ALTER TABLE `suppliers` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX `suppliers_is_active_idx` ON `suppliers`(`is_active`);

-- AlterTable: customers
ALTER TABLE `customers` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX `customers_is_active_idx` ON `customers`(`is_active`);
