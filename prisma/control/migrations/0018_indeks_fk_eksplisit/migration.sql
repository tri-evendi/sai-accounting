-- ═══════════════════════════════════════════════════════════════════════════
-- INDEKS FK EKSPLISIT — BASIS DATA KENDALI
-- (audit skema §S1 + §S2 — docs/arsitektur/13-AUDIT-SKEMA.md)
--
-- Alasan lengkapnya ada di `prisma/migrations/0065_indeks_fk_eksplisit`. Ringkas:
-- MySQL membuat indeks FK secara IMPLISIT, PostgreSQL TIDAK. Indeks yang tidak
-- dideklarasikan di skema Prisma akan lenyap saat pindah mesin, tanpa galat.
-- Yang dikerjakan di sini: namanya dijadikan eksplisit (RENAME, nol pemindahan
-- data), dan yang memang belum ada dibuat.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── §S1 · implisit → eksplisit ─────────────────────────────────────────────
ALTER TABLE `api_tokens` RENAME INDEX `api_tokens_created_by_user_id_fkey` TO `api_tokens_created_by_user_id_idx`;

-- ── §S2 · tanpa FK (id pengguna bersifat global — docs/MULTI-COMPANY.md) ──
-- Ketiadaan FK-nya BENAR dan tidak boleh "diperbaiki": itu aturan isolasi
-- multi-PT. Yang tidak benar adalah ketiadaan indeksnya.
CREATE INDEX `invitations_invited_by_user_id_idx`               ON `invitations` (`invited_by_user_id`);
CREATE INDEX `tenant_deletion_requests_requested_by_user_id_idx` ON `tenant_deletion_requests` (`requested_by_user_id`);
CREATE INDEX `tenant_audit_logs_user_id_idx`                    ON `tenant_audit_logs` (`user_id`);
