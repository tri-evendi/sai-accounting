-- ─────────────────────────────────────────────────────────────────────────────
-- Tangga harga empat paket (#404): Starter · Pro · Business · Enterprise.
--
-- Ini migration DATA, bukan skema. `starter` dan `business` adalah kunci lama
-- yang dihidupkan kembali dengan angka baru:
--
--   starter   150.000 / 1.500.000  · 1 PT /  5 pengguna  →  Starter  249.000 /  2.490.000 · 1 PT /  3 pengguna
--   business  450.000 / 4.500.000  · 3 PT / 15 pengguna  →  Business 1.199.000 / 11.990.000 · 8 PT / 40 pengguna
--
-- KENAPA DI MIGRATION, BUKAN DI SEED. `scripts/seed-plans.ts` sengaja TIDAK
-- menimpa harga & kuota baris yang sudah ada — seed yang mengubah harga adalah
-- kejutan penagihan setiap kali dijalankan. Perubahan harga adalah keputusan
-- SEKALI JALAN yang harus tercatat, dan itulah bentuk sebuah migration:
-- diterapkan sekali, urutannya jelas, dan `migrate status` bisa menjawab
-- "sudah atau belum".
--
-- KENAPA AMAN. Harga & kuota langganan berjalan adalah SNAPSHOT
-- (`subscriptions.price`, `tenants.max_*`) — baris `plans` hanya berlaku bagi
-- langganan baru & perpindahan paket. Di produksi (2026-08-17) tidak ada satu
-- pun langganan yang menunjuk `starter`/`business`; kalaupun ada, ia tetap
-- membayar & memakai angka lamanya sampai ia sendiri berpindah paket.
--
-- Pemasangan baru yang belum punya kedua baris ini: UPDATE mengenai nol baris,
-- dan `bun run db:seed:plans` membuatnya dengan angka yang sama. Angkanya
-- dengan sengaja DITULIS DUA KALI (di sini dan di seed) — sumber kebenarannya
-- adalah `docs/PRICING.md`, dan `tests/pricing-ladder.test.ts` menjaga
-- keduanya tetap sama.
--
-- `is_recommended` dipaksa 0 pada keduanya: Pro tetap satu-satunya yang
-- disorot. `trial_days` 14 mengikuti seed. `updated_at` ikut bergerak supaya
-- jejak perubahannya terbaca.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE `plans`
SET `name`           = 'Starter',
    `description`    = 'Satu PT, tiga pengguna.',
    `price_monthly`  = 249000.00,
    `price_yearly`   = 2490000.00,
    `max_companies`  = 1,
    `max_users`      = 3,
    `trial_days`     = 14,
    `is_active`      = 1,
    `is_public`      = 1,
    `contact_only`   = 0,
    `is_recommended` = 0,
    `updated_at`     = CURRENT_TIMESTAMP(3)
WHERE `key` = 'starter';

UPDATE `plans`
SET `name`           = 'Business',
    `description`    = 'Sampai delapan PT, empat puluh pengguna.',
    `price_monthly`  = 1199000.00,
    `price_yearly`   = 11990000.00,
    `max_companies`  = 8,
    `max_users`      = 40,
    `trial_days`     = 14,
    `is_active`      = 1,
    `is_public`      = 1,
    `contact_only`   = 0,
    `is_recommended` = 0,
    `updated_at`     = CURRENT_TIMESTAMP(3)
WHERE `key` = 'business';
