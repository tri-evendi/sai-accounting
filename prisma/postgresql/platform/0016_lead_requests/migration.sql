-- ═══════════════════════════════════════════════════════════════════════════
-- PERMINTAAN PENAWARAN / DEMO DARI HALAMAN PUBLIK — `lead_requests`.
-- Rancangan: docs/KOMERSIALISASI.md §7 (corong penawaran) + docs/TATA-KELOLA.md
-- §6 (retensi). Kosakata & aturan: packages/core/src/lead-request.ts.
--
-- Sampai migration ini, tombol "Minta penawaran" / "Jadwalkan demo" mendarat
-- di `/register` yang hanya memajang tombol WhatsApp & `mailto:` — tidak ada
-- yang tercatat, jadi prospek yang urung mengirim pesan hilang tanpa jejak.
-- Formulir di halaman itu kini menulis satu baris di sini; konsol operator
-- (`/leads`) membacanya sebagai daftar kerja: baru → dihubungi → selesai/spam.
--
-- ══ DATA PRIBADI (UU PDP) ═════════════════════════════════════════════════
--   • `consent_at` NOT NULL — baris tidak lahir tanpa persetujuan dihubungi.
--   • `ip_hash` = HMAC-SHA256 alamat klien, BUKAN alamatnya: cukup untuk
--     mengenali banjir dari satu sumber, tidak cukup untuk menunjuk orang.
--   • Retensi: `selesai`/`spam` dianonimkan 12 bulan sesudah `handled_at`,
--     `baru`/`dihubungi` 24 bulan sesudah `created_at` (langkah penjadwal
--     "retensi lead"); `anonymized_at` menandai baris yang sudah dikosongkan.
--
-- ══ JAM ═══════════════════════════════════════════════════════════════════
-- Semua kolom waktu ditulis Prisma (jam dinding UTC); DEFAULT CURRENT_TIMESTAMP
-- hanya padanan `@default(now())` (docs/DATABASE.md §4 "Kolom waktu").
--
-- ══ EXPAND SAJA ═══════════════════════════════════════════════════════════
-- Satu tabel baru; kode lama tidak menyebutnya. Bisa dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "lead_requests" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "company" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(191),
    "legal_form" VARCHAR(20),
    "company_count" INTEGER,
    "message" TEXT,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "locale" VARCHAR(5),
    "status" VARCHAR(20) NOT NULL DEFAULT 'baru',
    "handled_by" VARCHAR(100),
    "handled_at" TIMESTAMP(3),
    "notes" TEXT,
    "ip_hash" CHAR(64),
    "anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lead_requests_kind_check" CHECK ("kind" IN ('demo', 'quote', 'question')),
    CONSTRAINT "lead_requests_status_check" CHECK ("status" IN ('baru', 'dihubungi', 'selesai', 'spam')),
    CONSTRAINT "lead_requests_legal_form_check"
        CHECK ("legal_form" IS NULL OR "legal_form" IN ('pt', 'pt_perorangan', 'cv', 'firma', 'perorangan', 'lainnya')),
    CONSTRAINT "lead_requests_company_count_check"
        CHECK ("company_count" IS NULL OR ("company_count" >= 1 AND "company_count" <= 1000)),
    -- Status yang sudah DITANGANI selalu tahu kapan dan oleh siapa.
    CONSTRAINT "lead_requests_handled_check"
        CHECK ("status" = 'baru' OR ("handled_at" IS NOT NULL AND "handled_by" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "lead_requests_reference_key" ON "lead_requests"("reference");
CREATE INDEX IF NOT EXISTS "lead_requests_status_created_at_idx" ON "lead_requests"("status", "created_at");
CREATE INDEX IF NOT EXISTS "lead_requests_ip_hash_created_at_idx" ON "lead_requests"("ip_hash", "created_at");
CREATE INDEX IF NOT EXISTS "lead_requests_handled_at_idx" ON "lead_requests"("handled_at");
