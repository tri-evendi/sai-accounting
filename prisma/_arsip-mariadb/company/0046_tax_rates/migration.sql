-- TARIF PPN BER-EFEKTIF-TANGGAL + penanda PKP — issue #368 (temuan F-12).
--
-- KENAPA: tarif PPN adalah KONSTANTA KOMPILASI di `lib/tax.ts`
-- (`DEFAULT_TAX_RATE = 11`), dengan alasan yang masuk akal pada zamannya dan
-- tertulis apa adanya di kepala berkas itu:
--
--   "angka statuter dengan tepat satu nilai benar pada satu waktu, sama untuk
--    setiap pemakai aplikasi — bukan konfigurasi per-tenant"
--
-- Dua premisnya gugur begitu pendaftaran dibuka untuk umum:
--
--   1. "tepat satu nilai benar pada satu waktu" benar HANYA bila waktunya
--      diabaikan. Tarif berubah menurut aturan, dan dokumen yang dicatat MUNDUR
--      ke bulan sebelum perubahan harus memakai tarif yang berlaku PADA
--      TANGGALNYA — bukan tarif hari ini.
--   2. "sama untuk setiap pemakai" tidak benar untuk pelanggan NON-PKP, yang
--      tidak memungut PPN sama sekali. Rilis umum berarti mereka pasti ada, dan
--      bawaan 11% salah bagi mereka sejak faktur pertama.
--
-- Ditambah satu akibat operasional: mengubah tarif hari ini menuntut redeploy
-- ~10 menit di kotak ini, untuk satu angka yang berubah karena Peraturan
-- Menteri.
--
-- ══ YANG SUDAH BENAR DAN TIDAK DIRUSAK MIGRATION INI ═══════════════════════
-- Dokumen tersimpan membawa `tax_rate`-nya SENDIRI (`invoices.tax_rate`), dan
-- mesin posting membaca kolom itu — bukan konstanta. Jadi riwayat sudah aman:
-- faktur lama tidak berubah nilainya ketika tarif berubah. Yang tidak aman
-- hanyalah BAWAAN yang ditawarkan formulir, dan itu yang diperbaiki di sini.
--
-- Migration ini karena itu TIDAK menyentuh satu pun dokumen.
--
-- ══ `is_pkp` BAWAANNYA TRUE ════════════════════════════════════════════════
-- Setiap perusahaan yang sudah ada hari ini berperilaku seolah PKP (bawaan
-- 11%). `true` adalah satu-satunya nilai yang tidak mengubah keadaan siapa pun
-- saat migration diterapkan; wisaya penyiapan yang menanyakannya kepada
-- perusahaan BARU.
--
-- ══ BARIS TARIF TIDAK PERNAH DISUNTING ═════════════════════════════════════
-- Mengubah tarif berarti MENAMBAH baris ber-`effective_from` baru. Menyunting
-- baris 2022 hari ini akan mengubah cara setiap faktur 2022 dibaca ulang —
-- yaitu menulis ulang masa lalu, dari layar pengaturan.
--
-- Baris pertamanya TIDAK disemai di sini: penyemaian butuh tanggal berlaku yang
-- benar (1 April 2022, UU HPP) dan alasannya, dan itu ditulis kode penyemai
-- (`ensureTaxRates`) yang berjalan saat perusahaan dibaca pertama kali. Sebuah
-- INSERT di migration akan menanam angka tanpa cara memperbaikinya bila kelak
-- ternyata keliru.

-- AlterTable
ALTER TABLE `company_settings` ADD COLUMN `is_pkp` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `tax_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rate` DECIMAL(5, 2) NOT NULL,
    `effective_from` DATE NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tax_rates_effective_from_key`(`effective_from`),
    INDEX `tax_rates_effective_from_idx`(`effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
