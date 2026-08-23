-- Nama AKUN, terpisah dari nama ORANG yang mendaftar (issue #458).
--
-- Sampai sekarang `registrations.name` dipakai dua kali saat verifikasi:
-- menjadi `users.name` (benar — itu nama orangnya) DAN menjadi `tenants.name`
-- + slug tenant (salah — itu akun, bukan orang). Akibatnya alamat setiap buku
-- memuat nama pribadi pendaftarnya, dilihat setiap staf dan akuntan eksternal
-- yang menerima tautannya.
--
-- NULLABLE dengan sengaja, dan itu bukan kemalasan: baris pendaftaran yang
-- SEDANG BERJALAN (sudah dikirimi surel, belum diklik) tidak punya nilai untuk
-- kolom ini, dan menolaknya berarti mematikan tautan verifikasi yang sudah ada
-- di kotak masuk orang. Baris lama karena itu jatuh ke perilaku lama
-- (`lib/registration-store.ts`), dan pendaftaran BARU selalu mengisinya.
ALTER TABLE `registrations`
  ADD COLUMN `account_name` VARCHAR(150) NULL AFTER `name`;
