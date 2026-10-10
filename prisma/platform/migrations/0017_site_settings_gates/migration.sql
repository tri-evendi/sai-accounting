-- DUA GERBANG pindah dari environment ke panel operator.
--
-- Sampai sekarang keduanya hanya hidup di `.env`, jadi mengubahnya menuntut SSH
-- ke server produksi. Keduanya SENGAJA ditahan di migration 0016 karena
-- keduanya bukan "isi" melainkan GERBANG — dan pemiliknya kini memutuskan
-- memindahkannya. Yang berubah hanya TEMPAT keputusannya, bukan sifatnya:
--
--   • `self_serve_signup_open` — membuka/menutup pendaftaran mandiri. Tetap
--     GAGAL-TERTUTUP: NULL berarti "pakai environment", dan environment sendiri
--     hanya terbuka bila ditulis persis `open`. Jadi basis data yang tak
--     terjangkau, kolom yang NULL, dan env yang tak diset semuanya bermuara ke
--     TERTUTUP — tidak ada jalan di mana kehilangan informasi membuka corong.
--
--   • `ppn_enabled` — PPN di tagihan platform. NULL = "pakai environment"
--     (`PLATFORM_PPN_DISABLED`), yang bawaannya PPN AKTIF. Kolom ini dibaca
--     JALUR UANG: tagihan akhir uji coba di penjadwal dan tagihan prorata
--     pindah paket. Mengubahnya mengubah nominal yang ditagih, dan karena itu
--     setiap perubahannya tercatat di jejak audit operator beserta nilai
--     lamanya.
--
-- ⚠ TINYINT(1) NULL, bukan DEFAULT: ketiga keadaan harus bisa dibedakan —
-- "belum pernah disetel dari konsol" (NULL), "dinyalakan" (1), "dimatikan" (0).
-- Kolom ber-DEFAULT akan melahap keadaan pertama, dan dengannya satu-satunya
-- cara mengembalikan keputusan ke environment.
ALTER TABLE `site_settings`
  ADD COLUMN `self_serve_signup_open` TINYINT(1) NULL AFTER `manual_payment_instructions`,
  ADD COLUMN `ppn_enabled`            TINYINT(1) NULL AFTER `self_serve_signup_open`;
