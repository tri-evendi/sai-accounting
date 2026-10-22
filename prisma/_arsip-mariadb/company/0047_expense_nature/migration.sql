-- Sifat Beban pada akun (issue #445).
--
-- Aditif dan NULLABLE, tanpa backfill: NULL berarti "belum ditetapkan", bukan
-- data hilang. Setiap akun yang sudah ada tetap sah dan tidak ada satu angka
-- laporan pun yang bergeser di hari pertama — preseden yang sama dengan
-- `journal_lines.cost_center_id` (issue #91).
--
-- Tanpa indeks dengan sengaja: `accounts` berisi ratusan baris, bukan jutaan,
-- dan indeks yang tak pernah menolong tetap harus dirawat setiap tulis.
ALTER TABLE `accounts` ADD COLUMN `expense_nature` VARCHAR(30) NULL;
