-- Selaraskan presisi DECIMAL ke standar docs/DATABASE.md §4 (issue: review migrasi).
--
-- Tabel-tabel lama (dari 0001_init & 0022) memakai DECIMAL(10,2) untuk
-- kuantitas/kg dan DECIMAL(15,4) untuk kurs, sementara tabel yang lebih baru
-- (retur, delivery order) sudah memakai DECIMAL(15,3)/(18,6) sesuai standar.
-- Ketaksesuaian ini paling jelas di `delivery_order_items`: `quantity`
-- (15,3) tetapi `kg_per_bag` (10,2) — di tabel yang SAMA.
--
-- Semua perubahan adalah PELEBARAN presisi (menambah digit integer &/atau
-- desimal), jadi TIDAK ada kehilangan data: nilai 12.50 menjadi 12.500, dst.
-- Perilaku aplikasi tidak berubah — kolom hanya diberi ruang presisi lebih;
-- nilai lama tetap sama.
--
-- Standar: uang = DECIMAL(15,2) · kuantitas (kg/bag) = DECIMAL(15,3) ·
-- kurs = DECIMAL(18,6).

-- Kuantitas kg per bag & harga per kg (contract_items)
ALTER TABLE `contract_items`
  MODIFY COLUMN `kg_per_bag` DECIMAL(15, 3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `price_per_kg` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- Kuantitas baris faktur (invoice_items)
ALTER TABLE `invoice_items`
  MODIFY COLUMN `quantity` DECIMAL(15, 3) NOT NULL DEFAULT 0;

-- Kuantitas stok (stock)
ALTER TABLE `stock`
  MODIFY COLUMN `quantity` DECIMAL(15, 3) NOT NULL;

-- Kuantitas kg per bag pada surat jalan (delivery_order_items)
ALTER TABLE `delivery_order_items`
  MODIFY COLUMN `kg_per_bag` DECIMAL(15, 3) NOT NULL DEFAULT 0;

-- Kurs konversi mata uang (currency_conversions) — ke presisi kurs standar
ALTER TABLE `currency_conversions`
  MODIFY COLUMN `rate` DECIMAL(18, 6) NOT NULL;
