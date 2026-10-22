-- Kode barang (issue #493).
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- Sampai sekarang identitas sebuah barang adalah NAMANYA, dan `items.name`
-- karena itu `UNIQUE`. Berkas saldo awal 2024 milik pengguna pertama
-- membantahnya: ia memuat DUA barang berbeda bernama sama persis —
-- `LONG PEPPER` kode 100006 (1.101 kg @ ±Rp 50.000) dan kode 100010
-- (13.684,06 kg @ ±Rp 13.500). Keduanya nyata, keduanya bersaldo, dan harga
-- satuannya berbeda hampir empat kali lipat, jadi jelas bukan baris kembar
-- yang salah cetak melainkan dua mutu barang yang kebetulan dinamai sama.
--
-- Di skema lama hanya satu yang bisa hidup. Yang membedakan keduanya di sistem
-- asal adalah KODE, dan kolom itu belum punya tempat di sini.
--
-- ══ URUTAN LANGKAHNYA PENTING ══════════════════════════════════════════════
-- Kolomnya ditambahkan NULL dulu, diisi, baru dijadikan NOT NULL + UNIQUE.
-- Menambahkan kolom `NOT NULL UNIQUE` sekaligus di atas tabel berisi akan
-- menabrak: MySQL mengisi baris lama dengan string kosong, dan string kosong
-- yang sama untuk semua baris melanggar UNIQUE-nya sendiri.
--
-- ══ KODE SEMENTARA: DITURUNKAN, BUKAN DIACAK ═══════════════════════════════
-- Baris yang sudah ada mendapat `ITM-0001`, `ITM-0002`, … dari `id`-nya.
-- Deterministik dengan sengaja: migrasi yang sama dijalankan di empat basis
-- data PT, dan kode acak berarti empat hasil berbeda yang tak bisa
-- dicocokkan bila suatu saat perlu ditelusuri. `LPAD` ke 4 digit hanya demi
-- keterbacaan; `VARCHAR(20)` menampung jauh lebih panjang bila id tumbuh.
--
-- Kode ini SEMENTARA dalam arti "menunggu diganti kode sebenarnya oleh
-- pengguna", bukan dalam arti boleh berubah sendiri. Ia stabil selamanya
-- sampai ada yang menyuntingnya.
ALTER TABLE `items` ADD COLUMN `code` VARCHAR(20) NULL AFTER `id`;

UPDATE `items` SET `code` = CONCAT('ITM-', LPAD(`id`, 4, '0')) WHERE `code` IS NULL;

ALTER TABLE `items` MODIFY COLUMN `code` VARCHAR(20) NOT NULL;

CREATE UNIQUE INDEX `items_code_key` ON `items`(`code`);

-- Nama berhenti menjadi kunci. Barang bernama sama kini SAH selama kodenya
-- berbeda — tetapi tidak diterima diam-diam: `/api/inventory` menahannya
-- dengan konfirmasi sekali ("simpan sebagai barang terpisah?"), supaya salah
-- ketik yang akan membelah riwayat stok tetap tertangkap sebelum tersimpan.
-- Perlindungan yang dipasang 24 Agustus 2026 berubah BENTUK, bukan hilang.
DROP INDEX `items_name_key` ON `items`;

-- Nama masih dicari & diurutkan meski bukan lagi kunci; tanpa index uniknya
-- yang barusan dibuang, pencarian barang jatuh ke pemindaian tabel penuh.
CREATE INDEX `items_name_idx` ON `items`(`name`);
