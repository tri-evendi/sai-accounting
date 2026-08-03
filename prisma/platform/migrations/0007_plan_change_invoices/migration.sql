-- Tagihan PERPINDAHAN PAKET swalayan — pelanggan menaikkan paketnya sendiri,
-- membayar SELISIH prorata, dan paketnya berpindah setelah tagihan itu lunas.
--
-- Sampai sekarang perpindahan paket hanya bisa dikerjakan operator
-- (`changeTenantPlan`, ber-audit). Mesinnya tidak berubah; yang ditambahkan di
-- sini hanya satu hal: CARA SEBUAH TAGIHAN MENYATAKAN APA YANG HARUS TERJADI
-- SETELAH IA LUNAS.
--
-- ══ KENAPA DI TAGIHAN, BUKAN TABEL "PERMINTAAN" TERSENDIRI ══════════════════
-- Yang menentukan perpindahan adalah pelunasan tagihan ini. Menyimpan niatnya
-- di tabel kedua berarti dua baris yang harus sepakat — dan pada hari salah
-- satunya gagal ditulis (webhook diputar ulang, proses mati di tengah), yang
-- terjadi adalah pelanggan membayar tanpa naik paket, atau naik paket tanpa
-- membayar. Satu kolom di baris yang sama tidak bisa tidak sepakat dengan
-- dirinya sendiri.
--
-- `NULL` = tagihan langganan biasa dari penjadwal. Seluruh tagihan yang sudah
-- ada karena itu tetap berperilaku persis seperti sebelumnya: migrasi ini tidak
-- mengubah satu pun tagihan berjalan.
--
-- `ON DELETE RESTRICT`: paket yang masih ditunggu pembayarannya tidak boleh
-- lenyap dari katalog — tagihan yang menunjuk paket hantu tidak bisa
-- diselesaikan oleh siapa pun.

-- AlterTable
ALTER TABLE `platform_invoices`
    ADD COLUMN `target_plan_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `platform_invoices_target_plan_id_idx` ON `platform_invoices`(`target_plan_id`);

-- AddForeignKey
ALTER TABLE `platform_invoices`
    ADD CONSTRAINT `platform_invoices_target_plan_id_fkey`
    FOREIGN KEY (`target_plan_id`) REFERENCES `plans`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
