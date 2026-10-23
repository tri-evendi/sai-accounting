-- ═══════════════════════════════════════════════════════════════════════════
-- SINYAL INVALIDASI CACHE LINTAS PROSES
--
-- Konsol (`app-operator`) menulis pengaturan situs, isi halaman depan, logo,
-- pengumuman status, dan pengaturan surel; `app-customer` dan `svc-worker`
-- membacanya lewat cache di prosesnya sendiri. `updateTag()` di konsol tidak
-- pernah sampai ke proses lain, jadi halaman publik menunggu umur cache-nya
-- (1–5 menit) sementara konsol mengatakan "langsung berlaku".
--
-- Satu baris per cache. Penulis menaikkan `version` sesudah tulisannya
-- berhasil; pembaca membaca seluruh tabel paling sering sekali per lima detik
-- per proses dan membaca ulang sumbernya begitu versinya berubah
-- (`packages/platform/src/cache-signals.ts`).
--
-- EXPAND SAJA: tabel baru, tidak ada yang lama disentuh. Image lama tidak
-- mengenalnya; image baru yang berjalan SEBELUM migration ini diterapkan
-- mendapati tabelnya tidak ada dan kembali ke umur cache saja (gagal-lunak).
-- Isinya bukan data — tabel kosong hanya berarti versi 0 untuk semua nama.
-- Bisa dijalankan ulang (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "cache_signals" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_signals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cache_signals_name_check" CHECK ("name" ~ '^[a-z][a-z0-9-]{0,59}$'),
    CONSTRAINT "cache_signals_version_check" CHECK ("version" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "cache_signals_name_key" ON "cache_signals"("name");
