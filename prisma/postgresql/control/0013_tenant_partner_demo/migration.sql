-- ═══════════════════════════════════════════════════════════════════════════
-- ALUR DEMO-FIRST (keputusan pemilik 24 Okt 2026): atribusi mitra + penanda
-- tenant demo di `tenants`.
--
-- ══ `referred_by_partner` ════════════════════════════════════════════════
-- Mitra yang membawa tenant ini — teks bebas, SENGAJA bukan tabel mitra:
-- kebutuhannya satu, yaitu komisi yang dihitung manual dari daftar tenant di
-- konsol. Tabel mitra (alamat, rekening, tarif komisi) adalah keputusan yang
-- belum diambil siapa pun; kolom teks tidak mengunci keputusan itu. NULL =
-- datang sendiri / tidak diketahui.
--
-- ══ `is_demo` ════════════════════════════════════════════════════════════
-- Tenant DEMO: boleh diisi ulang data contoh (`bun run demo:seed` /
-- `demo:reset`) dan tidak pernah ikut retensi penghapusan uji coba. Skrip demo
-- MENOLAK tenant tanpa bendera ini — pagar antara buku contoh dan buku
-- sungguhan. Berbeda dari `companies.is_demo` (#355, satu PT contoh
-- hanya-baca): yang ini satu AKUN untuk presentasi, dan bukunya boleh ditulis.
--
-- ══ EXPAND SAJA ═════════════════════════════════════════════════════════
-- Kolom NULLABLE + kolom NOT NULL ber-DEFAULT false. Kode lama tidak menyebut
-- keduanya; bawaannya = perilaku hari ini (tanpa mitra, bukan demo).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "referred_by_partner" VARCHAR(100);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "tenants_referred_by_partner_idx" ON "tenants"("referred_by_partner");
