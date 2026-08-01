-- Jejak pengingat terkirim (issue #140) — kunci idempotensi penjadwal:
-- unik (subscription_id, kind, due_key) berarti dijalankan dua kali tidak
-- pernah mengirim dua kali.

-- CreateTable
CREATE TABLE `reminder_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `due_key` VARCHAR(40) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reminder_logs_subscription_id_kind_due_key_key`(`subscription_id`, `kind`, `due_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reminder_logs` ADD CONSTRAINT `reminder_logs_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
