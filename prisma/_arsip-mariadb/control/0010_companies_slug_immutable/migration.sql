-- ─────────────────────────────────────────────────────────────────────────────
-- Slug perusahaan PERMANEN (issue #161) — ditegakkan basis data, bukan niat.
--
-- #157 memutuskan slug tidak boleh diubah, dan keputusan itu benar: sejak #153
-- slug menyusun nama basis data (`sai_t{tenantId}_{slug}`), dan sejak #157 ia
-- duduk di URL. Cache rute `(tenant.slug, company.slug) → id` berdiri di atas
-- keputusan itu. Yang tidak pernah ada: apa pun yang MENOLAKNYA.
--
-- Hari ini memang belum ada satu pun jalur pembaruan yang menyentuh `slug` —
-- pencarian `company.update` di seluruh src/ dan scripts/ tidak menghasilkan
-- apa-apa. Justru itu saat yang tepat memasangnya: penjaga yang lahir sebelum
-- jalurnya ada tidak perlu memburu pemanggil, dan jalur pertama yang kelak
-- ditulis akan menabraknya di percobaan pertama, bukan di produksi.
--
-- KENAPA TRIGGER, BUKAN VALIDASI DI KODE. Immutability tidak bisa dinyatakan
-- sebagai CHECK: constraint hanya melihat baris barunya, sedangkan "berubah"
-- perlu OLD dan NEW sekaligus. Validasi di kode juga hanya menjaga jalur yang
-- MELEWATINYA — sedangkan yang harus dijaga justru jalur yang belum terbayang:
-- skrip perbaikan sekali pakai, `mariadb` di terminal jam 2 pagi, migration
-- orang lain. Trigger berdiri di bawah semuanya.
--
-- SEMANTIKNYA: yang ditolak adalah NILAI yang berubah, bukan kolom yang ikut
-- disebut di SET. `SET slug = slug` dan penulisan baris penuh yang kebetulan
-- menyertakan slug lama tetap lolos — ORM yang menulis seluruh kolom tidak
-- boleh ditolak karena gaya penulisannya. `<=>` dipakai supaya perbandingannya
-- aman terhadap NULL, meski kolomnya NOT NULL hari ini.
--
-- Pesannya menyebut ALASAN dan membedakan `name` dari `slug` — galat generik
-- akan membuat orang berikutnya mengira ini bug dan mencari cara melewatinya.
-- Panjangnya 122 karakter: batas MESSAGE_TEXT adalah 128, dan kelebihannya
-- dipotong DIAM-DIAM.
--
-- Dibuktikan sebelum ditulis ke sini: tabel klon `probe161_companies` di
-- `sai_control` nyata, trigger yang sama dipasang lewat `prisma db execute`
-- (executor yang SAMA dengan `migrate deploy`, jadi tubuh trigger ber-`IF`
-- terbukti tidak perlu DELIMITER). Ubah nama → lolos; nonaktifkan → lolos;
-- `SET slug = slug` → lolos; ganti slug → ERROR 1644 (45000) dan barisnya
-- tidak berubah. Klon dan trigger probe dibuang setelahnya.
--
-- BILA KELAK PENGGANTIAN NAMA MEMANG DIBUTUHKAN: jalurnya bukan membuang
-- trigger ini lalu `UPDATE slug`. Ia perlu slug lama yang DISIMPAN dan tetap
-- DILAYANI sebagai alias — persis alasan issue #161 ada. Membuang trigger ini
-- tanpa alias hanya memindahkan kerusakan ke tautan orang lain, tanpa bunyi.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS `companies_slug_immutable`;

CREATE TRIGGER `companies_slug_immutable` BEFORE UPDATE ON `companies` FOR EACH ROW
  IF NOT (NEW.`slug` <=> OLD.`slug`) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'slug perusahaan permanen (#161): ia menyusun nama basis data dan URL. Nama boleh diubah; ganti slug perlu alias tersimpan.';
  END IF;
