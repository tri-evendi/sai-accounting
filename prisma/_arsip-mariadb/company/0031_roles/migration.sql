-- Peran dinamis (dikelola dari UI).
--
-- Sampai kini peran adalah enum di kode (bos | core | ptg). Tabel `roles`
-- menjadikannya DATA sehingga Pimpinan bisa menambah/menyunting/menonaktifkan
-- peran dari UI tanpa deploy. `user.role` dan `role_permission_overrides.role`
-- TETAP menyimpan `key` peran sebagai string — jadi kolom itu tak berubah, dan
-- mesin izin efektif (yang sudah berbasis string peran) tetap bekerja apa adanya.
--
-- ══ DATA & PERILAKU LAMA: TIDAK BERUBAH ═══════════════════════════════════
-- Migration ini membuat tabel lalu MENYEMAI tiga peran yang sudah ada sebagai
-- peran SISTEM (`is_system = true`) dengan label yang identik dengan ROLE_LABELS
-- di kode. Peran sistem tak boleh dihapus/dinonaktifkan (dijaga di aplikasi),
-- sehingga otorisasi yang berjalan sekarang persis sama.

-- CreateTable: roles (peran sebagai data; `key` = nilai yang disimpan user.role)
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- slug peran yang disimpan di `users.role` & `role_permission_overrides.role`
    -- (mis. "bos"). Huruf kecil/angka/underscore.
    `key` VARCHAR(20) NOT NULL,
    -- Sebutan tampilan (bahasa Indonesia), mis. "Pimpinan".
    `label` VARCHAR(50) NOT NULL,
    -- Peran bawaan sistem (bos/core/ptg): tak bisa dihapus/dinonaktifkan.
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    -- Nonaktif = tersembunyi dari pemilih peran, tetapi baris lama tetap utuh.
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Semai peran sistem yang sudah ada (label = ROLE_LABELS di kode).
INSERT INTO `roles` (`key`, `label`, `is_system`, `is_active`, `created_at`, `updated_at`) VALUES
    ('bos',  'Pimpinan',            true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('core', 'Staf Kantor',         true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('ptg',  'Bagian Gudang (PTG)', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
