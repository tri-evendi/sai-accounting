-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK constraint untuk contracts.status — temuan S3 ditutup (23 Okt 2026)
--
-- Kosakatanya EMPAT nilai — `contract_statuses` di `contract/accounting.yaml`
-- (signed · pending · canceled · completed; `completed` disahkan pemilik hari
-- yang sama). Daftar di bawah wajib SAMA dengan kontrak itu; dijaga
-- `tests/contract-status-check.test.ts`. Mengubah kosakata berarti migration
-- BARU yang mengganti constraint ini, bukan menyunting berkas ini.
--
-- ══ KENAPA DUA LANGKAH, DAN KENAPA TIDAK PERNAH GAGAL ═════════════════════
-- Migration ini berjalan di SETIAP buku PT, dan isi `contracts.status` di buku
-- selain `pt-sai` tidak pernah diperiksa satu per satu. `ADD CONSTRAINT … CHECK`
-- biasa memvalidasi seluruh baris saat dipasang: satu baris liar di satu buku
-- (mis. `cancelled` dua-L dari impor lama) menggagalkan `migrate deploy` untuk
-- buku itu di tengah rilis. Jadi:
--
--   1. constraint dipasang `NOT VALID` — sejak saat itu setiap INSERT/UPDATE
--      diperiksa, baris lama belum;
--   2. baris lama dihitung; bila NOL, constraint di-`VALIDATE` (di sinilah
--      buku yang bersih mendapat jaminan penuh). Bila tidak nol, constraint
--      DIBIARKAN `NOT VALID` dan migration tetap berhasil, dengan WARNING yang
--      menyebut jumlahnya.
--
-- Akibat yang harus diketahui untuk buku yang tertinggal NOT VALID: baris liar
-- itu tidak bisa di-UPDATE sampai statusnya dibetulkan — PostgreSQL memeriksa
-- baris BARU hasil UPDATE. Itu disengaja (formulir kontrak pun sudah menolak
-- status di luar kosakata), dan jalan keluarnya satu: betulkan statusnya, lalu
--   ALTER TABLE "contracts" VALIDATE CONSTRAINT "contracts_status_check";
-- `bun run check-data-conformance` menyebut baris mana (`status-kontrak`).
--
-- Status FAKTUR sengaja belum dijaga constraint: belum ada keputusan, dan tidak
-- ada data faktur yang diperiksa untuk itu (lihat `INVOICE_STATUSES`).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_status_check"
    CHECK ("status" IN ('signed', 'pending', 'canceled', 'completed')) NOT VALID;

DO $$
DECLARE
    liar integer;
BEGIN
    SELECT count(*) INTO liar
      FROM "contracts"
     WHERE "status" NOT IN ('signed', 'pending', 'canceled', 'completed');

    IF liar = 0 THEN
        ALTER TABLE "contracts" VALIDATE CONSTRAINT "contracts_status_check";
    ELSE
        RAISE WARNING 'contracts_status_check dibiarkan NOT VALID di basis data %: % baris berstatus di luar kosakata. Betulkan barisnya, lalu jalankan ALTER TABLE "contracts" VALIDATE CONSTRAINT "contracts_status_check".',
            current_database(), liar;
    END IF;
END $$;
