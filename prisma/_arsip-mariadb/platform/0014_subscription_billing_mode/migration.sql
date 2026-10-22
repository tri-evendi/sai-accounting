-- MODE PENAGIHAN per langganan — gerbang yang selama ini tidak ada.
--
-- Sampai kolom ini lahir, penjadwal menerbitkan tagihan untuk SETIAP langganan
-- yang masa uji cobanya habis, tanpa satu pun pemeriksaan "apakah akun ini
-- memang pelanggan", dan harga nol pun tidak dilewati. Dua tenant internal
-- selamat hanya karena kebetulan tidak pernah melewati jalur `trialing`.
--
-- Akibatnya nyata dan sudah terjadi: sembilan akun UJI COBA ditagih
-- Rp 664.890, ditagih ulang lewat 40 surel, lalu lima ditangguhkan menjadi
-- hanya-baca. Alasan lengkap: `docs/KOMERSIALISASI.md` §1.1 + §3.3.
--
-- ⚠ BAWAANNYA `none` (tidak pernah ditagih), dan itu arah yang disengaja:
-- baris yang dibuat image LAMA — yang belum tahu kolom ini ada — mendapat
-- bawaan basis data. Kurang tagih bisa diperbaiki dengan satu faktur; buku
-- pelanggan yang terkunci karena tagihan yang tidak pernah ia setujui tidak
-- bisa ditarik kembali.
ALTER TABLE `subscriptions`
  ADD COLUMN `billing_mode` VARCHAR(10) NOT NULL DEFAULT 'none' AFTER `billing_cycle`;

-- Langganan yang SUDAH ADA pun `none`, bukan `auto`.
--
-- Ini keputusan, bukan kelalaian: pada hari migration ini ditulis TIDAK SATU PUN
-- dari sebelas langganan di produksi punya perjanjian komersial (nol baris di
-- `payments`, nol profil penagihan), jadi menandai mereka `auto` berarti
-- melanjutkan persis keadaan yang kolom ini dibuat untuk mengakhiri. Akun yang
-- memang berbayar ditandai `auto` SATU PER SATU oleh manusia, dengan alasan yang
-- tercatat di jejak audit operator.
--
-- Baris di bawah redundan terhadap DEFAULT di atas (MySQL mengisi kolom baru
-- dengan default-nya). Ia ditulis supaya niatnya terbaca di `migrate status`
-- dan supaya pemasangan yang kolomnya sudah ada lewat jalur lain tetap
-- dinormalkan.
UPDATE `subscriptions` SET `billing_mode` = 'none' WHERE `billing_mode` NOT IN ('none', 'manual', 'auto');

-- Penjadwal menyaring per mode di setiap putaran (per jam), jadi indeksnya
-- dipakai jalur panasnya sendiri.
CREATE INDEX `subscriptions_billing_mode_idx` ON `subscriptions` (`billing_mode`);
