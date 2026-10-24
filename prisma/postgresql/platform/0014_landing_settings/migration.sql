-- ═══════════════════════════════════════════════════════════════════════════
-- TAMPILAN HALAMAN DEPAN YANG DIATUR OPERATOR (konsol `/landing`)
--
-- Sampai migration ini susunan halaman pendaratan hanya ada di kode: seksi
-- mana yang tampil, ke mana tombol "Jadwalkan demo" menuju, kalimat pembuka
-- WhatsApp, bilah pengumuman, dan daftar tanya-jawab. Mengubah salah satunya
-- berarti rilis. Tabel ini memindahkan kelimanya ke konsol.
--
-- ══ SATU BARIS, BUKAN KOLOM BARU DI `site_settings` ══════════════════════
-- `site_settings` memikul kanal kontak, instruksi transfer, dan GERBANG uang
-- (pendaftaran, PPN) yang dibaca penjadwal di luar Next. Tampilan pemasaran
-- bukan gerbang dan tidak dibaca penjadwal; menaruhnya di sana membuat setiap
-- penyimpanan tampilan ikut menulis ulang baris yang menentukan nominal
-- tagihan. Tabel sendiri = formulir sendiri = penulisan sendiri.
--
-- ══ NILAI TERSTRUKTUR SEBAGAI TEKS JSON ═══════════════════════════════════
-- Pola `payload_json` di skema ini: TEXT, bukan JSONB. Bentuknya divalidasi
-- KODE pada kedua arah (`@sai/core/landing-settings`): yang tidak lolos saat
-- dibaca diperlakukan seperti tidak diatur — halaman jatuh ke perilaku hari
-- ini, bukan 500. Mengubah bentuknya tidak menuntut migration.
--
-- ══ NULL = PERILAKU HARI INI ═════════════════════════════════════════════
-- Setiap kolom NULL berarti "tidak diatur dari konsol" dan halaman tampil
-- persis seperti sebelum migration ini. Baris yang tidak ada = semua NULL.
-- Basis data tak terjangkau juga = semua NULL (gagal-lunak, doktrin #137).
--
-- ══ EXPAND SAJA ══════════════════════════════════════════════════════════
-- Tabel baru; tidak ada yang lama disentuh. Image lama tidak mengenalnya.
-- Bisa dijalankan ulang (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "landing_settings" (
    "id" SERIAL NOT NULL,
    -- Penanda SINGLETON — selalu 1 (pola `site_settings`).
    "singleton" INTEGER NOT NULL DEFAULT 1,
    -- Larik JSON kunci seksi yang DISEMBUNYIKAN (`features`, `modules`,
    -- `audience`, `integrations`, `trust`, `faq`). NULL = semua tampil.
    "hidden_sections_json" TEXT,
    -- Tautan pemesanan demo. Hanya https — CHECK di bawah lapis kedua di
    -- belakang validasi kode.
    "demo_booking_url" VARCHAR(500),
    -- `{"id": "...", "en": "...", "zh": "..."}` — kalimat pembuka WhatsApp.
    "whatsapp_message_json" TEXT,
    -- Bilah pengumuman: nyala/mati, teks per bahasa, tautan, jendela waktu.
    "announcement_json" TEXT,
    -- Daftar tanya-jawab. NULL = daftar bawaan dari kamus.
    "faq_items_json" TEXT,
    "updated_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "landing_settings_singleton_check" CHECK ("singleton" = 1),
    CONSTRAINT "landing_settings_demo_booking_url_check"
        CHECK ("demo_booking_url" IS NULL OR "demo_booking_url" ~ '^https://[^\s]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "landing_settings_singleton_key" ON "landing_settings"("singleton");
