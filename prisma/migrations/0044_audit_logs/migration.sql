-- Jejak audit pindah dari BERKAS ke TABEL — issue #370.
--
-- KENAPA: sampai sekarang jejak audit adalah `data/audit/<slug>/audit.jsonl`,
-- ditambah dengan `appendFile` dan DIBACA UTUH ke memori setiap kali halaman
-- Audit dibuka, hanya untuk mengambil 20 baris. Tanpa rotasi, tanpa batas.
-- Tiga akibat lain lahir dari sebab yang sama — jejaknya hidup di luar basis
-- data PT: ia tidak ikut ekspor mandiri tenant (sapuan information_schema
-- hanya melihat tabel), tidak ikut penghancuran buku (berkasnya bertahan
-- selamanya di direktori bersama, lengkap dengan nama pengguna dan alamat IP),
-- dan `appendFile` dari dua proses adalah baris yang saling menimpa pada hari
-- pertama penskalaan mendatar.
--
-- Ketiganya menjadi urusan basis data begitu jejaknya menjadi tabel DI SINI —
-- di basis data perusahaan itu sendiri, bukan di basis data kendali. Alasan
-- pemisahan per perusahaan (kepala lib/audit.ts) tidak dilepas, ia justru
-- ditegakkan oleh mekanisme yang lebih kuat: `prisma` di dalam permintaan
-- adalah klien PT aktif, jadi pembaca yang lupa menyaring tetap tidak punya
-- apa pun untuk dibocorkan.
--
-- ══ TIDAK ADA DATA YANG BERPINDAH DI SINI ══════════════════════════════════
-- Migration ini hanya MEMBUAT tabelnya. Isi berkas lama dipindahkan skrip
-- tersendiri (`bun run migrate:audit --apply`), sebab yang dipindahkan adalah
-- BERKAS dan `prisma migrate` tidak tahu apa-apa tentang berkas. Urutan itu
-- juga yang membuat migration ini aman diterapkan lebih dulu ke seluruh
-- perusahaan: tabel kosong tidak mengubah perilaku apa pun, dan halaman Audit
-- tetap membaca berkas sampai skripnya dijalankan.
--
-- ══ `legacy_id` UNIQUE — IDEMPOTENSI LEWAT CONSTRAINT ══════════════════════
-- Kolom ini menyimpan id entri di berkas JSONL (`<epoch>-<acak>`) dan HANYA
-- diisi oleh skrip pemindahan. Dengan indeks unik di atasnya, menjalankan
-- skripnya dua kali tidak bisa menggandakan satu baris pun — jaminan dari
-- basis data, bukan dari periksa-lalu-tulis yang bisa kalah balapan. Baris
-- yang lahir dari aplikasi mengisinya NULL, dan MySQL mengizinkan NULL
-- berulang pada kolom unik.
--
-- ══ TANPA FOREIGN KEY KE `users` ═══════════════════════════════════════════
-- `user_id` adalah id GLOBAL di basis data kendali. FK lintas basis data
-- mustahil, dan docs/MULTI-COMPANY.md melarangnya secara eksplisit. Nama
-- pengguna ikut disalin (`username`) supaya jejak lama tetap terbaca walau
-- akunnya kelak dianonimkan — yang justru satu-satunya cara jejak audit tetap
-- berguna sesudah penghapusan akun (UU PDP).

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `legacy_id` VARCHAR(40) NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `role` VARCHAR(50) NULL,
    `action` VARCHAR(50) NOT NULL,
    `entity` VARCHAR(50) NOT NULL,
    `entity_id` INTEGER NULL,
    `details` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `audit_logs_legacy_id_key`(`legacy_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
