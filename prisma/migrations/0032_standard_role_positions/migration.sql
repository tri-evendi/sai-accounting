-- Nama jabatan baku untuk peran + peran SISTEM baru `administrator`.
--
-- KENAPA: kunci peran lama (`bos` | `core` | `ptg`) adalah singkatan internal
-- berbahasa campur — tak terbaca oleh siapa pun di luar tim awal, dan menyalahi
-- konvensi docs/DATABASE.md ("Inggris · snake_case" untuk nilai enum-like).
-- Migration ini MENGGANTI NAMA kuncinya menjadi nama jabatan yang baku:
--
--     bos  → managing_director   (Direktur Utama)
--     core → finance_manager     (Manajer Keuangan)
--     ptg  → warehouse_head      (Kepala Gudang)
--
-- ...dan MENAMBAH satu peran SISTEM: `administrator` (Administrator Sistem).
-- Administrator memegang SEMUA izin, persis seperti managing_director — pilihan
-- sadar pemilik sistem: harus selalu ada DUA jalan masuk yang berdiri sendiri
-- untuk mengelola pengguna & hak akses, supaya satu akun yang hilang tak pernah
-- mengunci seluruh perusahaan. Pemisahan tugas dikorbankan dengan sengaja;
-- jejaknya tetap terbaca karena catatan audit menyimpan peran aktor.
--
-- ══ LIMA KOLOM MENYIMPAN KUNCI PERAN ═══════════════════════════════════════
-- Kunci peran TIDAK hanya hidup di `roles.key`. Melewatkan salah satu kolom =
-- data rusak diam-diam (pengguna kehilangan seluruh izinnya, aturan persetujuan
-- tak pernah cocok dengan siapa pun):
--
--   1. `users.role`                      — peran pengguna, + DEFAULT kolomnya
--   2. `roles.key`                       — tabel peran itu sendiri (0031)
--   3. `role_permission_overrides.role`  — override matriks izin (0029)
--   4. `approval_rules.approver_role`    — peran penyetuju pada aturan (0024)
--   5. `approval_requests.approver_role` — SALINAN historis di tiap pengajuan
--        (0024). Ikut diganti nama supaya keputusan lama tetap terbaca DAN
--        pengajuan yang masih menggantung tetap cocok dengan peran penyetujunya
--        (route keputusan mengadu `session.user.role` dengan kolom ini).
--
-- `user_permission_overrides` (0030) sengaja TIDAK disebut: tabel itu berpasangan
-- (pengguna × izin) dan tak punya kolom peran sama sekali — tak ada yang berubah
-- di sana. `tests/role-migration.test.ts` menjaga daftar ini tetap lengkap.
--
-- Catatan: jejak audit (`data/audit/audit.jsonl`) menyimpan peran aktor apa
-- adanya dan TIDAK ditulis ulang — catatan lama adalah rekaman sejarah, yang
-- benar justru menyebut peran dengan nama yang berlaku saat aksi itu terjadi.
--
-- ══ SATU TRANSAKSI, AMAN DIULANG ═══════════════════════════════════════════
-- Seluruh DML dibungkus SATU transaksi: kelima kolom berpindah bersama atau
-- tidak sama sekali. Setengah jalan adalah keadaan terburuk yang mungkin —
-- mis. `users.role` sudah bernama baru sementara `roles.key` masih lama berarti
-- setiap pengguna menunjuk peran yang tak ada.
--
-- Urutannya INDUK DULU: baris `roles` (daftar peran) diganti nama dan peran baru
-- disemai SEBELUM kolom-kolom yang merujuknya. Tak ada FOREIGN KEY di antara
-- kolom-kolom ini — rujukannya berupa string (lihat 0031) — jadi tak ada baris
-- yang bisa yatim di level constraint; urutan ini yang menjaga rujukan LOGISnya
-- tetap runtut, dan transaksinya yang menjamin tak ada pembaca lain melihat
-- keadaan antara.
--
-- Aman diulang: setiap UPDATE bersyarat pada nilai LAMA (`WHERE ... = 'bos'`),
-- dan penyemaian `administrator` memakai `WHERE NOT EXISTS`. Menjalankan berkas
-- ini dua kali tidak mengubah apa pun pada jalan kedua.

START TRANSACTION;

