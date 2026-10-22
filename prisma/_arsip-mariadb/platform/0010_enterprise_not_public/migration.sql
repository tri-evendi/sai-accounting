-- ─────────────────────────────────────────────────────────────────────────────
-- Enterprise turun dari halaman harga (#408) — migration DATA, bukan skema.
--
-- Sesudah #404 halaman harga memajang EMPAT kartu, dan dua teratas (Business
-- 8 PT/40 pengguna berharga, Enterprise rundingan) bersaing untuk pembeli yang
-- sama. Keputusan pemilik: funel publik TIGA anak tangga — Starter → Pro →
-- Business — dan rundingan hanya bagi yang melewati kuota Business, ditawarkan
-- DI DALAM kartu Business ("butuh lebih? hubungi kami"), bukan kartu sendiri.
--
-- Karena itu HANYA `is_public` yang berubah. `is_active` tetap 1 (langganan
-- kontrak yang ada tetap sah; operator tetap memberikannya lewat
-- `changeTenantPlan`) dan `contact_only` tetap 1 (penjaga `plan-change`
-- menolak naik paket swalayan berharga 0). Bukan pensiun — pindah tempat.
-- Pemasangan baru mendapat bendera yang sama dari `scripts/seed-plans.ts`.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE `plans`
SET `is_public`      = 0,
    `is_recommended` = 0,
    `updated_at`     = CURRENT_TIMESTAMP(3)
WHERE `key` = 'enterprise';
