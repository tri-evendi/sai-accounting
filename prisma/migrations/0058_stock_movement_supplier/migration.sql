-- Gerakan stok masuk menyebut pemasok pengirimnya.
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- Riwayat Stok tidak bisa menjawab "siapa yang mengirim barang ini". Satu-satunya
-- jejak asal-usul sebuah penerimaan adalah teks bebas di `note`:
--
--     Pembelian PT Anu — TRX-42
--
-- Teks tidak bisa disaring, dijumlahkan, atau ditautkan. Kolom ini memberi jejak
-- itu bentuk, tanpa memindahkan satu pun kewenangan: pembelian tetap dokumen
-- yang melahirkan utangnya (`supplier_transactions`); ini hanya menyebut dari
-- siapa BARANGNYA datang — yang pada penerimaan tanpa pembelian (kiriman contoh,
-- retur masuk dari gudang pemasok) tidak punya dokumen untuk ditanyai.
--
-- ══ BACKFILL LEWAT ID, BUKAN LEWAT NAMA ════════════════════════════════════
-- Berbeda dari migrasi 0052 dan 0057 yang harus mencocokkan NAMA dan karena itu
-- berpagar `COUNT(*) = 1`, di sini tidak ada yang perlu ditebak sama sekali:
-- `note` yang ditulis wisaya pembelian membawa `TRX-<id>` — kunci utama baris
-- `supplier_transactions` yang melahirkannya. Penautannya karena itu EKSAK.
--
-- Yang tetap dibiarkan NULL, dan semuanya keadaan yang SAH:
--   • gerakan KELUAR — tidak ada pengirim;
--   • penyesuaian stok opname dan susut proses — bukan penerimaan dari siapa pun;
--   • penerimaan lama yang `note`-nya tidak berpola `TRX-<id>` (ditulis tangan
--     lewat Tambah Stok, atau berasal dari impor warisan). Menebak pemasoknya
--     dari kata-kata di catatan berarti mengarang asal-usul barang.
ALTER TABLE `stock_movements` ADD COLUMN `supplier_id` INT NULL AFTER `cost_center_id`;

CREATE INDEX `stock_movements_supplier_id_idx` ON `stock_movements`(`supplier_id`);

ALTER TABLE `stock_movements`
  ADD CONSTRAINT `stock_movements_supplier_id_fkey`
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hanya gerakan MASUK, dan hanya yang `note`-nya menyebut satu transaksi
-- pemasok yang benar-benar ada.
--
-- Awalan `TRX-` DIPOTONG sebelum di-CAST: `CAST('TRX-42' AS UNSIGNED)` bernilai
-- 0 di MariaDB, bukan 42 — sehingga versi yang lebih ringkas dari kueri ini akan
-- diam-diam mencoba menautkan segalanya ke `supplier_transactions.id = 0`,
-- tidak menemukan apa pun, dan tampak "berhasil tanpa menautkan apa-apa".
-- `REGEXP` di WHERE memagari bentuknya lebih dulu; `JOIN` menjatuhkan sisa yang
-- id-nya tidak lagi ada.
UPDATE `stock_movements` sm
JOIN `supplier_transactions` st
  ON st.`id` = CAST(SUBSTRING(REGEXP_SUBSTR(sm.`note`, 'TRX-[0-9]+'), 5) AS UNSIGNED)
SET sm.`supplier_id` = st.`supplier_id`
WHERE sm.`supplier_id` IS NULL
  AND sm.`type` = 'in'
  AND sm.`note` REGEXP 'TRX-[0-9]+';
