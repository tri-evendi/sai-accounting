-- ═══════════════════════════════════════════════════════════════════════════
-- Outbox transaksional (09 §4, keputusan pemilik 23 Okt 2026).
--
-- ══ KENAPA ADA ═══════════════════════════════════════════════════════════
-- `jobs` hidup di basis data KENDALI, tulisan domain di basis data PT. Tanpa
-- outbox, "faktur diposting" dan "pekerjaan diterbitkan" adalah dua commit di
-- dua basis data: yang pertama bisa berhasil dan yang kedua hilang, dan tidak
-- ada putaran berikutnya yang akan menyadarinya. Baris di tabel ini ditulis
-- dalam TRANSAKSI YANG SAMA dengan jurnalnya (`src/lib/outbox.ts`), lalu relay
-- (peran `outbox` di `svc-worker`) memindahkannya ke `jobs`.
--
-- ══ BENTUK ═══════════════════════════════════════════════════════════════
--   • `event_type`     — kosakata dari `contract/kinds.yaml` → `outbox.events`
--                        (z.enum di pintu tulisnya). TANPA CHECK, alasan yang
--                        sama dengan `jobs.kind`: kosakata berubah lewat kontrak.
--   • `dedupe_key`     — UNIK: peristiwa yang sama ditulis dua kali (posting
--                        yang diulang) menabrak constraint, bukan dua baris.
--   • `published_at`   — NULL = belum terbit. Indeks berpredikat di bawah
--                        adalah satu-satunya yang dipindai relay.
--   • `attempts` / `last_error` / `next_attempt_at` — penerbitan yang GAGAL
--                        (kendali tak terjangkau) dicatat dan ditunda, bukan
--                        diulang setiap 2 detik.
--
-- Jam: setiap kolom waktu ditulis Prisma (UTC) atau `now() AT TIME ZONE 'UTC'`
-- (relay) — DATABASE.md §4 "Kolom waktu"; DEFAULT di bawah hanya bentuk
-- Prisma dan tidak dipakai penulis mana pun.
--
-- Plus satu sakelar per PT: `company_settings.invoice_auto_send`, BAWAAN
-- FALSE — pemakai pertama outbox (kirim faktur saat diposting) tidak mengubah
-- perilaku siapa pun sampai PT-nya menyalakannya.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Tabel baru (kode lama tidak menyebutnya) + kolom NOT NULL DEFAULT.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "outbox" (
    "id" SERIAL NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "aggregate_type" VARCHAR(40) NOT NULL,
    "aggregate_id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_dedupe_key_key" ON "outbox"("dedupe_key");
CREATE INDEX "outbox_aggregate_type_aggregate_id_idx" ON "outbox"("aggregate_type", "aggregate_id");
CREATE INDEX "outbox_published_at_idx" ON "outbox"("published_at");

-- Indeks yang MENENTUKAN, ditulis tangan — Prisma tidak bisa menyatakan
-- *partial index*. Relay hanya pernah memindai baris yang belum terbit, dan
-- tanpa predikat ini pemindaiannya melambat seiring baris terbit menumpuk
-- (sampai retensi membuangnya).
CREATE INDEX "outbox_unpublished_idx" ON "outbox"("id") WHERE "published_at" IS NULL;

-- AddColumn: sakelar kirim-otomatis saat posting — BAWAAN MATI.
ALTER TABLE "company_settings" ADD COLUMN "invoice_auto_send" BOOLEAN NOT NULL DEFAULT false;
