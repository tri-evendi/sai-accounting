-- `users.status` (INT) → `users.must_change_password` (BOOLEAN) — issue #104.
--
-- KENAPA: kolomnya hanya pernah punya dua nilai, dan artinya bukan "status".
--   status = 1 → pengguna WAJIB mengganti kata sandi (akun baru, atau kata
--                sandinya baru saja di-reset admin) → dipaksa ke /change-password
--   status = 0 → tidak wajib
-- Tidak ada nilai ketiga, tidak pernah ada. Seluruh kodenya pun hanya menulis
-- `status === 1`. Ini boolean yang menyamar jadi angka, dan penyamarannya
-- membuat setiap pembacanya harus mengingat arti "1" — docs/DATABASE.md §10
-- sudah mencatatnya sebagai peninggalan yang layak dibereskan "bila menyentuh
-- auth". Multi-perusahaan menyentuh auth sampai ke akarnya, jadi sekaranglah
-- waktunya: sebentar lagi kolom ini pindah ke basis data kendali, dan memindah-
-- kannya sekali dengan nama yang benar lebih murah daripada dua kali.
--
-- Nama `must_change_password` mengikuti aturan boolean di §2 (`is_`/`has_`/
-- kalimat yang jelas) dan menyebut persis apa yang dijaganya.
--
-- ══ TIDAK ADA PENGGUNA YANG BERUBAH KEADAANNYA ═════════════════════════════
-- Backfill memetakan 1 → TRUE dan SELAIN ITU → FALSE, jadi setiap akun tetap
-- pada keadaan yang sama persis: yang tadinya dipaksa ganti sandi tetap
-- dipaksa, yang tidak tetap tidak. Tidak ada sesi yang tercabut oleh migration
-- ini (`session_version` tidak disentuh).
--
-- ══ URUTAN: TAMBAH → ISI → BUANG ═══════════════════════════════════════════
-- Kolom baru dibuat lebih dulu dan diisi dari yang lama, baru kolom lamanya
-- dibuang. Kalau `migrate deploy` mati di tengah, yang tertinggal adalah tabel
-- dengan KEDUA kolom — keadaan yang masih bisa dibaca dan diulang, bukan tabel
-- yang kehilangan informasinya.

-- AlterTable: kolom baru, default TRUE (akun baru selalu wajib ganti sandi).
ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT true;

-- Backfill dari kolom lama: HANYA 1 yang berarti wajib.
UPDATE `users` SET `must_change_password` = (`status` = 1);

-- DropColumn
ALTER TABLE `users` DROP COLUMN `status`;
