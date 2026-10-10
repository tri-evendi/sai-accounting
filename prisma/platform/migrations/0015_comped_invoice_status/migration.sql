-- TAGIHAN KOMPENSASI berhenti mengaku LUNAS.
--
-- Kompensasi operator (`extendSubscription`) memakai satu baris tagihan sebagai
-- KUNCI IDEMPOTENSI — nomornya deterministik + UNIK, jadi perpanjangan yang
-- sama dijalankan dua kali menabrak constraint alih-alih memberi periode kedua.
-- Trik itu benar dan tetap dipakai. Yang salah adalah STATUSNYA: baris itu
-- ditulis `paid` dengan total Rp 0.
--
-- Akibatnya terukur di produksi 10 Okt 2026: KELIMA tagihan berstatus `paid`
-- bernilai NOL rupiah, sehingga "berapa pendapatan kita?" tidak bisa dijawab
-- dari tabel mana pun tanpa lebih dulu tahu bahwa sebagian "lunas" bukan uang.
-- Angka yang menuntut pengetahuan rahasia untuk dibaca benar adalah angka yang
-- suatu hari dibaca salah. Alasan lengkap: `docs/KOMERSIALISASI.md` §8 + §11.
--
-- Status `comped` TIDAK sama dengan `void`: dibatalkan dan diberi-gratis adalah
-- dua peristiwa berbeda — yang pertama tidak memberi hak pakai apa pun, yang
-- kedua justru memberinya.
--
-- ⚠ TIDAK ADA perubahan SKEMA di sini. Kolomnya sudah `VARCHAR(20)` dan daftar
-- nilai sahnya hidup di `lib/platform-constants.ts` + `z.enum` (konvensi
-- docs/DATABASE.md §2) — jadi yang dibutuhkan hanyalah memperbaiki DATAnya.

-- Syaratnya sempit dengan sengaja, dan ketiganya harus benar bersamaan:
--   • `status = 'paid'`        — hanya yang mengaku lunas;
--   • `total = 0`              — tagihan nol rupiah; tagihan sungguhan tidak
--                                pernah nol (tidak ada gunanya menagih nol);
--   • TANPA baris `payments`   — pembuktian terakhir bahwa tidak ada uang yang
--                                pernah lewat. Inilah yang menahan migration
--                                ini dari menyentuh pelunasan sungguhan yang
--                                kebetulan bernilai nol karena cacat lain.
UPDATE `platform_invoices` i
   SET i.`status` = 'comped'
 WHERE i.`status` = 'paid'
   AND i.`total` = 0
   AND NOT EXISTS (
         SELECT 1 FROM `payments` p WHERE p.`platform_invoice_id` = i.`id`
       );
