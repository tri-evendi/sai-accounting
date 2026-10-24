-- ═══════════════════════════════════════════════════════════════════════════
-- ALUR DEMO-FIRST (keputusan pemilik 24 Okt 2026): uji coba habis = BEKU,
-- permintaan aktivasi, dan aktivasi dari penawaran tanpa tagihan Rp 0.
-- Rancangan: docs/KOMERSIALISASI.md §1.2, §6.4, §11 + K-3.
--
-- ══ 1. `subscriptions.trial_ended_at` ═════════════════════════════════════
-- Status langganan baru `trial_ended` (uji coba habis → hanya-baca, TANPA
-- tagihan) tidak butuh DDL: `status` VARCHAR tanpa CHECK, kosakatanya
-- `SUBSCRIPTION_STATUSES` di packages/billing/src/platform-constants.ts.
-- Yang butuh kolom adalah KAPAN-nya — jangkar retensi uji coba beku. NULL =
-- tidak sedang beku, persis keadaan setiap baris hari ini.
--
-- ══ 2. `activation_requests` ═════════════════════════════════════════════
-- Tombol "Minta aktivasi" di aplikasi customer mencatat satu baris di sini;
-- konsol operator membacanya sebagai daftar kerja. SATU permintaan terbuka per
-- tenant: indeks unik PARSIAL (Prisma tidak bisa memodelkannya, jadi ia hanya
-- hidup di sini) — klik kedua menabrak constraint dan dijawab "sudah tercatat".
--
-- ══ 3. `quote_activations` ═══════════════════════════════════════════════
-- Pengganti tagihan Rp 0 bertanda `-K` pada "Aktifkan dari penawaran":
-- aktivasi penawaran BUKAN kompensasi, dan mencatatnya sebagai `comped`
-- mencampur penjualan dengan hadiah (§6.4). Nomor penawaran = kunci
-- idempotensi (UNIQUE). Tidak dihitung sebagai pendapatan platform — uangnya
-- tercatat di buku PT penyedia.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Satu kolom NULLABLE tanpa default + dua tabel baru. Kode lama tidak
-- menyebut satu pun. Bisa dijalankan ulang (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ended_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "subscriptions_trial_ended_at_idx" ON "subscriptions"("trial_ended_at");

CREATE TABLE IF NOT EXISTS "activation_requests" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "requested_by_user_id" INTEGER NOT NULL,
    "requested_by_name" VARCHAR(191),
    "tenant_status" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "handled_by" VARCHAR(100),
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activation_requests_status_check" CHECK ("status" IN ('open', 'handled')),
    CONSTRAINT "activation_requests_handled_check"
        CHECK (("status" = 'handled') = ("handled_at" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "activation_requests_tenant_id_idx" ON "activation_requests"("tenant_id");
CREATE INDEX IF NOT EXISTS "activation_requests_status_created_at_idx" ON "activation_requests"("status", "created_at");
-- Satu permintaan TERBUKA per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "activation_requests_one_open_per_tenant"
    ON "activation_requests"("tenant_id") WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "quote_activations" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "quote_ref" VARCHAR(60) NOT NULL,
    "transfer_proof" VARCHAR(500) NOT NULL,
    "plan_key" VARCHAR(30) NOT NULL,
    "billing_cycle" VARCHAR(10) NOT NULL,
    "periods" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "actor" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_activations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_activations_billing_cycle_check" CHECK ("billing_cycle" IN ('monthly', 'yearly')),
    CONSTRAINT "quote_activations_periods_check" CHECK ("periods" >= 1),
    CONSTRAINT "quote_activations_period_check" CHECK ("period_end" > "period_start")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quote_activations_quote_ref_key" ON "quote_activations"("quote_ref");
CREATE INDEX IF NOT EXISTS "quote_activations_tenant_id_idx" ON "quote_activations"("tenant_id");
CREATE INDEX IF NOT EXISTS "quote_activations_subscription_id_idx" ON "quote_activations"("subscription_id");
