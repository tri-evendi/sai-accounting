-- ═══════════════════════════════════════════════════════════════════════════
-- KUNCI PENANDA LISENSI TERSEGEL (konsol `/licences`, keputusan pemilik
-- 22 Okt 2026)
--
-- Membalik keputusan "konsol tidak pernah menandatangani" (06-KEAMANAN §3.7):
-- pasangan kunci Ed25519 kini BOLEH dibuat dan dipakai di konsol operator.
-- Yang disimpan di sini hanya kunci privat yang TERSEGEL:
--
--   • kunci penyegel diturunkan dari FRASA SANDI yang diketik operator setiap
--     kali menandatangani (scrypt, salt acak per kunci) — frasanya tidak
--     pernah disimpan di basis data, env, maupun log;
--   • segelnya AES-256-GCM dengan nonce acak; AAD-nya mengikat sidik kunci
--     publik, jadi kunci publik yang ditukar di baris ini membuat segelnya
--     gagal dibuka, bukan membuka kunci yang salah;
--   • dump basis data atau env yang bocor SENDIRIAN tidak bisa menandatangani
--     — penyerang masih harus menebak frasa sandi melawan scrypt.
--
-- Risiko sisa yang TIDAK ditutup migration ini (06 §3.7): RCE pada
-- `app-operator` bisa menangkap frasa sandi saat diketik.
--
-- Kunci PUBLIK tetap ditanam di kode (`LICENCE_PUBLIC_KEY_PEM`) — pemasangan
-- on-premise memverifikasi terhadap konstanta itu, tidak pernah terhadap baris
-- ini. Konsol hanya menandatangani bila sidik baris aktif = sidik kunci
-- tertanam.
--
-- Paling banyak SATU kunci aktif (indeks unik parsial): kunci kedua berarti
-- lisensi lama tidak lagi bisa diverifikasi oleh rilis yang memuat kunci baru.
-- Penjaga: `tests/licence-register-archive.test.ts`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "licence_signing_keys" (
    "id" SERIAL NOT NULL,
    -- SHA-256 (heks) atas DER SPKI kunci publik — yang dibandingkan dengan
    -- kunci tertanam dan ditulis di jejak audit.
    "fingerprint" CHAR(64) NOT NULL,
    "public_key_pem" TEXT NOT NULL,
    -- Parameter penurun kunci, dibaca saat membuka segel. Batasnya sama dengan
    -- kode (`@sai/platform/licence-signing`): baris yang diturunkan ke
    -- parameter lemah ditolak di sini, bukan dipercaya.
    "kdf_name" VARCHAR(20) NOT NULL,
    "kdf_cost" INTEGER NOT NULL,
    "kdf_block_size" INTEGER NOT NULL,
    "kdf_parallelism" INTEGER NOT NULL,
    "kdf_salt" VARCHAR(64) NOT NULL,
    -- Segel AES-256-GCM atas DER PKCS#8 kunci privat (base64) — bertiga,
    -- aturan kolom tersandi docs/DATABASE.md §9.
    "private_key_ciphertext" TEXT NOT NULL,
    "private_key_iv" VARCHAR(64) NOT NULL,
    "private_key_tag" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licence_signing_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "licence_signing_keys_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "licence_signing_keys_kdf_check" CHECK (
        "kdf_name" = 'scrypt'
        AND "kdf_cost" >= 16384 AND "kdf_cost" <= 1048576
        AND ("kdf_cost" & ("kdf_cost" - 1)) = 0
        AND "kdf_block_size" BETWEEN 8 AND 16
        AND "kdf_parallelism" BETWEEN 1 AND 4
    )
);

CREATE UNIQUE INDEX "licence_signing_keys_fingerprint_key" ON "licence_signing_keys"("fingerprint");
CREATE UNIQUE INDEX "licence_signing_keys_active_key" ON "licence_signing_keys"("is_active") WHERE "is_active";
CREATE INDEX "licence_signing_keys_created_at_idx" ON "licence_signing_keys"("created_at");
