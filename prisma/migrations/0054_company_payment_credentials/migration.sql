-- Kredensial gerbang pembayaran MILIK PT (issue #466, butir 5 & 6).
--
-- Kolomnya duduk di basis data PT itu sendiri, jadi lingkupnya adalah batas
-- basis data — bukan sebuah klausa `where` yang bisa terlupa.
--
-- Semuanya NULLable dan `payment_is_production` berbawaan 0: pemasangan yang
-- sudah berjalan mendapat kolom baru yang berarti "fitur mati", persis seperti
-- kemarin. Tidak ada backfill dan tidak ada perubahan perilaku.
ALTER TABLE `company_settings`
  ADD COLUMN `payment_gateway`                VARCHAR(20)  NULL,
  ADD COLUMN `payment_client_key`             VARCHAR(120) NULL,
  ADD COLUMN `payment_server_key_ciphertext`  TEXT         NULL,
  ADD COLUMN `payment_server_key_iv`          VARCHAR(32)  NULL,
  ADD COLUMN `payment_server_key_tag`         VARCHAR(32)  NULL,
  ADD COLUMN `payment_is_production`          BOOLEAN      NOT NULL DEFAULT 0;
