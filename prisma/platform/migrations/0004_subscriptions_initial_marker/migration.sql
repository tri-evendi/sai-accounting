-- Penanda "langganan PERTAMA tenant" (issue #152) — kunci idempotensi
-- kelahiran langganan: verifikasi email, putaran adopsi penjadwal,
-- adopt-tenant, dan change-plan (tanpa langganan lama) semuanya mengisinya
-- dengan tenant_id; UNIQUE + nullable membuat penulis yang berlomba menabrak
-- constraint (P2002), bukan melahirkan langganan kembar. Langganan lanjutan
-- (berlangganan ulang setelah cancelled) membiarkannya NULL.

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `initial_for_tenant_id` INTEGER NULL;

-- Backfill: langganan TERTUA setiap tenant dianggap langganan pertamanya —
-- pemasangan lama (langganan buatan change-plan pra-#152) ikut terlindungi
-- constraint, bukan hanya baris baru.
UPDATE `subscriptions` s
JOIN (
    SELECT `tenant_id`, MIN(`id`) AS `min_id`
    FROM `subscriptions`
    GROUP BY `tenant_id`
) first_sub ON first_sub.`min_id` = s.`id`
SET s.`initial_for_tenant_id` = s.`tenant_id`;

-- CreateIndex
CREATE UNIQUE INDEX `subscriptions_initial_for_tenant_id_key` ON `subscriptions`(`initial_for_tenant_id`);
