-- ═══════════════════════════════════════════════════════════════════════════
-- VISIBILITAS HARGA PUBLIK (alur demo-first).
--
-- Bisnisnya demo dulu: harga dikutip per pelanggan, jadi operator harus bisa
-- menyembunyikan katalog harga dari situs publik — seksi harga di `/`, tautan
-- "Harga" di bilah atas & kaki, `/pricing` (dialihkan ke halaman kontak),
-- `/sitemap.xml`, dan penawaran JSON-LD. Sakelarnya di konsol `/settings`.
--
-- ══ NULL = TAMPIL ═══════════════════════════════════════════════════════
-- Kebalikan dari gerbang pendaftaran (0017) dan sengaja begitu: yang dijaga
-- di sini adalah perilaku LAMA. Kolom NULL, baris tidak ada, atau platform
-- tak terbaca → harga tetap tampil seperti sebelum kolom ini ada. Tidak ada
-- env pendamping (`publicPricingVisibleFrom`, `site-settings-core.ts`).
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Satu kolom NULLABLE tanpa default. Kode lama tidak menyebutnya.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "public_pricing_visible" BOOLEAN;