-- 1. `roles` — ganti nama kunci + label tiga peran SISTEM.
--    UPDATE (bukan hapus-lalu-sisip) supaya `id`, `created_at`, dan urutan
--    tampilnya di /permissions tetap utuh. Label = ROLE_LABELS di
--    src/lib/constants.ts (bahasa Indonesia, bahasa sumber aplikasi).
UPDATE `roles` SET `key` = 'managing_director', `label` = 'Direktur Utama',   `updated_at` = CURRENT_TIMESTAMP(3) WHERE `key` = 'bos';
UPDATE `roles` SET `key` = 'finance_manager',   `label` = 'Manajer Keuangan', `updated_at` = CURRENT_TIMESTAMP(3) WHERE `key` = 'core';
UPDATE `roles` SET `key` = 'warehouse_head',    `label` = 'Kepala Gudang',    `updated_at` = CURRENT_TIMESTAMP(3) WHERE `key` = 'ptg';

-- 2. `roles` — semai peran SISTEM baru `administrator` (is_system = true, jadi
--    tak bisa dinonaktifkan/dihapus dari UI, sama seperti tiga peran di atas).
--    `WHERE NOT EXISTS` membuat penyemaian ini aman diulang.
INSERT INTO `roles` (`key`, `label`, `is_system`, `is_active`, `created_at`, `updated_at`)
SELECT 'administrator', 'Administrator Sistem', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `key` = 'administrator');

-- 3. `users.role` — peran setiap pengguna.
UPDATE `users` SET `role` = 'managing_director' WHERE `role` = 'bos';
UPDATE `users` SET `role` = 'finance_manager'   WHERE `role` = 'core';
UPDATE `users` SET `role` = 'warehouse_head'    WHERE `role` = 'ptg';

-- 4. `role_permission_overrides.role` — penyimpangan matriks izin per sel
--    (issue #73). Baris yatim (peran yang tak dikenal kode) diabaikan saat
--    merakit matriks efektif, jadi kolom yang terlewat = override yang diam-diam
--    berhenti berlaku.
UPDATE `role_permission_overrides` SET `role` = 'managing_director' WHERE `role` = 'bos';
UPDATE `role_permission_overrides` SET `role` = 'finance_manager'   WHERE `role` = 'core';
UPDATE `role_permission_overrides` SET `role` = 'warehouse_head'    WHERE `role` = 'ptg';

-- 5. `approval_rules.approver_role` — peran penyetuju pada aturan yang berlaku.
UPDATE `approval_rules` SET `approver_role` = 'managing_director' WHERE `approver_role` = 'bos';
UPDATE `approval_rules` SET `approver_role` = 'finance_manager'   WHERE `approver_role` = 'core';
UPDATE `approval_rules` SET `approver_role` = 'warehouse_head'    WHERE `approver_role` = 'ptg';

-- 6. `approval_requests.approver_role` — salinan historis pada tiap pengajuan.
UPDATE `approval_requests` SET `approver_role` = 'managing_director' WHERE `approver_role` = 'bos';
UPDATE `approval_requests` SET `approver_role` = 'finance_manager'   WHERE `approver_role` = 'core';
UPDATE `approval_requests` SET `approver_role` = 'warehouse_head'    WHERE `approver_role` = 'ptg';

-- 7. Cabut SEMUA sesi yang sedang berjalan.
--
--    WAJIB, bukan kebersihan belaka. Peran ikut disimpan di dalam JWT dan hanya
--    disegarkan dari DB setiap `SESSION_RECHECK_MS` (60 detik). Tanpa langkah
--    ini, setiap pengguna yang sedang aktif membawa token bertuliskan `bos` —
--    kunci yang sudah tidak dikenal matriks izin — dan peran tak dikenal DITOLAK
--    secara bawaan. Akibatnya: sampai satu menit, pengguna kehilangan SELURUH
--    izinnya tanpa penjelasan apa pun, lalu pulih sendiri seolah tak terjadi apa-apa.
--
--    Menaikkan `session_version` mengubah kegagalan diam itu menjadi pencabutan
--    sesi yang jujur: pengguna diminta masuk lagi, lalu token barunya membawa
--    nama peran yang benar. Diminta login ulang jauh lebih baik daripada
--    kehilangan izin secara misterius.
UPDATE `users` SET `session_version` = `session_version` + 1;

COMMIT;

-- 7. DEFAULT kolom `users.role` — 'core' sudah tidak ada lagi sebagai peran.
--    DDL tak bisa ikut transaksi di atas (MySQL/MariaDB meng-commit implisit),
--    jadi dijalankan TERAKHIR: kalau langkah ini gagal, datanya sudah utuh dan
--    hanya nilai bawaan kolom yang tertinggal — dan setiap route yang membuat
--    pengguna selalu mengirim `role` secara eksplisit, jadi tak ada baris yang
--    bisa lahir dengan peran usang.
--    `ALTER COLUMN ... SET DEFAULT` hanya menyentuh metadata (tanpa menyalin
--    tabel, tanpa mengubah tipe/charset kolom) dan idempoten bila diulang.
ALTER TABLE `users` ALTER COLUMN `role` SET DEFAULT 'finance_manager';
