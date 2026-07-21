-- Persiapan & ekspor e-Faktur (DJP/CTAS) — issue #17.
--
-- Konteks: #16 sudah menjadikan PPN 11% / 0% first-class di `invoices`
-- (taxable/tax_rate/dpp) dan memposting PPN Keluaran ke 2103. Migration INI TIDAK
-- menyentuh PPN maupun aturan posting apa pun — ia hanya menambah field DOKUMEN
-- yang dibutuhkan output e-Faktur:
--
--   1. Dokumen ekspor (PEB) pada faktur — untuk penjualan ekspor (0% PPN, valas)
--      nomor PEB menggantikan nomor Faktur Pajak.
--   2. NPWP pembeli pada `customers` — lawan-transaksi untuk faktur keluaran lokal.
--   3. Identitas pajak penjual pada `company_settings` — NPWP/nama/alamat penjual
--      yang wajib ada di setiap baris e-Faktur.
--
-- BACKFILL: tidak ada, dan disengaja. Semua kolom NULLable tanpa DEFAULT,
-- mengikuti posture 0005/0008/0013: nilai yang tidak diketahui dibiarkan NULL,
-- bukan ditebak. Faktur lokal tak punya PEB; pembeli ekspor tak punya NPWP
-- Indonesia; setup lama belum mengisi NPWP penjual — ekspor e-Faktur akan
-- MENANDAI baris yang kekurangan field wajib, bukan menuliskannya kosong.
--
-- Gaya DDL mengikuti 0013/0017 (utf8mb4, DATETIME(3)). Tanpa akun/mapping baru.

-- AlterTable: dokumen ekspor (PEB) pada faktur
ALTER TABLE `invoices`
    ADD COLUMN `peb_number` VARCHAR(50) NULL,
    ADD COLUMN `peb_date` DATETIME(3) NULL,
    ADD COLUMN `export_note` TEXT NULL;

-- AlterTable: NPWP pembeli (lawan transaksi faktur keluaran lokal)
ALTER TABLE `customers`
    ADD COLUMN `npwp` VARCHAR(30) NULL;

-- AlterTable: identitas pajak penjual (untuk output e-Faktur / CTAS)
ALTER TABLE `company_settings`
    ADD COLUMN `npwp` VARCHAR(30) NULL,
    ADD COLUMN `tax_name` VARCHAR(150) NULL,
    ADD COLUMN `tax_address` TEXT NULL;
