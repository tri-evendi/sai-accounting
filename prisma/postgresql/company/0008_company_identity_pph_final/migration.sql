-- ═══════════════════════════════════════════════════════════════════════════
-- Identitas legal perusahaan + sakelar PPh Final UMKM (bentuk usaha, PR B,
-- 24 Okt 2026). Semuanya di `company_settings`, bersebelahan dengan NPWP/PKP:
-- profil perusahaan yang dibaca buku ini sendiri.
--
--   • `nib`                     — Nomor Induk Berusaha (OSS), opsional.
--   • `deed_number`             — nomor akta pendirian / pernyataan pendirian
--                                 (PT Perorangan memakai pernyataan pendirian).
--   • `ministry_decree_number`  — nomor SK/pengesahan Kemenkumham, opsional.
--   • `established_on`          — tanggal pendirian (tanggal saja).
--   • `pph_final_umkm`          — memakai PPh Final 0,5% (PP 55/2022). Bawaan
--                                 FALSE: alat bantu laporan, bukan posting, dan
--                                 tidak menyala untuk siapa pun tanpa diminta.
--   • `pph_final_umkm_start_year` — tahun pajak pertama memakai tarif itu;
--                                 dasar pengingat batas waktunya.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Kolom nullable + satu kolom NOT NULL DEFAULT false. Kode lama tidak
-- menyebut satu pun.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "nib" VARCHAR(20);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "deed_number" VARCHAR(100);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "ministry_decree_number" VARCHAR(100);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "established_on" DATE;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "pph_final_umkm" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "pph_final_umkm_start_year" INTEGER;
