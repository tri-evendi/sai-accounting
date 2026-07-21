-- Approval transaksi berbasis ambang nilai & peran (issue #25).
--
-- Dua tabel baru: `approval_rules` (jenis dokumen + ambang nilai + peran
-- penyetuju) dan `approval_requests` (satu pengajuan per dokumen — sekaligus
-- jejak persetujuan dan notifikasi in-app pemohon).
--
-- ══ APA YANG TERJADI PADA DATA LAMA: TIDAK ADA APA-APA ═════════════════════
-- Migration ini HANYA MEMBUAT TABEL. Ia tidak menambah kolom ke tabel dokumen
-- mana pun (contracts, invoices, contract_payments, invoice_payments,
-- supplier_transactions TIDAK disentuh), tidak mengubah satu baris pun, dan
-- tidak menyentuh accounts/journals/journal_lines/account_mappings.
--
-- Konsekuensinya, untuk SETIAP dokumen yang sudah ada saat migration ini
-- dijalankan:
--   • tidak ada baris `approval_requests` yang dibuat untuknya (tak ada backfill);
--   • gerbang posting membaca "tidak ada pengajuan" = TIDAK diblokir
--     (`blocksPosting(null) === false`, src/lib/approvals.ts), sehingga dokumen
--     yang SUDAH diposting tetap terposting dan tidak ada jurnal yang dibalik;
--   • dokumen lama TIDAK muncul di antrean "Perlu Persetujuan" — antrean hanya
--     berisi baris `approval_requests` berstatus `pending_approval`, dan tidak
--     ada satu pun yang dibuat oleh migration ini;
--   • mengedit dokumen lama tetap bisa (repost tak terblokir, karena tak ada
--     pengajuan yang menggantung).
-- Approval baru berlaku untuk dokumen yang DIBUAT SETELAH seorang Manager
-- membuat aturan di /approvals/rules. Tabel `approval_rules` sengaja dibiarkan
-- KOSONG oleh migration ini: memasang ambang bawaan berarti menebak kebijakan
-- perusahaan, dan seketika membuat operasi harian butuh tanda tangan.
--
-- ── AMBANG DIBANDINGKAN TERHADAP IDR BASE ─────────────────────────────────
-- `approval_requests.base_amount` (IDR) yang diadu dengan `approval_rules.
-- min_amount`, bukan nilai mata uang asli — USD 40.000 pada kurs 16.250 adalah
-- IDR 650.000.000. Karena itu setiap pengajuan menyimpan tiga hal sesuai
-- docs/DATABASE.md §4: `amount` + `currency` + `rate` + `base_amount`.
-- Perbandingannya decimal-exact di layer aplikasi (digit integer yang
-- diselaraskan, bukan float).
--
-- ── FK: RESTRICT ke aturan & users, TANPA FK ke dokumen ───────────────────
-- `rule_id` dan `requested_by_id`/`decided_by_id` = ON DELETE RESTRICT (pola
-- 0019/0021: kolom Int + FK di migration, tanpa relasi Prisma). `document_id`
-- sengaja TANPA FK — satu kolom tak bisa menunjuk lima tabel dokumen berbeda;
-- pasangan (`source_type`, `document_id`) dijaga UNIQUE dan diisi hanya oleh
-- route penulis dokumen di dalam transaksi yang sama.
--
-- Gaya DDL mengikuti 0021/0022 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- CreateTable: approval_rules (jenis dokumen + ambang + peran penyetuju)
CREATE TABLE `approval_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- enum-like: contract | invoice | payment
    `document_type` VARCHAR(30) NOT NULL,
    -- Ambang nilai IDR base, INKLUSIF (nilai = ambang → tetap perlu persetujuan).
    `min_amount` DECIMAL(15, 2) NOT NULL,
    -- enum-like peran penyetuju: bos | core | ptg
    `approver_role` VARCHAR(20) NOT NULL,
    `note` TEXT NULL,
    -- Master data: dinonaktifkan, bukan dihapus (dirujuk approval_requests.rule_id).
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `approval_rules_document_type_idx`(`document_type`),
    INDEX `approval_rules_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: approval_requests (satu pengajuan per dokumen)
CREATE TABLE `approval_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- sourceType posting engine: contract | invoice | contract_payment |
    -- invoice_payment | supplier_transaction. Kunci gerbang jurnal.
    `source_type` VARCHAR(40) NOT NULL,
    `document_id` INTEGER NOT NULL,
    -- Kategori aturan yang cocok: contract | invoice | payment.
    `document_type` VARCHAR(30) NOT NULL,
    `document_no` VARCHAR(50) NULL,
    `rule_id` INTEGER NULL,
    `approver_role` VARCHAR(20) NOT NULL,
    -- enum-like: draft | pending_approval | approved | rejected
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending_approval',
    -- Valas: amount + currency + rate + base_amount (docs/DATABASE.md §4).
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'IDR',
    `rate` DECIMAL(18, 6) NULL,
    -- Nilai IDR base — INI yang diadu dengan ambang.
    `base_amount` DECIMAL(15, 2) NOT NULL,
    -- Ambang yang berlaku saat pengajuan dibuat (snapshot).
    `threshold_amount` DECIMAL(15, 2) NOT NULL,
    `requested_by_id` INTEGER NOT NULL,
    `request_note` TEXT NULL,
    `decided_by_id` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `decision_note` TEXT NULL,
    -- Notifikasi in-app: sudah diputus + read_at NULL = belum dibaca pemohon.
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Satu pengajuan per dokumen — juga kunci lookup gerbang posting.
    UNIQUE INDEX `approval_requests_source_type_document_id_key`(`source_type`, `document_id`),
    INDEX `approval_requests_status_idx`(`status`),
    INDEX `approval_requests_approver_role_idx`(`approver_role`),
    INDEX `approval_requests_requested_by_id_idx`(`requested_by_id`),
    INDEX `approval_requests_document_type_idx`(`document_type`),
    INDEX `approval_requests_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: approval_request → approval_rule / users (RESTRICT)
ALTER TABLE `approval_requests` ADD CONSTRAINT `approval_requests_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `approval_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `approval_requests` ADD CONSTRAINT `approval_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `approval_requests` ADD CONSTRAINT `approval_requests_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
