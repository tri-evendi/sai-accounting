-- ═══════════════════════════════════════════════════════════════════════════
-- INDEKS FK EKSPLISIT (audit skema §S1 + §S2 — docs/arsitektur/13-AUDIT-SKEMA.md)
--
-- ══ KENAPA MIGRATION INI ADA, PADAHAL "TIDAK ADA YANG LAMBAT" ══════════════
-- MySQL/MariaDB MEWAJIBKAN indeks pada kolom FOREIGN KEY dan MEMBUATNYA SENDIRI
-- bila tidak dideklarasikan — namanya berakhiran `_fkey`. PostgreSQL TIDAK: di
-- sana sebuah FOREIGN KEY tidak membawa indeks sama sekali.
--
-- Diukur di produksi: 14 kolom FK per buku PT (+1 kendali, +3 platform) yang
-- indeksnya HANYA yang implisit itu. Di 17 buku = 242 indeks yang tidak akan
-- dibuat PostgreSQL — dan satu-satunya gejalanya adalah kueri yang perlahan
-- melambat, tanpa satu pun galat.
--
-- Dikerjakan SEKARANG, bukan saat pindah mesin, justru supaya ia teruji oleh
-- produksi yang berjalan lebih dulu.
--
-- ══ RENAME, BUKAN CREATE — DAN ITU PENTING ════════════════════════════════
-- Indeksnya SUDAH ADA di MariaDB. `CREATE INDEX` akan menghasilkan indeks KEDUA
-- pada kolom yang sama: dua kali biaya tulis, nol manfaat baca. Jadi yang
-- dikerjakan adalah MENGGANTI NAMANYA ke nama yang Prisma harapkan
-- (`<tabel>_<kolom>_idx`) — nol pemindahan data, dan sesudahnya skema Prisma
-- menjadi sumber kebenaran yang jujur soal indeks apa yang ada.
--
-- §S2 di bawah berbeda: kolom itu BUKAN FK (id pengguna bersifat global, dan
-- basis data perusahaan tidak boleh ber-FK ke `users` — docs/MULTI-COMPANY.md),
-- jadi tidak ada indeks implisit untuk diganti nama. Di sana `CREATE` benar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── §S1 · indeks implisit → eksplisit ──────────────────────────────────────
ALTER TABLE `approval_requests`     RENAME INDEX `approval_requests_rule_id_fkey`              TO `approval_requests_rule_id_idx`;
ALTER TABLE `contract_items`        RENAME INDEX `contract_items_contract_id_fkey`             TO `contract_items_contract_id_idx`;
ALTER TABLE `contract_payments`     RENAME INDEX `contract_payments_contract_id_fkey`          TO `contract_payments_contract_id_idx`;
ALTER TABLE `documents`             RENAME INDEX `documents_contract_id_fkey`                  TO `documents_contract_id_idx`;
ALTER TABLE `fixed_assets`          RENAME INDEX `fixed_assets_asset_account_id_fkey`          TO `fixed_assets_asset_account_id_idx`;
ALTER TABLE `fixed_assets`          RENAME INDEX `fixed_assets_accumulated_account_id_fkey`    TO `fixed_assets_accumulated_account_id_idx`;
ALTER TABLE `fixed_assets`          RENAME INDEX `fixed_assets_expense_account_id_fkey`        TO `fixed_assets_expense_account_id_idx`;
ALTER TABLE `fixed_asset_categories` RENAME INDEX `fixed_asset_categories_asset_account_id_fkey`       TO `fixed_asset_categories_asset_account_id_idx`;
ALTER TABLE `fixed_asset_categories` RENAME INDEX `fixed_asset_categories_accumulated_account_id_fkey` TO `fixed_asset_categories_accumulated_account_id_idx`;
ALTER TABLE `fixed_asset_categories` RENAME INDEX `fixed_asset_categories_expense_account_id_fkey`     TO `fixed_asset_categories_expense_account_id_idx`;
ALTER TABLE `invoice_items`         RENAME INDEX `invoice_items_invoice_id_fkey`               TO `invoice_items_invoice_id_idx`;
ALTER TABLE `invoice_payments`      RENAME INDEX `invoice_payments_invoice_id_fkey`            TO `invoice_payments_invoice_id_idx`;
ALTER TABLE `journals`              RENAME INDEX `journals_reversal_of_id_fkey`                TO `journals_reversal_of_id_idx`;
ALTER TABLE `production_orders`     RENAME INDEX `production_orders_cost_center_id_fkey`       TO `production_orders_cost_center_id_idx`;

-- `approval_requests.decided_by_id` adalah kasus yang paling layak dicatat:
-- indeksnya bernama `_fkey` tetapi **tidak ada FK sama sekali** di kolom itu
-- (diperiksa: satu-satunya FK di tabel ini `rule_id` → `approval_rules`). Jadi
-- ia SISA dari constraint yang pernah dicabut — kemungkinan saat aturan
-- multi-PT melarang FK ke `users` — dan namanya sejak itu membohongi
-- pembacanya. Indeksnya sendiri berguna (halaman persetujuan menyaring per
-- pemutus), jadi yang diperbaiki namanya, bukan keberadaannya.
ALTER TABLE `approval_requests`     RENAME INDEX `approval_requests_decided_by_id_fkey`         TO `approval_requests_decided_by_id_idx`;

-- ── §S2 · kolom tanpa FK dan tanpa indeks apa pun ──────────────────────────
-- `audit_logs.user_id` yang paling terasa: halaman audit menyaring per pengguna,
-- dan tabel itu tumbuh selamanya tanpa pernah dipangkas.
CREATE INDEX `audit_logs_user_id_idx`              ON `audit_logs` (`user_id`);
CREATE INDEX `invoice_sends_sent_by_user_id_idx`   ON `invoice_sends` (`sent_by_user_id`);
CREATE INDEX `year_closes_closed_by_id_idx`        ON `year_closes` (`closed_by_id`);
CREATE INDEX `year_closes_reversed_by_id_idx`      ON `year_closes` (`reversed_by_id`);
CREATE INDEX `recurring_occurrences_document_id_idx` ON `recurring_occurrences` (`document_id`);
CREATE INDEX `recurring_templates_source_id_idx`   ON `recurring_templates` (`source_id`);
