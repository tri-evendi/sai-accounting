-- ═══════════════════════════════════════════════════════════════════════════
-- ANTREAN PEKERJAAN (rancangan §4) — tabel `jobs`
--
-- Kenapa di kendali dan kenapa Postgres alih-alih broker: komentar model `Job`
-- di packages/db/prisma/control/schema.prisma.
--
-- ══ YANG TIDAK BISA DINYATAKAN PRISMA, DAN KARENA ITU DITULIS DI SINI ══════
-- Tiga indeks di bawah berpredikat (*partial*), dan ketiganya menentukan
-- apakah tabel ini masih sehat setelah sejuta baris:
--
--   • pengambilan hanya pernah melihat baris `queued`. Tanpa predikatnya,
--     indeksnya tumbuh seiring SELURUH riwayat dan pengambilan melambat
--     berbanding jumlah pekerjaan yang pernah ada — bukan yang menunggu;
--   • reclaim hanya pernah melihat baris `claimed`;
--   • pengarsipan hanya pernah melihat baris yang sudah selesai.
--
-- Urutan `priority DESC, run_after ASC` ditulis DI INDEKS supaya `ORDER BY`
-- pada klaim tidak menuntut sort — itulah yang membuat klaim satu pernyataan
-- tetap murah di bawah beban.
--
-- ══ AUTOVACUUM LEBIH AGRESIF, PADA TABEL INI SAJA ══════════════════════════
-- Antrean ber-`SKIP LOCKED` membuat baris mati jauh lebih cepat daripada tabel
-- lain: setiap klaim, setiap pembaruan lease, dan setiap penyelesaian adalah
-- satu versi baris baru. Setelan bawaan Postgres (20% tabel) berarti tabel
-- sejuta baris menunggu 200 ribu baris mati sebelum dibersihkan — dan indeks
-- yang membengkak di antaranya membuat pengambilan melambat tanpa satu pun
-- kueri berubah. Setelan di sini TIDAK menyentuh tabel lain di basis data ini.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "tenant_id" INTEGER,
    "company_id" INTEGER,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'queued',
    "dedupe_key" VARCHAR(200),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "claimed_by" VARCHAR(100),
    "last_error" TEXT,
    "result_ref" VARCHAR(500),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),

    -- Status di luar kosakata adalah bentuk data paling berbahaya di tabel ini:
    -- baris ber-status asing tidak pernah diambil pekerja mana pun DAN tidak
    -- pernah diarsipkan, jadi ia menumpuk tanpa pengklaim dan tanpa galat.
    CONSTRAINT "jobs_status_check"
        CHECK ("status" IN ('queued', 'claimed', 'done', 'failed', 'dead')),

    CONSTRAINT "jobs_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "jobs_max_attempts_check" CHECK ("max_attempts" >= 1),
    CONSTRAINT "jobs_progress_check" CHECK ("progress" BETWEEN 0 AND 100)
);

-- Penerbitan dua kali menabrak constraint INI, bukan menghasilkan dua
-- pekerjaan. NULL diizinkan berulang — itu yang membuat "pengguna menekan
-- ekspor dua kali" tetap dua pekerjaan.
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- PENGAMBILAN. Predikat + urutan, persis seperti klausa klaim.
CREATE INDEX "jobs_ambil_idx"
    ON "jobs" ("priority" DESC, "run_after" ASC)
    WHERE "status" = 'queued';

-- RECLAIM: baris yang lease-nya tidak diperbarui lagi.
CREATE INDEX "jobs_reclaim_idx"
    ON "jobs" ("claimed_at" ASC)
    WHERE "status" = 'claimed';

-- PENGARSIPAN: hanya yang sudah selesai.
CREATE INDEX "jobs_arsip_idx"
    ON "jobs" ("finished_at" ASC)
    WHERE "status" IN ('done', 'dead');

-- Bacaan kemajuan dari layar: "pekerjaan saya di perusahaan ini".
CREATE INDEX "jobs_tenant_id_company_id_status_idx"
    ON "jobs"("tenant_id", "company_id", "status");

CREATE INDEX "jobs_status_kind_idx" ON "jobs"("status", "kind");

ALTER TABLE "jobs" SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_cost_delay = 0
);
