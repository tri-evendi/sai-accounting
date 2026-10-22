-- Selaraskan nilai enum-like data legacy dengan nilai yang DIBACA kode (issue #111).
--
-- MASALAHNYA BUKAN GALAT, MELAINKAN ANGKA YANG SALAH DIAM-DIAM. Impor legacy
-- (`scripts/migrate-legacy.ts`) menyalin kolom lama apa adanya: `tb_stok.status`
-- berisi 'IN'/'OUT'/'PROCESS', dan `tb_penjualan.sumber` berisi 'Kas Kecil',
-- 'Kas Besar', 'Rp', 'USD', 'CNY'. Yang dibandingkan kode adalah 'in'/'out' dan
-- 'bank'/'kas_besar'/'kas_kecil'. Kolomnya VARCHAR, bukan ENUM, jadi basis data
-- tidak punya alasan menolak satu baris pun.
--
-- KENAPA TIDAK PERNAH BERBUNYI: collation `utf8mb4_unicode_ci` membuat
-- `WHERE type = 'in'` COCOK dengan 'IN'. Jadi setiap pemeriksaan lewat SQL
-- terlihat benar. Yang keliru hanya perbandingan yang dilakukan di JavaScript
-- (`s.type === "in"`) — dan justru di sanalah saldo stok dihitung.
--
-- Akibatnya di produksi sebelum migration ini:
--   * 829 gerakan stok tak satu pun cocok 'in'/'out' → saldo 33 barang terbaca
--     NOL, halaman Stok melaporkan semuanya habis, nilai persediaan nol;
--   * 18.689 dari 18.689 baris kas bertipe di luar daftar → setiap jurnal kas
--     dari baris legacy memakai akun kas BAWAAN, apa pun buku aslinya.
--
-- ══ PEMETAAN — DAN KEPUTUSAN DI BALIKNYA ═══════════════════════════════════
--
-- 'IN' → 'in', 'OUT' → 'out'. Tidak ada yang perlu diputuskan.
--
-- 'PROCESS' (306 baris legacy, 2020–2025) → 'process', NILAI YANG SAH, dan
-- sengaja TIDAK menggeser saldo. Kolom `shipment`-nya berisi nama penangan
-- (Tobelo, Zainudin, Hanif, Liandi) dan 'DONE PROSES': barang diserahkan untuk
-- disortir/diolah dan MASIH milik perusahaan. Memetakannya ke 'out' akan
-- menghapus barang yang sebenarnya ada; membuangnya dari perhitungan akan
-- menghilangkan jejaknya. Lihat `STOCK_MOVEMENT_TYPES` di `src/lib/inventory.ts`.
--
-- 'Rp' (3.240), 'USD' (11), 'CNY' (52) → 'bank'. Keterangan barisnya menyebut
-- 'Setoran Awal', 'Transfer … Bank BTPN', 'Buku Cek CNY', 'Biaya Admin',
-- 'Pembukaan Rek USD', 'Bunga', 'Pajak' — itu rekening bank, bukan kas fisik.
-- Yang membedakan ketiganya adalah MATA UANG, dan mata uang punya kolomnya
-- sendiri.
--
-- ══ KENAPA `currency` DIPERBAIKI DULU, BARU `type` ═════════════════════════
-- Impor legacy memaksa `currency = 'IDR'` untuk SETIAP baris, termasuk yang
-- nilainya jelas-jelas mata uang asing (5 USD, 7 CNY). Setelah `type` ditimpa
-- jadi 'bank', kolom `type` — satu-satunya jejak mata uang yang tersisa — hilang
-- selamanya. Karena itu urutannya tidak boleh dibalik.
--
-- `rate` SENGAJA DIBIARKAN NULL untuk 63 baris valas itu: data legacy tidak
-- pernah menyimpan kursnya, dan mengarang kurs berarti mengarang angka rupiah
-- di Neraca. Konsekuensinya jelas dan justru diinginkan — `resolveRate()`
-- MENOLAK memposting transaksi valas tanpa kurs, jadi baris-baris itu berbunyi
-- saat ada yang mencoba memposting, bukan diam-diam masuk sebagai rupiah.
--
-- ══ JURNAL YANG SUDAH TERBIT TIDAK DISENTUH ════════════════════════════════
-- Migration ini hanya menyentuh kolom `type` dan `currency` di dua tabel
-- sumber. Tidak ada baris `journals`/`journal_lines` yang diubah, dibalik, atau
-- diposting ulang. Jurnal legacy yang terlanjur memakai akun kas bawaan tetap
-- apa adanya; yang berubah adalah posting BERIKUTNYA memilih akun yang benar.

-- ── 1. Gerakan stok ────────────────────────────────────────
-- LOWER() cukup dan lebih jujur daripada daftar nilai: satu-satunya perbedaan
-- adalah huruf besar/kecil ('IN', 'OUT', 'PROCESS'). Perbandingannya BINARY,
-- sebab dengan collation _ci `type <> LOWER(type)` tidak pernah benar.
UPDATE stock_movements
SET type = LOWER(TRIM(type))
WHERE CAST(type AS BINARY) <> CAST(LOWER(TRIM(type)) AS BINARY);

-- ── 2. Mata uang buku kas valas (WAJIB sebelum langkah 3) ──
UPDATE cash_movements
SET currency = 'USD'
WHERE TRIM(type) = 'USD' AND currency = 'IDR';

UPDATE cash_movements
SET currency = 'CNY'
WHERE TRIM(type) IN ('CNY', 'RMB') AND currency = 'IDR';

-- ── 3. Jenis buku kas ──────────────────────────────────────
-- Perbandingannya sengaja case-insensitive (collation bawaan): 'Kas Besar',
-- 'KAS BESAR', dan 'kas besar' sama-sama satu buku. ELSE `type` membuat nilai
-- yang TIDAK dikenali tetap apa adanya — dibiarkan terlihat, bukan dipaksa
-- masuk ke 'bank' dan menghilang dari pandangan. `npm run check:legacy-values`
-- melaporkan sisa semacam itu.
UPDATE cash_movements
SET type = CASE
    WHEN TRIM(type) IN ('Kas Besar', 'kas_besar', 'KasBesar') THEN 'kas_besar'
    WHEN TRIM(type) IN ('Kas Kecil', 'kas_kecil', 'KasKecil') THEN 'kas_kecil'
    WHEN TRIM(type) IN ('Rp', 'IDR', 'USD', 'CNY', 'RMB', 'Bank') THEN 'bank'
    ELSE type
  END
WHERE CAST(type AS BINARY) NOT IN (CAST('bank' AS BINARY), CAST('kas_besar' AS BINARY), CAST('kas_kecil' AS BINARY));
