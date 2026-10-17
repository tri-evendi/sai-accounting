-- ═══════════════════════════════════════════════════════════════════════════
-- JEJAK TENANT LINTAS TENANT — index untuk "terbaru dulu, semua tenant"
--
-- Sampai sekarang jejak tenant hanya dibaca per tenant (`[tenant_slug,
-- created_at]`, #484) — dan sebenarnya tidak dibaca sama sekali: pembacanya
-- hanya dipanggil tes. Halaman `/operator/audit/tenants` membacanya LINTAS
-- tenant, terurut waktu; tanpa index ini setiap pembukaan halaman memindai dan
-- mengurutkan seluruh tabel.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX "tenant_audit_logs_created_at_idx" ON "tenant_audit_logs"("created_at");
CREATE INDEX "tenant_audit_logs_action_idx" ON "tenant_audit_logs"("action");
