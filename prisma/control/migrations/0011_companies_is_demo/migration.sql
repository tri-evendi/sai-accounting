-- ─────────────────────────────────────────────────────────────────────────────
-- Perusahaan CONTOH (issue #355) — satu kolom, dan alasannya bukan kenyamanan.
--
-- Audit produksi 13 Agustus 2026: perusahaan baru punya bagan akun dan NOL
-- transaksi, jadi setiap laporan berbunyi "Rp 0". Pengguna awam akuntansi tidak
-- bisa membedakan laporan yang BEKERJA dari laporan yang RUSAK — keduanya
-- terlihat persis sama di hari pertama. Satu-satunya tampilan buku terisi yang
-- pernah dilihat calon pengguna adalah GAMBAR di halaman pemasaran.
--
-- Jalan keluarnya sebuah perusahaan berisi tiga bulan transaksi contoh
-- (`scripts/seed-demo.ts`, yang memposting lewat mesin posting sungguhan
-- sehingga Neracanya benar-benar seimbang). Yang kurang selama ini adalah cara
-- MENANDAI buku semacam itu.
--
-- ── KENAPA KOLOM SENDIRI, BUKAN MENUMPANG STATUS LANGGANAN ──────────────────
-- Aplikasi ini sudah punya mode read-only: `lib/subscription-lifecycle.ts`
-- menolak izin tulis ketika tenantnya DITANGGUHKAN. Menumpanginya akan
-- menampilkan "langganan Anda ditangguhkan" pada perusahaan yang justru dibuat
-- untuk menyambut pengguna baru — kalimat yang salah, pada orang yang salah,
-- di menit pertama mereka memakai produknya.
--
-- "Ini buku contoh" dan "langganan Anda bermasalah" adalah dua keadaan yang
-- berbeda sama sekali, dan menyamakannya membuat pengguna mengejar orang yang
-- salah. Persis alasan `/feature-inactive` dipisahkan dari "tidak punya akses"
-- di issue #99.
--
-- ── AMAN UNTUK DATA YANG SUDAH ADA ─────────────────────────────────────────
-- `DEFAULT FALSE` + `NOT NULL`: setiap perusahaan yang sudah ada tetap berarti
-- persis seperti kemarin. Tidak ada backfill, tidak ada baris yang berubah
-- perilakunya karena kolom ini lahir. Menyalakannya adalah tindakan sengaja —
-- tidak ada satu pun jalur di aplikasi yang menyetelnya ke TRUE sendiri.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `companies`
  ADD COLUMN `is_demo` BOOLEAN NOT NULL DEFAULT FALSE;

-- Dipakai penjaga pada SETIAP permintaan tulis, dan oleh pemilih perusahaan
-- untuk menandai kartunya. Indeksnya menyusul pola `is_active` di atasnya.
CREATE INDEX `companies_is_demo_idx` ON `companies`(`is_demo`);
