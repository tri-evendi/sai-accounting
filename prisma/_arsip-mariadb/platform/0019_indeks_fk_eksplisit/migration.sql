-- ═══════════════════════════════════════════════════════════════════════════
-- INDEKS FK EKSPLISIT — BASIS DATA PLATFORM
-- (audit skema §S1 — docs/arsitektur/13-AUDIT-SKEMA.md)
--
-- Alasan lengkapnya di `prisma/migrations/0065_indeks_fk_eksplisit`.
-- Hanya RENAME: ketiga indeks sudah ada, hanya namanya yang implisit.
-- `platform_invoices.target_plan_id` TIDAK ikut — indeksnya sudah bernama
-- `_idx` sejak migration yang membuatnya, jadi tidak ada yang perlu diubah.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE `subscriptions`     RENAME INDEX `subscriptions_plan_id_fkey`            TO `subscriptions_plan_id_idx`;
ALTER TABLE `platform_invoices` RENAME INDEX `platform_invoices_subscription_id_fkey` TO `platform_invoices_subscription_id_idx`;
ALTER TABLE `payments`          RENAME INDEX `payments_platform_invoice_id_fkey`      TO `payments_platform_invoice_id_idx`;
