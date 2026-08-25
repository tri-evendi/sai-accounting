-- Baris kontrak menunjuk barang dari master (issue #491).
--
-- ══ KENAPA ═════════════════════════════════════════════════════════════════
-- Sejak #493 dua barang boleh bernama sama persis selama kodenya berbeda —
-- `LONG PEPPER` 100006 (±Rp 50.000/kg) dan 100010 (±Rp 13.500/kg) di data
-- pengguna. Teks bebas di `contract_items.item_name` karena itu tidak bisa lagi
-- menyatakan barang MANA yang dimaksud, dan `buildContractOutstanding`
-- menggabungkan nama yang sama menjadi satu baris sisa — sehingga dua barang
-- yang harganya berselisih empat kali lipat berbagi satu pagu kontrak.
--
-- ══ NULLABLE, DAN TIDAK MENEBAK ════════════════════════════════════════════
-- Baris kontrak yang sudah ada hanya punya teks. Migrasi ini menautkan yang
-- namanya cocok PERSIS setelah dinormalkan — dirapatkan spasinya dan
-- dihuruf-kecilkan, aturan yang SAMA dengan `normalizeItemName` di
-- `lib/document-chain.ts` — dan membiarkan sisanya NULL.
--
-- Yang TIDAK ditautkan disengaja: nama yang cocok ke LEBIH DARI SATU barang
-- (justru kasus `LONG PEPPER`) tidak punya jawaban yang benar, dan menebak
-- salah satunya berarti mengubah arti sebuah kontrak yang sudah
-- ditandatangani. NULL berarti "belum diketahui", dan perhitungan sisa jatuh
-- kembali ke pencocokan nama — persis seperti sebelum migrasi ini.
ALTER TABLE `contract_items` ADD COLUMN `item_id` INT NULL AFTER `contract_id`;

CREATE INDEX `contract_items_item_id_idx` ON `contract_items`(`item_id`);

ALTER TABLE `contract_items`
  ADD CONSTRAINT `contract_items_item_id_fkey`
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tautkan HANYA yang namanya cocok ke TEPAT SATU barang. Sub-kueri berpagar
-- `COUNT(*) = 1`: nama yang menunjuk dua barang dibiarkan NULL, bukan ditebak.
UPDATE `contract_items` ci
SET `item_id` = (
  SELECT i.`id` FROM `items` i
  WHERE LOWER(TRIM(REGEXP_REPLACE(i.`name`, '[[:space:]]+', ' ')))
      = LOWER(TRIM(REGEXP_REPLACE(ci.`item_name`, '[[:space:]]+', ' ')))
  LIMIT 1
)
WHERE ci.`item_id` IS NULL
  AND (
    SELECT COUNT(*) FROM `items` i2
    WHERE LOWER(TRIM(REGEXP_REPLACE(i2.`name`, '[[:space:]]+', ' ')))
        = LOWER(TRIM(REGEXP_REPLACE(ci.`item_name`, '[[:space:]]+', ' ')))
  ) = 1;
