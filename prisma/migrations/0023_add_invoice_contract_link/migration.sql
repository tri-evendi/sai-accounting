-- Dokumen berantai: Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15).
--
-- Satu kolom saja: `invoices.contract_id` — kontrak sumber sebuah faktur. Ini
-- melengkapi `delivery_orders.contract_id` / `delivery_orders.invoice_id` yang
-- sudah ada sejak 0022 (#14), sehingga seluruh rantai dapat ditelusuri dua arah.
--
-- ── AKUNTANSI: TIDAK ADA ATURAN JURNAL BARU ─────────────────────────────────
-- Migration ini TIDAK menyentuh accounts/journals/mappings. Faktur yang dibuat
-- lewat pola "Ambil" (menarik baris dari kontrak/surat jalan) memposting persis
-- seperti faktur biasa: `postForSource sourceType: "invoice"` (D: Piutang Usaha,
-- K: Pendapatan + PPN Keluaran). Kolom ini murni penelusuran dokumen.
--
-- ── KENAPA TIDAK ADA TAUTAN PER-BARIS ───────────────────────────────────────
-- `contract_items` DIHAPUS-dan-DIBUAT-ULANG setiap kali kontrak diedit (lihat
-- PUT /api/contracts/[id]), jadi id barisnya tidak stabil dan tidak layak jadi
-- kunci tautan. Identitas baris di app ini adalah NAMA BARANG — pola yang sudah
-- dipakai `delivery_order_items.item_name` (#14). Pelacakan sisa per baris
-- karena itu dijumlahkan per nama barang (dinormalisasi), lihat
-- `src/lib/document-chain.ts`.
--
-- ── FK RESTRICT ─────────────────────────────────────────────────────────────
-- Sama dengan `delivery_orders.contract_id`: kontrak yang sudah difakturkan tak
-- boleh dihapus dari bawah fakturnya. NULL diizinkan — faktur lepas/legacy tidak
-- menyebut kontrak dan TIDAK di-backfill (menebak kontrak asal sebuah faktur
-- lama akan memalsukan angka outstanding).
--
-- Gaya DDL mengikuti 0021/0022 (utf8mb4, DATETIME(3), FK via ALTER TABLE).

-- AlterTable: invoices — kontrak sumber (nullable, tanpa backfill)
ALTER TABLE `invoices` ADD COLUMN `contract_id` INTEGER NULL;

-- CreateIndex: dipakai untuk mengumpulkan faktur milik satu kontrak
CREATE INDEX `invoices_contract_id_idx` ON `invoices`(`contract_id`);

-- AddForeignKey: invoice → contract (RESTRICT)
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
