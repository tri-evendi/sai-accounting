-- Tutup buku tahunan (issue #555).
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- Diukur di buku produksi sebelum migrasi ini: akun `3102 Laba Ditahan` punya
-- NOL baris jurnal. Laba setiap tahun tinggal di akun pendapatan dan beban
-- selamanya, dan neraca melipat seluruh hasil sejak buku dibuka menjadi satu
-- baris "Akumulasi Laba/Rugi".
--
-- Labelnya jujur, jadi ini bukan salah label — yang hilang strukturnya. Dua
-- akibatnya nyata: Laporan Perubahan Ekuitas (satu dari lima laporan yang
-- dituntut PSAK) MUSTAHIL dibuat, sebab ia justru laporan yang memisahkan hasil
-- tahun berjalan dari tahun-tahun sebelumnya; dan 3102 menjadi persis akun yang
-- diperingatkan `coa-seeding.ts` — nol selamanya sambil memenuhi setiap pemilih
-- akun, mengundang orang menjurnal ke ekuitas dengan tangan.
--
-- ══ KENAPA TABEL, PADAHAL JURNALNYA SUDAH MENJADI BUKTI ════════════════════
-- Tiga hal yang tidak bisa ditanyakan kepada jurnal penutup:
--
--   • SIAPA yang menutup — jurnal tidak menyimpan pelakunya;
--   • KAPAN tombolnya ditekan — tanggal jurnalnya akhir TAHUN BUKU, yang bisa
--     berbulan-bulan sebelum orangnya benar-benar menutup;
--   • laba yang dipindahkan sebagai angka yang berdiri sendiri, tanpa harus
--     menjumlahkan ulang baris-barisnya.
--
-- Ketiganya justru yang ditanyakan orang setahun kemudian.
--
-- ══ UNIQUE (year) — INI PENJAGA IDEMPOTENSINYA ═════════════════════════════
-- Menutup tahun dua kali menggandakan laba di Laba Ditahan dan menolkan akun
-- yang sudah nol — neraca bergerak dua kali sejauh yang seharusnya, dan tetap
-- seimbang. Constraint ini membuat percobaan kedua GAGAL di basis data, bukan
-- bergantung pada pemeriksaan aplikasi yang bisa kalah balapan.
--
-- ══ PEMBATALAN TIDAK MENGHAPUS BARIS ═══════════════════════════════════════
-- `reversed_at` diisi, barisnya tetap. Menghapusnya berarti menghapus jejak
-- bahwa tahun itu pernah ditutup dan dibuka lagi — dan pertanyaan "kenapa laba
-- ditahan kami berubah bulan lalu" tidak akan punya jawaban.
--
-- ⚠ Karena `year` UNIK dan barisnya tidak dihapus, menutup ULANG tahun yang
-- pernah dibatalkan MEMPERBARUI baris yang sama (reversed_at dikosongkan),
-- bukan menyisipkan yang kedua.
--
-- ══ NOL PERUBAHAN PADA DATA YANG ADA ═══════════════════════════════════════
-- Tabel baru, tanpa backfill. Tidak ada tahun yang otomatis dianggap tertutup:
-- buku yang belum pernah menutup tahun berperilaku persis seperti sebelumnya,
-- dan neracanya tetap menampilkan akumulasi seperti hari ini sampai seseorang
-- menutup tahun pertamanya dengan sadar.

CREATE TABLE `year_closes` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `year`            INT NOT NULL,
  `net_income`      DECIMAL(15, 2) NOT NULL,
  `closed_accounts` INT NOT NULL,
  `closed_by_id`    INT NULL,
  `closed_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversed_at`     DATETIME(3) NULL,
  `reversed_by_id`  INT NULL,
  `created_at`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3) NOT NULL,

  UNIQUE INDEX `year_closes_year_key` (`year`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
