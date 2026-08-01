-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant tahap 1 (issue #134) — langkah 4 dari 4: NOT NULL + unik.
--
-- ⚠️  JANGAN diterapkan sebelum BUKTINYA lulus. Urutannya (docs/MULTI-TENANT.md
-- §8, dan tidak boleh ditukar):
--   1. migration 0002 (kolom nullable)
--   2. npx tsx scripts/adopt-tenant.ts --slug <tenant> --emails <peta.json>
--   3. npx tsx scripts/prove-tenant-adoption.ts   ← WAJIB exit 0 lebih dulu
--   4. migration INI
--
-- Pada pemasangan yang SUDAH BERISI pengguna tanpa email / perusahaan tanpa
-- tenant, migration ini SENGAJA GAGAL BERISIK ("Invalid use of NULL value"):
-- `migrate deploy` berhenti di sini, basis data tetap di keadaan 0002, dan
-- jalan keluarnya adalah menjalankan langkah 2–3, MENANDAI kegagalan ini
-- sebagai batal (Prisma menolak melanjutkan sebelum itu — dibuktikan di gladi
-- resik):
--
--   npx prisma migrate resolve --rolled-back 0003_tenants_not_null \
--     --config prisma.control.config.ts
--
-- lalu mengulang `npm run db:migrate:control`. Itu bukan kecelakaan melainkan
-- pagarnya — persis pola #104: registry kosong menghentikan deploy dengan
-- menyebut perintah yang harus dijalankan lebih dulu.
--
-- Pada pemasangan BARU (basis data kendali kosong) migration ini lolos tanpa
-- syarat, dan sejak itu setiap pengguna/perusahaan lahir wajib ber-tenant dan
-- ber-email — tidak pernah ada cabang "tanpa tenant" yang harus dijaga.
-- ─────────────────────────────────────────────────────────────────────────────

-- Kunci kepemilikan: setiap perusahaan milik TEPAT SATU tenant …
ALTER TABLE `companies` MODIFY `tenant_id` INTEGER NOT NULL;

-- … dan setiap pengguna juga. Email menjadi wajib — ia pengenal login (#136).
ALTER TABLE `users` MODIFY `tenant_id` INTEGER NOT NULL,
    MODIFY `email` VARCHAR(255) NOT NULL;

-- Keunikan email dikunci SETELAH pembuktian menjamin tidak ada yang kembar —
-- menguncinya lebih awal hanya mengubah galat yang bisa dijelaskan skrip
-- pembuktian menjadi galat migration yang tidak menyebut baris mana yang salah.
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
