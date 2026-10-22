-- ISI HALAMAN PENDARATAN yang bisa disunting operator — bukan kamus kedua.
--
-- Satu baris = SATU penimpa atas satu kunci kamus, dalam satu bahasa. Kamus di
-- `src/lib/i18n/dictionaries/*.json` tetap sumber BAWAAN dan tetap satu-satunya
-- yang diketik `tsc`; tabel ini hanya menjawab "apakah kalimat ini sudah
-- diganti dari konsol?". Baris yang TIDAK ADA bukan keadaan kosong yang harus
-- diisi — ia berarti "pakai bawaannya", dan itulah keadaan normal untuk
-- sebagian besar kunci.
--
-- Akibatnya yang penting, dan alasan bentuknya begini: menghapus baris =
-- kembali ke bawaan, tanpa satu langkah pun untuk memulihkan teks aslinya.
-- Kalau tabel ini menyimpan SELURUH kalimat pendaratan, kalimat bawaannya
-- tidak punya rumah lagi dan `/` menjadi halaman yang TIDAK BISA dirender saat
-- `sai_platform` mati.
--
-- `content_key`, BUKAN `key`: `KEY` adalah kata kunci MySQL, dan kolom yang
-- harus dikutip di setiap query mentah adalah kolom yang suatu hari lupa
-- dikutip.
CREATE TABLE `site_contents` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  -- `id` | `en` | `zh` — kode bahasa aplikasi (`lib/i18n/config.ts`), bukan
  -- locale BCP-47 lengkap. Penimpa untuk bahasa yang tidak dikenal diabaikan
  -- pembacanya; validasinya tetap di aplikasi (`z.enum`), konvensi
  -- docs/DATABASE.md.
  `locale`      VARCHAR(5) NOT NULL,
  -- Jalur-titik kunci kamus, mis. `landing.heroHeading`. Dibatasi 120: kunci
  -- terpanjang di kamus hari ini 61 karakter.
  `content_key` VARCHAR(120) NOT NULL,
  -- TEXT, bukan VARCHAR: badan FAQ pendaratan sudah melewati 255 karakter, dan
  -- batas yang dilanggar oleh kalimat pemasaran berikutnya adalah batas yang
  -- memaksa migration kedua.
  `value`       TEXT NOT NULL,
  -- Nama akun operator yang terakhir menyimpan. Jejak lengkapnya (siapa, dari
  -- IP mana, kapan, nilai sebelumnya) ada di jejak audit operator; kolom ini
  -- yang tampil di layar di samping kalimatnya.
  `updated_by`  VARCHAR(100) NOT NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  -- SATU penimpa per (bahasa, kunci) — ditegakkan basis data, bukan
  -- periksa-lalu-tulis: `upsert` memakainya sebagai kunci, jadi dua operator
  -- yang menyimpan bersamaan menghasilkan satu baris, bukan dua kebenaran
  -- tentang kalimat yang sama.
  UNIQUE INDEX `site_contents_locale_content_key_key` (`locale`, `content_key`),
  -- Pembaca nyata selalu mengambil SATU bahasa sekaligus (pengunjung punya satu
  -- bahasa aktif), jadi inilah indeks yang benar-benar dipakai jalur panas.
  INDEX `site_contents_locale_idx` (`locale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
