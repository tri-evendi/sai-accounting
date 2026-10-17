-- ═══════════════════════════════════════════════════════════════════════════
-- PERISTIWA LANGGANAN — riwayat perubahan yang tidak bisa diisi mundur
-- (docs/KOMERSIALISASI.md §8: churn, konversi per kohort, ekspansi)
--
-- `subscriptions` hanya menyimpan keadaan TERAKHIR. Setiap pertanyaan metrik
-- bisnis yang menyangkut PERUBAHAN membutuhkan tabel ini, dan setiap hari tanpa
-- tabel ini adalah hari yang riwayatnya hilang untuk selamanya.
--
-- Tanpa FK ke `subscriptions`: riwayat harus selamat dari baris yang dicatatnya.
-- CHECK pada `kind`: kosakata yang bergeser diam-diam membuat hitungan churn
-- salah tanpa galat.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "subscription_events" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20),
    "from_plan_id" INTEGER,
    "to_plan_id" INTEGER,
    "from_price" DECIMAL(15,2),
    "to_price" DECIMAL(15,2),
    "currency" VARCHAR(5),
    "actor" VARCHAR(100) NOT NULL,
    "details" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_events_kind_check"
        CHECK ("kind" IN ('created', 'status', 'plan', 'billing_mode', 'period', 'trial_cleared'))
);

CREATE INDEX "subscription_events_subscription_id_idx" ON "subscription_events"("subscription_id");
CREATE INDEX "subscription_events_tenant_id_idx" ON "subscription_events"("tenant_id");
CREATE INDEX "subscription_events_kind_occurred_at_idx" ON "subscription_events"("kind", "occurred_at");
CREATE INDEX "subscription_events_occurred_at_idx" ON "subscription_events"("occurred_at");

-- ── Titik awal yang JUJUR untuk langganan yang sudah ada ────────────────────
-- Satu peristiwa `created` per langganan, pada `created_at`-nya, dengan aktor
-- `backfill`. BUKAN riwayat — riwayatnya memang hilang — melainkan pernyataan
-- "langganan ini ada sejak tanggal ini dengan keadaan SEKARANG sebagai satu-
-- satunya yang diketahui". `details.backfill = true` membuatnya bisa disaring
-- keluar dari hitungan kohort yang menuntut keadaan AWAL yang sebenarnya.
INSERT INTO "subscription_events"
    ("subscription_id", "tenant_id", "kind", "to_status", "to_plan_id", "to_price",
     "currency", "actor", "details", "occurred_at")
SELECT "id", "tenant_id", 'created', "status", "plan_id", "price", "currency", 'backfill',
       '{"backfill":true,"note":"keadaan saat migration 0003, bukan keadaan awal"}',
       "created_at"
FROM "subscriptions";
