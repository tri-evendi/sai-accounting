-- Kontrak menunjuk pembeli dari master Pelanggan.
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- `contracts.buyer` adalah teks bebas yang diketik tangan, sementara
-- `invoices.customer_id` adalah FK sungguhan. Keduanya tidak pernah bertemu:
-- tidak ada satu pun pemeriksaan bahwa faktur yang DITARIK dari sebuah kontrak
-- ditagihkan kepada pihak yang sama dengan pembeli di kontrak itu. Akibatnya
-- kontrak atas nama PT A bisa difakturkan ke PT B — sisa kontrak PT A berkurang,
-- piutang tercatat atas PT B, tanpa galat dan tanpa jejak.
--
-- Kolom ini adalah kaki yang hilang. Begitu ada, `createInvoiceInTx` punya
-- sesuatu untuk dibandingkan (lihat `assertInvoiceMatchesContractBuyer`).
--
-- ══ NULLABLE, DAN TIDAK MENEBAK ════════════════════════════════════════════
-- Setiap kontrak yang sudah ada masuk ke migrasi ini dengan `customer_id` NULL,
-- dan sebagian akan KELUAR tetap NULL. Itu disengaja, bukan pekerjaan yang
-- belum selesai:
--
--   • Teks `buyer` TIDAK PERNAH disentuh. Ia tetap tercetak di kontrak dan tetap
--     menjadi satu-satunya identitas pembeli pada baris yang tidak tertaut,
--     persis seperti `consignee` terhadap `consignee_id` sejak #22.
--   • Penautan hanya dilakukan bila nama pembeli cocok ke TEPAT SATU pelanggan
--     setelah dinormalkan — dirapatkan spasinya dan dihuruf-kecilkan, aturan
--     yang sama dengan migrasi 0052. Nama yang cocok ke dua baris master tidak
--     punya jawaban yang benar; menebak salah satunya berarti memindahkan lawan
--     transaksi sebuah kontrak yang sudah ditandatangani.
--   • Baris yang keluar NULL TIDAK menjadi lebih ketat dari sebelumnya.
--     Penjaganya membaca kolom ini: NULL berarti tidak ada yang bisa
--     dibandingkan, jadi faktur atas kontrak lama tetap lewat seperti kemarin.
--     Tidak ada dokumen lama yang tiba-tiba ditolak.
--
-- Sisa yang NULL diselesaikan MANUSIA, satu per satu, lewat pemilih pelanggan di
-- halaman sunting kontrak — bukan oleh migrasi ini.
ALTER TABLE `contracts` ADD COLUMN `customer_id` INT NULL AFTER `buyer`;

CREATE INDEX `contracts_customer_id_idx` ON `contracts`(`customer_id`);

ALTER TABLE `contracts`
  ADD CONSTRAINT `contracts_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tautkan HANYA yang namanya cocok ke TEPAT SATU pelanggan. Sub-kueri berpagar
-- `COUNT(*) = 1`, sama dengan 0052. Pelanggan NONAKTIF ikut dicocokkan: kontrak
-- lama yang menyebutnya tetap menunjuk pihak yang benar, dan menonaktifkan
-- pelanggan memang tidak pernah berarti menghapus riwayatnya.
UPDATE `contracts` c
SET `customer_id` = (
  SELECT cu.`id` FROM `customers` cu
  WHERE LOWER(TRIM(REGEXP_REPLACE(cu.`name`, '[[:space:]]+', ' ')))
      = LOWER(TRIM(REGEXP_REPLACE(c.`buyer`, '[[:space:]]+', ' ')))
  LIMIT 1
)
WHERE c.`customer_id` IS NULL
  AND (
    SELECT COUNT(*) FROM `customers` cu2
    WHERE LOWER(TRIM(REGEXP_REPLACE(cu2.`name`, '[[:space:]]+', ' ')))
        = LOWER(TRIM(REGEXP_REPLACE(c.`buyer`, '[[:space:]]+', ' ')))
  ) = 1;
