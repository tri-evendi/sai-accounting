-- Pengguna PINDAH ke basis data kendali (issue #104).
--
-- Sejak multi-perusahaan, identitas orang tidak boleh hidup di dalam buku salah
-- satu perusahaan: satu orang bisa memegang beberapa PT, dan kalau barisnya ada
-- di tiap basis data ia punya beberapa akun dengan kata sandi terpisah — "satu
-- login mencakup semua perusahaan", seluruh alasan issue ini ada, jadi mustahil.
-- Karena itu `users` kini tinggal di basis data kendali bersama `companies` dan
-- `memberships`, dan tabel ini dibuang dari SETIAP basis data perusahaan.
--
-- ══ URUTAN YANG WAJIB DIPATUHI ═════════════════════════════════════════════
--
--   1. `npm run db:migrate:control`            — siapkan basis data kendali
--   2. `npx tsx scripts/adopt-existing-company.ts`  — SALIN users ke kendali
--   3. `npm run db:migrate:companies`          — baru migration INI berjalan
--
-- Langkah 2 membaca tabel `users` yang dibuang langkah 3. Menjalankan 3 lebih
-- dulu berarti kehilangan seluruh akun beserta hash kata sandinya, dan tidak
-- ada cara memulihkannya selain dari cadangan. Skrip adopsi menolak berjalan
-- bila tabelnya sudah hilang, jadi urutan yang salah gagal dengan berisik —
-- tapi tetap: jangan lewati langkah 2.
--
-- ══ ID PENGGUNA TETAP, FOREIGN KEY-NYA YANG PERGI ══════════════════════════
-- Dua tabel di basis data perusahaan menyebut pengguna:
--   • `periods.closed_by_id`               — siapa menutup bulan itu
--   • `user_permission_overrides.user_id`  — izin khusus per pengguna (#75)
-- Kolomnya DIPERTAHANKAN apa adanya, berisi id yang sama persis, sebab skrip
-- adopsi menyalin pengguna ke kendali DENGAN ID YANG SAMA. Yang dilepas hanya
-- FOREIGN KEY-nya: sebuah FK tidak bisa menyeberangi basis data, dan MySQL
-- tidak akan pernah bisa menegakkannya lagi.
--
-- Konsekuensinya jujur dan disebutkan di sini supaya tidak mengejutkan: sejak
-- sekarang basis data TIDAK lagi menjamin bahwa `closed_by_id` menunjuk
-- pengguna yang ada. Penegakannya pindah ke aplikasi — menghapus pengguna
-- adalah operasi di basis data kendali, dan riwayat "ditutup oleh" yang
-- pemiliknya sudah dihapus akan tampil sebagai "—", bukan sebagai galat.
-- Menampilkan tanda hubung untuk penutup periode yang sudah tidak ada jauh
-- lebih baik daripada menahan penghapusan pengguna selamanya.
--
-- ══ TIDAK ADA ANGKA AKUNTANSI YANG DISENTUH ════════════════════════════════
-- Tidak ada jurnal, faktur, stok, atau kas yang berubah satu baris pun.

-- DropForeignKey: periods → users
ALTER TABLE `periods` DROP FOREIGN KEY `periods_closed_by_id_fkey`;

-- DropForeignKey: user_permission_overrides → users
ALTER TABLE `user_permission_overrides` DROP FOREIGN KEY `user_permission_overrides_user_id_fkey`;

-- Index-nya tidak perlu dibuat ulang: `periods_closed_by_id_idx` (0006) dan
-- `user_permission_overrides_user_id_idx` (0030) sudah dideklarasikan
-- eksplisit sejak awal, jadi keduanya tetap ada setelah FK-nya dilepas.

-- DropTable: identitas kini milik basis data kendali.
DROP TABLE `users`;
