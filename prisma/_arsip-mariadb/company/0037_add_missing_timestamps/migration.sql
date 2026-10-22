-- Kolom waktu wajib (`created_at` / `updated_at`) untuk 11 tabel yang belum
-- punya — utang teknis yang tercatat di docs/DATABASE.md §10 (issue #104).
--
-- KENAPA SEKARANG: skema ini sebentar lagi akan DIGANDAKAN ke satu basis data
-- per perusahaan. Setiap celah yang dibiarkan hari ini bukan lagi satu tabel
-- yang harus diperbaiki, melainkan N tabel di N basis data — dan setiap
-- perbaikan harus diputar ulang di semuanya, sebagian mungkin saat basis data
-- itu sedang dipakai. Merapikan skema SEBELUM ia dilipatgandakan adalah
-- pekerjaan yang sama dengan ongkos paling murah yang pernah ada.
--
-- KENAPA KOLOM INI PENTING, BUKAN SEKADAR KELENGKAPAN: tanpa `created_at`,
-- sebuah baris tidak bisa menjawab "kapan ini masuk ke sistem?" — pertanyaan
-- yang berbeda dari "kapan transaksinya terjadi?" (`date`). Selisih keduanya
-- persis yang dicari saat mengusut entri terlambat, entri susulan, atau
-- perbedaan antara buku dan rekening koran. Tanpa `updated_at`, tidak ada satu
-- pun jejak bahwa baris pernah DIUBAH setelah dibuat.
--
-- ══ BACKFILL: TANGGAL TRANSAKSI, BUKAN NOW() ═══════════════════════════════
-- Mengisi `created_at` dengan waktu migration akan menyatakan bahwa SELURUH
-- riwayat perusahaan ini dibuat pada satu detik yang sama — jelas keliru, dan
-- membuat kolomnya tak berguna untuk pengurutan selamanya. Jadi setiap tabel
-- diisi dari sumber terbaik yang benar-benar dimilikinya:
--   • punya kolom `date` sendiri  → `created_at` = `date`
--     (contract_payments, invoice_payments, supplier_transactions,
--      stock_movements, currency_conversions)
--   • baris-detail milik header   → `created_at` = `created_at` header-nya
--     (contract_items → contracts, invoice_items → invoices,
--      journal_lines → journals)
--   • `items`                     → gerakan stok PERTAMA barang itu, sebab
--     itulah jejak paling awal keberadaannya; barang yang belum pernah
--     bergerak jatuh ke waktu migration (tak ada informasi lain yang jujur)
--   • `documents`                 → `uploaded_at` yang sudah ada, DIGANTI NAMA
--   • `cash_accounts`             → `created_at`-nya memang sudah ada
-- Ini APROKSIMASI dan disebut apa adanya: tanggal transaksi bukan waktu entri.
-- Tapi ia benar dalam urutan dan benar dalam orde besaran, sementara NOW()
-- salah pada keduanya.
--
-- `updated_at` diisi = `created_at`, bukan NOW(): baris lama memang belum
-- pernah diubah sejak dibuat, dan mengaku "baru saja diubah" akan berbohong
-- kepada setiap audit yang membacanya nanti.
--
-- ══ KENAPA `updated_at` PUNYA DEFAULT DI SINI ══════════════════════════════
-- 20 tabel lama mendeklarasikan `updated_at DATETIME(3) NOT NULL` tanpa
-- DEFAULT (Prisma yang mengisinya lewat `@updatedAt`). Pola itu hanya aman
-- pada CREATE TABLE. Menambah kolom NOT NULL tanpa DEFAULT ke tabel yang SUDAH
-- BERISI baris membuat MariaDB memakai nilai implisit — di sql_mode ketat itu
-- galat, di mode longgar ia menulis '0000-00-00' yang lebih buruk lagi karena
-- diam. Karena itu kolomnya lahir dengan DEFAULT CURRENT_TIMESTAMP(3), lalu
-- di-backfill. `@updatedAt` di Prisma tetap yang mengisi nilai saat aplikasi
-- menulis; DEFAULT-nya hanya jaring pengaman untuk INSERT di luar Prisma.
--
-- ══ TIDAK ADA PERUBAHAN PERILAKU AKUNTANSI ═════════════════════════════════
-- Tidak ada nominal, kuantitas, tanggal transaksi, atau status yang disentuh.
-- Setiap laporan menghasilkan angka yang sama persis sebelum dan sesudah.

-- ─── Baris-detail kontrak & faktur ────────────────────────────────────────
ALTER TABLE `contract_items`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `contract_items` ci
  JOIN `contracts` c ON c.`id` = ci.`contract_id`
  SET ci.`created_at` = c.`created_at`, ci.`updated_at` = c.`created_at`;

ALTER TABLE `invoice_items`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `invoice_items` ii
  JOIN `invoices` i ON i.`id` = ii.`invoice_id`
  SET ii.`created_at` = i.`created_at`, ii.`updated_at` = i.`created_at`;

-- ─── Pembayaran (punya `date` sendiri) ────────────────────────────────────
ALTER TABLE `contract_payments`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `contract_payments` SET `created_at` = `date`, `updated_at` = `date`;

ALTER TABLE `invoice_payments`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `invoice_payments` SET `created_at` = `date`, `updated_at` = `date`;

-- ─── Transaksi pemasok ────────────────────────────────────────────────────
ALTER TABLE `supplier_transactions`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `supplier_transactions` SET `created_at` = `date`, `updated_at` = `date`;

-- ─── Gerakan stok ─────────────────────────────────────────────────────────
ALTER TABLE `stock_movements`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `stock_movements` SET `created_at` = `date`, `updated_at` = `date`;

-- ─── Barang (master) — jejak paling awal = gerakan stok pertamanya ────────
ALTER TABLE `items`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `items` i
  SET i.`created_at` = COALESCE(
        (SELECT MIN(sm.`date`) FROM `stock_movements` sm WHERE sm.`item_id` = i.`id`),
        i.`created_at`
      );
UPDATE `items` SET `updated_at` = `created_at`;

-- ─── Baris jurnal (milik header `journals`) ───────────────────────────────
ALTER TABLE `journal_lines`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `journal_lines` jl
  JOIN `journals` j ON j.`id` = jl.`journal_id`
  SET jl.`created_at` = j.`created_at`, jl.`updated_at` = j.`created_at`;

-- ─── Konversi mata uang ───────────────────────────────────────────────────
ALTER TABLE `currency_conversions`
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `currency_conversions` SET `created_at` = `date`, `updated_at` = `date`;

-- ─── Kas: `created_at` sudah ada sejak 0001, tinggal `updated_at` ─────────
ALTER TABLE `cash_accounts`
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `cash_accounts` SET `updated_at` = `created_at`;

-- ─── Dokumen: `uploaded_at` ADALAH `created_at`, cuma beda nama ───────────
-- CHANGE COLUMN, bukan ADD + DROP: nilainya dipertahankan utuh, tidak ada
-- momen di mana informasi waktu unggahnya hilang.
ALTER TABLE `documents`
  CHANGE COLUMN `uploaded_at` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `documents` SET `updated_at` = `created_at`;
