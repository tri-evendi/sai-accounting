-- ═══════════════════════════════════════════════════════════════════════════
-- RETENSI UJI COBA BEKU (alur demo-first, keputusan pemilik 24 Okt 2026).
--
-- Uji coba yang habis beku hanya-baca (`subscriptions.status = 'trial_ended'`,
-- migration 0011). Sesudah N hari beku (bawaan 90) tenantnya BOLEH dihapus
-- lewat mesin penghapusan UU PDP yang sudah ada (anonimisasi + nonaktif, buku
-- tetap utuh sampai `retention_until` UU KUP) — dengan pemberitahuan H-14 dan
-- H-3 berisi tautan ekspor.
--
-- ══ SAKELARNYA BAWAAN MATI ═══════════════════════════════════════════════
-- `trial_auto_deletion` NULL = ikut env `TRIAL_AUTO_DELETION` (hanya `on` yang
-- menyalakan) — tidak diset = MATI. Selama mati, penjadwal hanya MELAPORKAN apa
-- yang akan dihapus; tidak ada surel, tidak ada penghapusan. Penghapusan tidak
-- bisa dibalik, jadi yang menyalakannya harus keputusan yang terlihat di konsol
-- `/settings`, bukan bawaan yang diwarisi (pola gerbang 0017).
--
-- `trial_retention_days` NULL = ikut env `TRIAL_RETENTION_DAYS`, lalu 90.
-- Batasnya (30–3650) ditegakkan kode, bukan CHECK: menambah CHECK ke tabel
-- yang sudah ada adalah penyempitan yang ditolak penjaga expand/contract.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Dua kolom NULLABLE tanpa default. Kode lama tidak menyebutnya.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "trial_auto_deletion" BOOLEAN;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "trial_retention_days" INTEGER;
