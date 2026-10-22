-- Revaluasi pos moneter valas pada tanggal pelaporan (issue #554).
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- Selisih kurs sampai sekarang hanya dihitung saat PELUNASAN. Itu benar, dan
-- itu selisih TEREALISASI. Yang tidak pernah dihitung: nilai piutang, utang,
-- dan kas valas yang masih terbuka pada tanggal neraca.
--
-- Akibatnya piutang USD 100.000 yang dibukukan pada kurs 15.800 tetap berdiri
-- Rp 1,58 M di neraca 30 September walau kurs penutup hari itu 16.500 — neraca
-- kurang Rp 70 juta, dan laba rugi tidak melihatnya sampai uangnya bergerak,
-- kadang bertahun kemudian.
--
-- PSAK 10 (IAS 21) menuntut penjabaran ulang itu pada setiap tanggal
-- pelaporan. Bukan kebijakan yang boleh dipilih.
--
-- Materialitasnya bukan teori di buku INI: dari 609 kontrak, 495 CNY dan 114
-- USD — nol IDR. Hampir seluruh pendapatannya valas.
--
-- ══ SATU BARIS PER (PERIODE, MATA UANG) ════════════════════════════════════
-- Bukan per akun. Rincian per akun sudah menjadi baris jurnal, dan menyimpannya
-- kedua kali di sini melahirkan dua sumber untuk satu angka — yang suatu hari
-- berbeda, dan yang salah selalu yang paling jarang dilihat orang.
--
-- Jurnalnya ditemukan lewat `journals.source_type` = 'fx_revaluation' dan
-- `source_id` = id baris ini, pola yang sama dengan setiap dokumen lain.
--
-- ══ KENAPA `closing_rate` DISIMPAN, PADAHAL IA ADA DI BARIS JURNAL ═════════
-- Ia BUKTI, bukan data turunan. Laporan yang terbit atas dasar angka ini harus
-- bisa ditelusuri sampai ke kurs yang dipakai, oleh orang yang membukanya
-- setahun kemudian dan tidak punya cara lain mengetahuinya. Kurs yang hanya
-- hidup di dalam perkalian sebuah baris jurnal tidak bisa ditanya.
--
-- ══ UNIQUE (year, month, currency) — INI PENJAGA IDEMPOTENSINYA ════════════
-- Menjalankan revaluasi dua kali untuk bulan yang sama adalah kesalahan yang
-- paling mudah dilakukan (halaman dimuat ulang, tombol diklik dua kali) dan
-- paling mahal: dua jurnal, dan neraca yang bergerak dua kali sejauh yang
-- seharusnya. Constraint ini membuat percobaan kedua GAGAL di basis data,
-- bukan bergantung pada pemeriksaan di aplikasi yang bisa kalah balapan.
--
-- ══ NOL PERUBAHAN PADA DATA YANG ADA ═══════════════════════════════════════
-- Tabel baru, tanpa backfill, tanpa satu pun kolom lama tersentuh. Buku yang
-- tidak pernah merevaluasi berperilaku persis seperti sebelumnya.

CREATE TABLE `fx_revaluations` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `year`          INT NOT NULL,
  `month`         INT NOT NULL,
  `currency`      VARCHAR(5) NOT NULL,
  `closing_rate`  DECIMAL(18, 6) NOT NULL,
  `carrying_base` DECIMAL(15, 2) NOT NULL,
  `revalued_base` DECIMAL(15, 2) NOT NULL,
  `difference`    DECIMAL(15, 2) NOT NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL,

  UNIQUE INDEX `fx_revaluations_year_month_currency_key` (`year`, `month`, `currency`),
  INDEX `fx_revaluations_year_month_idx` (`year`, `month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
