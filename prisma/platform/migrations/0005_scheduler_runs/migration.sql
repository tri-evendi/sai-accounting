-- Ringkasan putaran penjadwal langganan (issue #154) — supaya "apa yang
-- terjadi pada putaran terakhir?" terjawab dari konsol operator, bukan dari
-- stdout cron lewat SSH. Ditulis scripts/subscription-scheduler.ts di akhir
-- setiap putaran; gagal mencatat tidak menggagalkan putarannya.

-- CreateTable
CREATE TABLE `scheduler_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `invoices_issued` INTEGER NOT NULL DEFAULT 0,
    `reminders_sent` INTEGER NOT NULL DEFAULT 0,
    `status_changes` INTEGER NOT NULL DEFAULT 0,
    `adoptions` INTEGER NOT NULL DEFAULT 0,
    `error_count` INTEGER NOT NULL DEFAULT 0,
    `details` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `scheduler_runs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
