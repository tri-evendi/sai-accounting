-- Denyut cadangan (issue #374).
--
-- Kegagalan ikut dicatat, dan itu inti tabelnya: sebuah tabel yang hanya
-- menyimpan keberhasilan tidak bisa membedakan "belum pernah dicoba" dari
-- "dicoba tiap hari dan gagal tiap hari".
CREATE TABLE `backup_runs` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `started_at`  DATETIME(3) NOT NULL,
  `finished_at` DATETIME(3) NOT NULL,
  `status`      VARCHAR(10) NOT NULL,
  `error`       TEXT NULL,
  `artifact`    VARCHAR(255) NULL,
  `size_bytes`  BIGINT NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `backup_runs_finished_at_idx` (`finished_at`),
  INDEX `backup_runs_status_finished_at_idx` (`status`, `finished_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
