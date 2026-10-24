-- ═══════════════════════════════════════════════════════════════════════════
-- PEMILIK / SEKUTU dan porsi labanya (bentuk usaha, keputusan pemilik
-- 24 Okt 2026).
--
-- ══ KENAPA DI BASIS DATA PERUSAHAAN ══════════════════════════════════════
-- Setiap baris MENUNJUK dua akun buku ini (modal & prive) — FK yang tidak bisa
-- menyeberangi basis data — dan dibaca di DALAM transaksi tutup buku yang
-- membagi laba ke akun-akun itu. Porsi laba adalah fakta pembukuan (akta
-- persekutuan), ikut pindah bersama bukunya (ekspor tenant, on-premise), dan
-- dibaca pembaca laporan Go yang hanya menjangkau basis data perusahaan.
--
-- ══ BENTUK ═══════════════════════════════════════════════════════════════
--   • `role`        — 'aktif' | 'komanditer' (CV); NULL untuk firma/pemilik.
--   • `share_bp`    — porsi laba dalam BASIS POIN (10000 = 100%). Bilangan
--                     bulat, bukan desimal: jumlah porsi sekutu aktif harus
--                     TEPAT 10000, dan "tepat" pada pecahan biner adalah
--                     janji yang tidak bisa ditepati. Jumlahnya dijaga kode
--                     (lintas baris — CHECK tidak bisa).
--   • `capital_account_id` / `drawing_account_id` — akun Modal & Prive milik
--                     sekutu ini. RESTRICT: akun yang ditunjuk tidak boleh
--                     hilang di bawahnya.
--   • `is_active`   — sekutu yang keluar dinonaktifkan, tidak dihapus: akun
--                     dan riwayatnya tetap harus terbaca di laporan.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Tabel baru; tidak ada kode lama yang menyebutnya. Buku tanpa baris di sini
-- berperilaku persis seperti sebelumnya (PT: laba ke Laba Ditahan).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "company_partners" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "role" VARCHAR(20),
    "share_bp" INTEGER NOT NULL,
    "capital_account_id" INTEGER NOT NULL,
    "drawing_account_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_partners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_partners_role_check" CHECK ("role" IS NULL OR "role" IN ('aktif', 'komanditer')),
    CONSTRAINT "company_partners_share_bp_check" CHECK ("share_bp" >= 0 AND "share_bp" <= 10000)
);

CREATE UNIQUE INDEX "company_partners_capital_account_id_key" ON "company_partners"("capital_account_id");
CREATE UNIQUE INDEX "company_partners_drawing_account_id_key" ON "company_partners"("drawing_account_id");
CREATE INDEX "company_partners_is_active_idx" ON "company_partners"("is_active");

ALTER TABLE "company_partners" ADD CONSTRAINT "company_partners_capital_account_id_fkey"
    FOREIGN KEY ("capital_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_partners" ADD CONSTRAINT "company_partners_drawing_account_id_fkey"
    FOREIGN KEY ("drawing_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
