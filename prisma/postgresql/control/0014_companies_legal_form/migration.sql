-- ═══════════════════════════════════════════════════════════════════════════
-- BENTUK USAHA perusahaan (keputusan pemilik 24 Okt 2026): selain PT, produk
-- harus benar untuk PT Perorangan, CV, Firma, dan usaha perorangan (UD).
--
-- ══ KENAPA DI REGISTRY KENDALI, BUKAN DI `company_settings` ════════════════
-- Bentuk usaha dipilih SAAT perusahaan dibuat — sebelum buku-nya punya satu
-- baris `company_settings` pun (baris itu baru lahir di wisaya penyiapan).
-- Ia identitas badan/usaha yang sama tingkatnya dengan `name`/`slug`, terbaca
-- dari konsol operator dan dari pemilih perusahaan, dan wisaya membacanya
-- untuk memilih templat ekuitas. Yang mengikuti BUKU (daftar sekutu, porsi
-- laba, akun modal/prive) tinggal di basis data perusahaan — lihat company
-- 0006_company_partners.
--
-- ══ NILAI ════════════════════════════════════════════════════════════════
--   pt · pt_perorangan · cv · firma · perorangan (usaha perorangan / UD) ·
--   lainnya. Kosakata dijaga CHECK dan `src/lib/legal-form.ts`.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- NOT NULL DEFAULT 'pt': setiap baris lama menjadi PT — persis anggapan kode
-- hari ini (Modal + 3102 Laba Ditahan) — dan kode lama yang tidak menyebut
-- kolom ini menulis 'pt', yang lolos CHECK. CHECK dipasang NOT VALID lalu
-- divalidasi bila bersih (pola company 0003): bawaan menjamin bersih.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "legal_form" VARCHAR(20) NOT NULL DEFAULT 'pt';

ALTER TABLE "companies"
    ADD CONSTRAINT "companies_legal_form_check"
    CHECK ("legal_form" IN ('pt', 'pt_perorangan', 'cv', 'firma', 'perorangan', 'lainnya')) NOT VALID;

DO $$
DECLARE
    liar integer;
BEGIN
    SELECT count(*) INTO liar
      FROM "companies"
     WHERE "legal_form" NOT IN ('pt', 'pt_perorangan', 'cv', 'firma', 'perorangan', 'lainnya');

    IF liar = 0 THEN
        ALTER TABLE "companies" VALIDATE CONSTRAINT "companies_legal_form_check";
    ELSE
        RAISE WARNING 'companies_legal_form_check dibiarkan NOT VALID: % baris di luar kosakata.', liar;
    END IF;
END $$;
