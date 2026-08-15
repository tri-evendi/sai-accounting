-- TOKEN API — issue #389 (temuan F-10 audit rilis umum).
--
-- KENAPA: sampai sekarang aplikasi ini tidak punya SATU PUN antarmuka integrasi.
-- Pencarian `Bearer` / `api_token` / `apiKey` di seluruh `src/` memulangkan nol;
-- satu-satunya webhook yang ada adalah webhook MASUK dari gerbang pembayaran
-- untuk penagihan platform sendiri. Jadi "integrasi dengan sistem eksternal"
-- hari ini berarti: seseorang mengunduh CSV dan mengunggahnya ke tempat lain.
--
-- Untuk rilis umum di pasar yang memakai marketplace, kasir, dan bank yang
-- bicara API, itu keberatan penjualan pertama.
--
-- ══ KENAPA DI BASIS DATA KENDALI ═══════════════════════════════════════════
-- Tabel ini menjawab pertanyaan yang sama dengan `memberships`: "siapa boleh
-- membuka buku mana, sebagai apa". Pertanyaan itu selalu dijawab kendali — dan
-- buku perusahaan TIDAK BOLEH memuat kredensial yang bisa membuka dirinya
-- sendiri, sebab satu SELECT di sana akan membawa pergi kuncinya.
--
-- ══ YANG DISIMPAN BUKAN TOKENNYA ═══════════════════════════════════════════
-- `token_hash` = SHA-256 heksadesimal (64 karakter, selalu) dari bagian
-- RAHASIA-nya. Tokennya sendiri hanya pernah ada sekali, di layar yang
-- menerbitkannya.
--
-- Bentuk tokennya `sai_<id>_<rahasia>`: `id` dipakai MENCARI barisnya lewat
-- primary key, `rahasia` yang dibandingkan. Tanpa id di dalam token, setiap
-- permintaan API harus memindai seluruh tabel dan menghitung hash baris demi
-- baris — biaya yang tumbuh seiring jumlah token, untuk pekerjaan yang
-- seharusnya satu lookup.
--
-- SHA-256, BUKAN bcrypt. bcrypt sengaja lambat untuk menahan penebakan kata
-- sandi manusia yang entropinya rendah; rahasia di sini 32 byte acak, dan
-- menebaknya mustahil tanpa bantuan pelambatan apa pun. Memakai bcrypt berarti
-- membayar ~100 ms pada SETIAP permintaan API demi keamanan yang tidak
-- bertambah.
--
-- ══ PERAN, BUKAN DAFTAR CAKUPAN ════════════════════════════════════════════
-- `role` menyatakan token ini BERPERAN sebagai apa di perusahaan itu, dan
-- pemeriksaan izinnya lewat matriks yang sama dengan pengguna manusia —
-- termasuk override per perusahaan (issue #73). Daftar cakupan tersendiri akan
-- menjadi salinan kedua dari matriks itu, dan salinan kedua menyimpang pada
-- perubahan izin pertama.
--
-- ══ DICABUT, BUKAN DIHAPUS ═════════════════════════════════════════════════
-- `revoked_at` alih-alih DELETE: token yang pernah menarik data pelanggan harus
-- tetap bisa dijawab "siapa yang menerbitkannya, dan kapan dicabut". Baris yang
-- hilang tidak bisa menjawab apa pun.

-- CreateTable
CREATE TABLE `api_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `api_tokens_company_id_idx`(`company_id`),
    INDEX `api_tokens_revoked_at_idx`(`revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- CASCADE: perusahaan yang dihancurkan tidak boleh meninggalkan kredensial yang
-- masih bisa dipakai memanggil API atas namanya.
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: penerbitnya harus tetap bisa disebut. Menghapus pengguna yang masih
-- punya token aktif adalah tindakan yang harus disengaja, bukan efek samping.
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
