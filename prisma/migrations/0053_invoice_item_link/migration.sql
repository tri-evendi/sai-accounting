-- Baris faktur menunjuk barang dari master (issue #503).
--
-- ══ KAKI TERAKHIR RANTAI ═══════════════════════════════════════════════════
-- Surat jalan menyimpan `item_id` sejak #14, kontrak sejak #491. Faktur adalah
-- yang terakhir dijodohkan lewat NAMA — dan ia justru kaki yang menentukan:
-- `remainingKg` dihitung dari yang DIFAKTURKAN, bukan dari yang dikirim.
--
-- ══ NULLABLE, DAN AKAN SERING NULL ═════════════════════════════════════════
-- Berbeda dari 0052, di sini NULL bukan sekadar "belum tertaut" melainkan
-- bentuk yang SAH dan permanen untuk sebagian baris: ongkos kirim dan selisih
-- timbang adalah baris faktur nyata yang tidak punya — dan tidak boleh punya —
-- baris di master barang.
--
-- ══ TIDAK MENEBAK ══════════════════════════════════════════════════════════
-- Sama dengan 0052: hanya baris yang namanya cocok ke TEPAT SATU barang yang
-- ditautkan, berpagar `COUNT(*) = 1`, dengan normalisasi yang sama persis
-- dengan `normalizeItemName` di `lib/document-chain.ts`. Nama yang menunjuk
-- dua barang — justru kasus `LONG PEPPER` yang melahirkan rangkaian ini —
-- dibiarkan NULL, dan `resolveChainKey` menanganinya dengan melaporkannya
-- sebagai tak berjodoh alih-alih membebankannya ke baris yang salah.
ALTER TABLE `invoice_items` ADD COLUMN `item_id` INT NULL AFTER `invoice_id`;

CREATE INDEX `invoice_items_item_id_idx` ON `invoice_items`(`item_id`);

ALTER TABLE `invoice_items`
  ADD CONSTRAINT `invoice_items_item_id_fkey`
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE `invoice_items` ii
SET `item_id` = (
  SELECT i.`id` FROM `items` i
  WHERE LOWER(TRIM(REGEXP_REPLACE(i.`name`, '[[:space:]]+', ' ')))
      = LOWER(TRIM(REGEXP_REPLACE(ii.`item_name`, '[[:space:]]+', ' ')))
  LIMIT 1
)
WHERE ii.`item_id` IS NULL
  AND (
    SELECT COUNT(*) FROM `items` i2
    WHERE LOWER(TRIM(REGEXP_REPLACE(i2.`name`, '[[:space:]]+', ' ')))
        = LOWER(TRIM(REGEXP_REPLACE(ii.`item_name`, '[[:space:]]+', ' ')))
  ) = 1;
