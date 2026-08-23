-- Riwayat slug tenant + penanda kapan slug terakhir diganti (issue #458, lingkup 3).
--
-- ══ KENAPA SLUG LAMA DISIMPAN, BUKAN DIBUANG ══════════════════════════════
-- Slug tenant berdiri di setiap alamat buku (`/t/<slug>/…`). Begitu sebuah
-- akun berganti slug, seluruh alamat lama tetap hidup di: bookmark, surel
-- undangan yang SUDAH terkirim, riwayat peramban, dan tautan yang dibagikan ke
-- akuntan eksternal. Tabel ini yang membuat semua itu tetap sampai — jalur
-- masuk mencarinya di sini lalu memantulkan 308 ke alamat kanoniknya.
--
-- ══ DAN KENAPA IA `UNIQUE` ════════════════════════════════════════════════
-- Slug lama TIDAK PERNAH dilepas untuk dipakai akun lain. Kalau ia bisa
-- diambil, sebuah tautan lama akan mendarat di buku MILIK ORANG LAIN — dan
-- pemiliknya tidak akan pernah tahu ia menerima tamu yang salah alamat.
-- `UNIQUE` di sini menutup itu di lapisan basis data, bukan di lapisan niat.
CREATE TABLE `tenant_slug_history` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `tenant_id`  INT NOT NULL,
  `slug`       VARCHAR(50) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_slug_history_slug_key` (`slug`),
  INDEX `tenant_slug_history_tenant_id_idx` (`tenant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Kapan slug terakhir diganti — dasar pagar "sekali per 30 hari".
--
-- Pagarnya ada bukan untuk menyulitkan, melainkan karena setiap penggantian
-- meninggalkan satu slug yang dipesan selamanya DAN memutus tautan yang belum
-- sempat diperbarui siapa pun. NULL = belum pernah diganti.
ALTER TABLE `tenants`
  ADD COLUMN `slug_changed_at` DATETIME(3) NULL AFTER `slug`;
