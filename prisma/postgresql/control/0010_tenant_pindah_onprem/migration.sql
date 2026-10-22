-- ═══════════════════════════════════════════════════════════════════════════
-- Pindah SaaS → on-premise: `tenants.frozen_at` + `tenants.migrated_out_at`.
-- Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md.
--
-- ══ KENAPA PEMBEKUAN PUNYA KOLOM SENDIRI ════════════════════════════════
-- `tenants.status` adalah SALINAN status langganan di `sai_platform`; ia
-- ditulis ulang oleh penjadwal, webhook pembayaran, dan konsol. Pembekuan yang
-- disimpan sebagai nilai `status` bisa dicairkan diam-diam oleh satu putaran
-- penjadwal di tengah ekspor, dan tulisan yang lolos SESUDAH dump diambil
-- adalah tulisan yang hilang dari buku on-premise. Kolom ini tidak disentuh
-- mesin penagihan mana pun.
--
-- ══ `migrated_out` ADALAH NILAI `status`, BUKAN KOLOM ═══════════════════
-- `status` VARCHAR tanpa CHECK (kosakatanya `TENANT_STATUSES` di
-- packages/core/src/constants.ts), jadi nilai barunya tidak butuh DDL.
-- `migrated_out_at` mencatat KAPAN, supaya jejaknya terbaca tanpa menggali
-- `tenant_audit_logs`.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Dua kolom NULLABLE tanpa default. Kode lama tidak menyebutnya; NULL = tidak
-- dibekukan, tidak pindah — persis perilaku hari ini.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenants" ADD COLUMN "frozen_at" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "migrated_out_at" TIMESTAMP(3);
