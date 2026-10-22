-- Index yang hilang pada kolom yang paling sering disaring (issue #104).
--
-- KENAPA: docs/DATABASE.md §5 mewajibkan index untuk FK, `date`, `status`,
-- `code`, dan `number`. Kolom FK sudah aman dengan sendirinya — InnoDB membuat
-- index untuk setiap FOREIGN KEY, jadi mendeklarasikannya lagi hanya melahirkan
-- index kembar yang memperlambat setiap INSERT tanpa mempercepat satu query pun.
-- Yang benar-benar kurang adalah kolom `date` dan `status` di bawah ini: semua
-- dibaca oleh laporan berbasis rentang tanggal (Buku Besar, L/R, Neraca, Arus
-- Kas, umur piutang/hutang), yang tanpa index memaksa full table scan yang
-- tumbuh seiring umur perusahaan.
--
-- Kenapa sekarang, bukan "saat disentuh": skema ini akan digandakan menjadi
-- satu basis data per perusahaan. Tabel kecil hari ini adalah N tabel yang
-- masing-masing tumbuh sendiri besok, dan menambahkan index ke tabel besar yang
-- sedang dipakai jauh lebih mahal daripada ke tabel yang masih ringan.
--
-- ══ YANG SENGAJA TIDAK DIBUAT ══════════════════════════════════════════════
--   • FK apa pun         → sudah punya index bawaan InnoDB (lihat di atas).
--   • `journals.source_id` → sudah tercakup `journals_source_type_source_id_idx`
--     (prefix kiri), dan pencarian selalu menyebut keduanya.
--   • `fixed_asset_depreciations.date` → sudah tercakup `(year, month)`, yang
--     memang cara penyusutan dicari.
--   • `users.status` → kolomnya dihapus di migration 0041.
--
-- ══ HANYA INDEX ════════════════════════════════════════════════════════════
-- Tidak ada kolom, tipe, atau baris yang berubah. Semua query mengembalikan
-- hasil yang sama persis — hanya lebih cepat.

-- Status dokumen: disaring di daftar faktur/kontrak dan di setiap kartu ringkasan.
CREATE INDEX `contracts_status_idx` ON `contracts`(`status`);
CREATE INDEX `invoices_status_idx` ON `invoices`(`status`);

-- Tanggal transaksi: dasar setiap laporan berbasis periode.
CREATE INDEX `contract_payments_date_idx` ON `contract_payments`(`date`);
CREATE INDEX `invoice_payments_date_idx` ON `invoice_payments`(`date`);
CREATE INDEX `supplier_transactions_date_idx` ON `supplier_transactions`(`date`);
CREATE INDEX `cash_accounts_date_idx` ON `cash_accounts`(`date`);
CREATE INDEX `currency_conversions_date_idx` ON `currency_conversions`(`date`);

-- Penilaian persediaan & HPP rata-rata tertimbang membaca gerakan SATU barang
-- urut waktu — index gabungan, bukan dua index terpisah. Prefix kirinya juga
-- melayani pencarian per barang saja.
CREATE INDEX `stock_movements_item_id_date_idx` ON `stock_movements`(`item_id`, `date`);
