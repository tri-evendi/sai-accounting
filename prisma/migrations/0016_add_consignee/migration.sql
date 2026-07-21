-- Master Consignee — penerima barang ekspor (issue #22).
--
-- Sebelumnya consignee hanya teks bebas di `contracts.consignee`. Migrasi ini
-- mempromosikannya menjadi master data (`consignees`, dari legacy `tb_consignee`)
-- agar bisa dipilih ulang di Kontrak dan nanti Surat Jalan (issue #14).
--
-- ── FALLBACK TEKS LAMA (tanpa kehilangan data) ──────────────────────────────
-- Kolom teks `contracts.consignee` DIPERTAHANKAN. Setiap nilai teks non-kosong
-- yang berbeda menjadi satu baris `consignees`, lalu tiap kontrak ditautkan via
-- `consignee_id`. Kontrak yang teksnya cocok → punya `consignee_id`; yang tidak
-- (atau kosong) → `consignee_id` NULL dan tetap menyimpan teks lamanya. Jadi tak
-- ada informasi consignee legacy yang hilang.
--
-- ── HAPUS = NONAKTIF ────────────────────────────────────────────────────────
-- Master data punya `is_active`; consignee yang direferensikan kontrak
-- dinonaktifkan, bukan dihapus — FK di bawah RESTRICT untuk menegakkannya.
--
-- Gaya DDL mengikuti 0001/0014 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: master consignee.
CREATE TABLE `consignees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `address` TEXT NULL,
    -- Negara tujuan/penerima (ekspor) — teks bebas, bukan kode ISO.
    `country` VARCHAR(60) NULL,
    -- Kontak / PIC — teks bebas (nama, telepon, atau email); setara `pic` legacy.
    `contact` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    -- Master data dinonaktifkan (bukan dihapus) saat sudah direferensikan.
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `consignees_is_active_idx`(`is_active`),
    INDEX `consignees_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: FK nullable ke master; teks lama tetap ada sebagai fallback.
ALTER TABLE `contracts` ADD COLUMN `consignee_id` INTEGER NULL;

CREATE INDEX `contracts_consignee_id_idx` ON `contracts`(`consignee_id`);

ALTER TABLE `contracts`
    ADD CONSTRAINT `contracts_consignee_id_fkey`
    FOREIGN KEY (`consignee_id`) REFERENCES `consignees`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Backfill data ────────────────────────────────────────────────────────────
-- 1) Satu baris master per teks consignee non-kosong yang berbeda. Kolasi
--    utf8mb4_unicode_ci membuat perbandingan case-insensitive, sehingga varian
--    huruf besar/kecil dari perusahaan yang sama tergabung menjadi satu baris.
INSERT INTO `consignees` (`name`, `is_active`, `created_at`, `updated_at`)
SELECT DISTINCT TRIM(`consignee`), true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `contracts`
WHERE `consignee` IS NOT NULL AND TRIM(`consignee`) <> '';

-- 2) Tautkan tiap kontrak ke baris master yang dibuat dari teksnya sendiri.
--    Kontrak yang tak cocok / kosong tetap `consignee_id` NULL + teks lamanya.
UPDATE `contracts` `c`
JOIN `consignees` `co` ON `co`.`name` = TRIM(`c`.`consignee`)
SET `c`.`consignee_id` = `co`.`id`
WHERE `c`.`consignee` IS NOT NULL AND TRIM(`c`.`consignee`) <> '';
