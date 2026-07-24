-- Izin khusus per pengguna (issue #75).
--
-- Satu tabel baru: `user_permission_overrides` — lapisan KEDUA di atas matriks
-- efektif peran (issue #73, `role_permission_overrides`). Urutan evaluasi:
-- bawaan di kode → override peran → override PENGGUNA. Satu baris = satu
-- penyimpangan (pengguna × izin): `allowed` true menghadiahkan izin yang
-- perannya tidak punya, false mencabut izin yang perannya punya. Pengguna
-- TANPA baris = mengikuti perannya sepenuhnya ("Ikuti peran" di UI).
--
-- ══ APA YANG TERJADI PADA DATA & PERILAKU LAMA: TIDAK ADA APA-APA ══════════
-- Migration ini HANYA MEMBUAT TABEL, dan tabel itu SENGAJA dibiarkan KOSONG:
-- tanpa baris, setiap pengguna berizin persis seperti perannya — otorisasi
-- tidak berubah sedikit pun sampai Pimpinan mengaturnya lewat "Izin Khusus"
-- di halaman manajemen pengguna.
--
-- Invarian (anti-lockout pengguna ber-peran bos atas authz.manage/user.manage;
-- delete ⊆ write ⊆ read pada set izin FINAL pengguna) divalidasi di layer
-- aplikasi SEBELUM baris disimpan (src/lib/authz-user-overrides.ts) — bukan
-- constraint DB, karena invariannya lintas-baris terhadap matriks di kode.
--
-- FK → users: ON DELETE CASCADE — sengaja BEDA dari FK users lain
-- (periods.closed_by_id / approval_requests.* memakai RESTRICT karena baris
-- itu SEJARAH): override adalah KONFIGURASI yang tak bermakna tanpa
-- penggunanya, dan RESTRICT justru memblokir penghapusan pengguna hanya
-- karena ia pernah diberi izin khusus.

-- CreateTable: user_permission_overrides (satu keputusan per pengguna × izin)
CREATE TABLE `user_permission_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    -- Kunci izin "resource.action" — harus ada di PERMISSION_ROLES; baris
    -- yatim (izin yang dihapus dari kode) diabaikan saat evaluasi.
    `permission` VARCHAR(50) NOT NULL,
    `allowed` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_permission_overrides_user_id_permission_key`(`user_id`, `permission`),
    INDEX `user_permission_overrides_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: user_permission_overrides → users (CASCADE — lihat atas)
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
