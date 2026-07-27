-- Dimensi pusat biaya (cost centre) — fase 1 (issue #91).
--
-- KENAPA: sampai kini buku besar tak punya satu pun dimensi (tak ada Project,
-- CostCenter, Department, Branch, maupun Outlet), sehingga laba/rugi tak bisa
-- dipilah per cabang / unit / proyek. Migration ini menambahkan dimensinya:
-- master `cost_centers` + kolom `cost_center_id` pada baris jurnal dan pada
-- kepala dokumen sumber fase 1 (faktur, transaksi pemasok, transaksi kas, dan
-- jurnal itu sendiri untuk jurnal manual).
--
-- ══ DIMENSINYA DI BARIS, BUKAN DI KEPALA ═══════════════════════════════════
-- Yang dilaporkan adalah `journal_lines.cost_center_id`. Satu jurnal sah saja
-- mencakup lebih dari satu pusat biaya — tagihan listrik bersama yang dibagi ke
-- dua cabang adalah contoh yang pasti muncul — dan dimensi di kepala membuat
-- kasus itu mustahil dinyatakan. Kolom di kepala dokumen tetap ada, tetapi
-- perannya hanya NILAI BAWAAN yang distempel mesin posting ke setiap baris
-- (lihat `buildStampedEntry` di src/lib/posting/index.ts); jurnal manual boleh
-- menimpanya per baris.
--
-- ══ NULL ADALAH NILAI YANG BERMAKNA — TIDAK ADA BACKFILL ═══════════════════
-- Semua kolom baru NULLABLE, dan `NULL` berarti "belum ditetapkan / seluruh
-- perusahaan" — bukan data yang hilang. Karena itu tidak ada satu baris pun
-- yang di-UPDATE di sini: seluruh data historis tetap persis seperti adanya,
-- dan setiap laporan menghasilkan angka yang sama seperti sebelum migration ini
-- dijalankan. Penyaring pusat biaya menyaring TAMPILAN; ia tidak pernah
-- menggerbangi buku besar. Penjaganya `tests/cost-centre-reconciliation.test.ts`:
-- jumlah seluruh pusat biaya DITAMBAH yang belum ditetapkan harus sama persis
-- dengan total tanpa penyaring.
--
-- ══ HANYA MENAMBAH ═════════════════════════════════════════════════════════
-- Satu tabel baru + lima kolom nullable + index + FK. Tidak ada kolom yang
-- diubah tipenya, tidak ada kunci unik yang digeser, tidak ada baris yang
-- disentuh. (Anggaran per pusat biaya — yang MENGUBAH `budgets` @@unique —
-- sengaja ditinggalkan untuk fase 2.)
--
-- ══ FK SELALU RESTRICT ═════════════════════════════════════════════════════
-- Pusat biaya adalah master data: yang sudah disebut sebuah baris jurnal harus
-- tetap bisa diterjemahkan menjadi nama selamanya, kalau tidak laporan lama
-- berhenti bisa menyebut cabang asal angkanya. Menonaktifkan (`is_active =
-- false`) adalah cara menyingkirkannya dari pemilih; menghapus ditolak DB.
--
-- Gaya DDL mengikuti 0021/0019 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: cost_centers (master dimensi; `parent_id` ikut sejak awal —
-- pelaporan berjenjang baru fase 2, tetapi menambah self-relation belakangan
-- berarti migration yang MENGUBAH tabel yang sudah dirujuk buku besar)
CREATE TABLE `cost_centers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- Kode ringkas yang diketik pengguna, mis. "CAB-JKT". Unik.
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    -- Induk (hierarki). NULL = pusat biaya tingkat atas.
    `parent_id` INTEGER NULL,
    -- Nonaktif = tersembunyi dari pemilih, tetapi baris jurnal lama tetap utuh
    -- dan tetap terbaca namanya. Master data TIDAK di-hard-delete.
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cost_centers_code_key`(`code`),
    INDEX `cost_centers_parent_id_idx`(`parent_id`),
    INDEX `cost_centers_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: hierarki pusat biaya (RESTRICT — induk yang punya anak tak
-- boleh dihapus dari bawah anaknya; sama seperti `accounts_parent_id_fkey`)
ALTER TABLE `cost_centers` ADD CONSTRAINT `cost_centers_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: journal_lines — INILAH kolom dimensinya. Semua laporan per pusat
-- biaya menyaring kolom ini dan hanya kolom ini.
ALTER TABLE `journal_lines` ADD COLUMN `cost_center_id` INTEGER NULL;
CREATE INDEX `journal_lines_cost_center_id_idx` ON `journal_lines`(`cost_center_id`);
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: journals — pusat biaya BAWAAN kepala jurnal. Untuk jurnal manual
-- inilah pilihan di kepala form (baris boleh menimpanya); untuk jurnal otomatis
-- ini salinan dari dokumen sumbernya. Bukan kolom yang dilaporkan.
ALTER TABLE `journals` ADD COLUMN `cost_center_id` INTEGER NULL;
CREATE INDEX `journals_cost_center_id_idx` ON `journals`(`cost_center_id`);
ALTER TABLE `journals` ADD CONSTRAINT `journals_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: invoices — kepala dokumen penjualan.
ALTER TABLE `invoices` ADD COLUMN `cost_center_id` INTEGER NULL;
CREATE INDEX `invoices_cost_center_id_idx` ON `invoices`(`cost_center_id`);
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: supplier_transactions — kepala pembelian & pembayaran pemasok.
ALTER TABLE `supplier_transactions` ADD COLUMN `cost_center_id` INTEGER NULL;
CREATE INDEX `supplier_transactions_cost_center_id_idx` ON `supplier_transactions`(`cost_center_id`);
ALTER TABLE `supplier_transactions` ADD CONSTRAINT `supplier_transactions_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: cash_accounts — kepala transaksi kas/bank.
ALTER TABLE `cash_accounts` ADD COLUMN `cost_center_id` INTEGER NULL;
CREATE INDEX `cash_accounts_cost_center_id_idx` ON `cash_accounts`(`cost_center_id`);
ALTER TABLE `cash_accounts` ADD CONSTRAINT `cash_accounts_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
