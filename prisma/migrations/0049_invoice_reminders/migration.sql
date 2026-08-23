-- Pengingat jatuh tempo KE PELANGGAN (issue #467).
--
-- Aditif seluruhnya. Tidak ada satu baris pun yang berubah perilakunya saat
-- migration ini diterapkan: `reminder_enabled` bawaannya FALSE, jadi setiap
-- perusahaan yang sudah ada tetap TIDAK mengirim apa pun sampai seseorang
-- menyalakannya sendiri. Itu bukan pilihan gaya — ini fitur pertama yang
-- berbicara ke orang luar atas nama pengguna, dan surel yang terlanjur keluar
-- tidak bisa ditarik kembali.
ALTER TABLE `company_settings`
  ADD COLUMN `reminder_enabled`   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN `reminder_points`    VARCHAR(100) NULL,
  ADD COLUMN `reminder_tested_at` DATETIME(3)  NULL;

-- Kiriman OTOMATIS ikut ke tabel riwayat yang sudah ada (#465), bukan tabel
-- kedua: pembacanya satu orang dengan satu pertanyaan ("faktur ini sudah
-- dikabari apa belum"), dan dua daftar berdampingan yang harus disatukan mata
-- adalah cara termudah membuat pertanyaan itu tetap tak terjawab.
ALTER TABLE `invoice_sends`
  ADD COLUMN `reminder_kind`    VARCHAR(20) NULL,
  ADD COLUMN `reminder_due_key` VARCHAR(20) NULL;

-- IDEMPOTENSI: penjadwal yang berjalan dua kali menabrak constraint ini alih-alih
-- melahirkan surel kembar ke pelanggan.
--
-- Kiriman MANUAL menyimpan NULL di kedua kolom, dan MySQL/MariaDB mengizinkan
-- NULL berulang di dalam kunci unik — jadi menekan "kirim" sepuluh kali tetap
-- menghasilkan sepuluh baris riwayat. Yang dikunci hanya yang otomatis.
CREATE UNIQUE INDEX `invoice_sends_invoice_id_reminder_kind_reminder_due_key_key`
  ON `invoice_sends` (`invoice_id`, `reminder_kind`, `reminder_due_key`);
