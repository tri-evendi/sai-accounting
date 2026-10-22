-- Period lock / tutup buku bulanan (issue #13).
--
-- One row per calendar month. A month with NO row counts as open, so applying
-- this migration to an existing database changes nothing until a Manager
-- actually closes a month — no history is retroactively frozen.
--
-- `closed_by_id` is nullable and ON DELETE RESTRICT: a user who has closed a
-- period cannot be deleted out from under the audit trail.

-- CreateTable: periods
CREATE TABLE `periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `closed_at` DATETIME(3) NULL,
    `closed_by_id` INTEGER NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `periods_year_month_key`(`year`, `month`),
    INDEX `periods_status_idx`(`status`),
    INDEX `periods_closed_by_id_idx`(`closed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `periods` ADD CONSTRAINT `periods_closed_by_id_fkey` FOREIGN KEY (`closed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
