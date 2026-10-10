-- PENGATURAN SITUS yang bisa disetel operator — menggantikan SSH.
--
-- ══ MASALAHNYA ══════════════════════════════════════════════════════════════
-- Tiga nilai yang paling sering perlu diubah pemilik hanya hidup di
-- environment, jadi mengubahnya menuntut: masuk SSH ke server produksi, sunting
-- `.env`, lalu `docker compose up -d`. Padahal ketiganya BUKAN keputusan teknis:
--
--   • nomor WhatsApp — seluruh corong penawaran Fase B berdiri di atasnya
--     (`docs/KOMERSIALISASI.md` §7, langkah 1);
--   • alamat surel penjualan — jalan kontak paket rundingan & jawaban FAQ;
--   • instruksi transfer manual — tanpanya tombol "Bayar" menghasilkan
--     referensi TANPA nomor rekening, dan tagihan yang terbit tidak bisa
--     dibayar siapa pun (keadaan produksi 10 Okt 2026, §1).
--
-- Panel operator yang tidak bisa menyetel ketiganya adalah panel yang
-- menyerahkan pekerjaan paling sering ke terminal.
--
-- ══ SINGLETON, POLA `mail_settings` ═════════════════════════════════════════
-- Satu baris, dikunci `singleton UNIQUE = 1`: dua baris berarti dua kebenaran
-- tentang satu nomor telepon. `upsert` memakainya sebagai kunci.
--
-- ⚠ NULL ≠ string kosong. NULL berarti "tidak diatur dari sini — pakai
-- environment"; string kosong berarti "operator SENGAJA mengosongkannya".
-- Keduanya harus bisa dibedakan, sebab yang pertama jatuh ke env dan yang kedua
-- mencabut kanalnya. Resolvernya (`lib/site-settings.ts`) menegakkan bedanya.
CREATE TABLE `site_settings` (
  `id`        INT NOT NULL AUTO_INCREMENT,
  `singleton` INT NOT NULL DEFAULT 1,
  -- Nomor WhatsApp dalam bentuk yang sama yang diterima env
  -- (`parseWhatsappNumber`): digit, tanpa tanda plus/spasi.
  `contact_whatsapp` VARCHAR(30) NULL,
  `contact_email`    VARCHAR(191) NULL,
  -- Ditampilkan APA ADANYA ke pelanggan di /platform & surel tagihan, jadi
  -- TEXT: ia memuat nama bank, nomor rekening, dan nama pemilik rekening.
  `manual_payment_instructions` TEXT NULL,
  -- Nama akun operator yang terakhir menyimpan; jejak lengkapnya di jejak audit
  -- operator.
  `updated_by` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `site_settings_singleton_key` (`singleton`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
