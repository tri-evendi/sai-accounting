-- Penyesuaian NILAI persediaan tanpa kuantitas (issue #495 butir 1).
--
-- Kolomnya NULLable dan tak satu pun baris lama memakainya, jadi pemasangan
-- yang sudah berjalan berperilaku persis seperti kemarin: `weightedAverage-
-- UnitCost` menjumlahkan `NULL` sebagai nol.
--
-- `type` dilebarkan ke 15 supaya muat "cost_adjust". VARCHAR(10) memotongnya
-- diam-diam menjadi "cost_adju" di MySQL non-strict — sebuah jenis gerakan yang
-- tidak dikenal siapa pun dan karena itu tidak dihitung ke mana pun.
ALTER TABLE `stock_movements`
  MODIFY COLUMN `type` VARCHAR(15) NOT NULL,
  ADD COLUMN `value_adjustment` DECIMAL(15,2) NULL;
