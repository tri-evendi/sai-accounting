-- RBAC dapat dikonfigurasi dari UI (issue #73).
--
-- Satu tabel baru: `role_permission_overrides` — override per-sel di atas
-- matriks izin BAWAAN yang tetap hidup di kode (`PERMISSION_ROLES`,
-- src/lib/authz.ts). Satu baris = satu sel (peran × izin) yang menyimpang:
-- `allowed` true menghadiahkan izin yang bawaannya tidak ada, false mencabut
-- izin yang bawaannya ada. "Reset ke bawaan" di UI = menghapus semua baris.
--
-- ══ APA YANG TERJADI PADA DATA & PERILAKU LAMA: TIDAK ADA APA-APA ══════════
-- Migration ini HANYA MEMBUAT TABEL, dan tabel itu SENGAJA dibiarkan KOSONG:
-- tabel kosong = matriks efektif persis sama dengan matriks bawaan di kode,
-- jadi otorisasi setiap peran tidak berubah sedikit pun sampai seorang
-- Pimpinan mengubahnya lewat halaman /permissions.
--
-- Invarian (anti-lockout bos atas authz.manage/user.manage; delete ⊆ write ⊆
-- read pada matriks EFEKTIF) divalidasi di layer aplikasi SEBELUM baris
-- disimpan (src/lib/authz-overrides.ts) — bukan constraint DB, karena
-- invariannya lintas-baris terhadap matriks di kode.

-- CreateTable: role_permission_overrides (satu keputusan per sel matriks)
CREATE TABLE `role_permission_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- enum-like peran: bos | core | ptg (ROLE_VALUES di src/lib/constants.ts).
    `role` VARCHAR(20) NOT NULL,
    -- Kunci izin "resource.action" — harus ada di PERMISSION_ROLES; baris
    -- yatim (izin yang dihapus dari kode) diabaikan saat matriks dirakit.
    `permission` VARCHAR(50) NOT NULL,
    `allowed` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `role_permission_overrides_role_permission_key`(`role`, `permission`),
    INDEX `role_permission_overrides_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
