-- JEJAK PEMERIKSA KESESUAIAN DATA — temuan berhenti hanya ada di stdout.
--
-- ══ MASALAHNYA, DAN KENAPA IA ASIMETRI ══════════════════════════════════════
-- Layanan `job-conformance` menyapu SETIAP buku PT tiap minggu dan sudah
-- menemukan hal-hal yang mahal: audit 20-21 Agustus 2026 menemukan enam kelas
-- cacat di buku produksi, termasuk kuantitas faktur termigrasi salah senilai
-- Rp 774 juta.
--
-- Tetapi keluarannya hanya `stdout`. Dua layanan latar lain punya jejak yang
-- bisa DITANYAI dari luar — `scheduler_runs` dan `backup_runs`, keduanya
-- terbaca di `/api/health` — sementara yang ini tidak. Jadi satu-satunya cara
-- mengetahui temuan adalah MENGINGAT untuk menjalankan
-- `docker compose logs job-conformance` di dalam jendela retensi log container.
--
-- Pada cadensi MINGGUAN, cacat bisa berumur berbulan-bulan sebelum ada yang
-- membukanya. Alat yang paling berguna di repo ini punya keluaran yang paling
-- mudah tidak terlihat.
--
-- ══ KENAPA TABEL, BUKAN SEKADAR MENAIKKAN LEVEL LOG ═════════════════════════
-- Log menjawab "apa yang terjadi kalau saya sedang melihat". Tabel menjawab
-- "apakah ia masih berjalan, dan apa temuan terakhirnya" — pertanyaan yang
-- diajukan JUSTRU ketika tidak ada yang sedang melihat. Itu bedanya, dan itu
-- seluruh alasan `scheduler_runs` dan `backup_runs` ada.
--
-- ══ BENTUKNYA MENIRU `scheduler_runs`, DENGAN SENGAJA ═══════════════════════
-- Kolom waktu & status yang sama, `details` TEXT yang sama untuk baris laporan
-- yang dulu hanya tercetak. Pola yang sudah terbukti dua kali tidak perlu
-- ditemukan ulang, dan permukaan yang membacanya jadi bisa memakai bentuk
-- berpikir yang sama.
CREATE TABLE `conformance_runs` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `started_at`  DATETIME(3) NOT NULL,
  `finished_at` DATETIME(3) NOT NULL,

  -- ok | findings | error
  --
  -- TIGA nilai, bukan dua, dan pembedaannya penting:
  --   • `ok`       — berjalan, nol temuan. Satu-satunya yang berarti "tenang".
  --   • `findings` — berjalan dan MENEMUKAN sesuatu. Ini keadaan yang harus
  --                  dibaca orang, dan ia BUKAN kegagalan layanan.
  --   • `error`    — ada buku yang GAGAL diperiksa. Buku yang tidak terperiksa
  --                  bukan buku yang bersih; menyatukannya dengan `ok` adalah
  --                  cara paling halus untuk kehilangan satu buku dari sapuan.
  -- String + union TS, konvensi docs/DATABASE.md.
  `status` VARCHAR(12) NOT NULL,

  -- Jumlah buku yang disapu, dan berapa di antaranya gagal diperiksa.
  -- `companies_checked` ikut dicatat supaya pertanyaan "apakah sapuannya
  -- melewatkan buku baru?" bisa dijawab tanpa menebak.
  `companies_checked` INT NOT NULL DEFAULT 0,
  `companies_failed`  INT NOT NULL DEFAULT 0,

  -- Total baris temuan di seluruh buku. Nol = bersih.
  `finding_count` INT NOT NULL DEFAULT 0,

  -- JSON `{findings: string[], failures: string[]}` — baris laporan yang dulu
  -- hanya tercetak ke stdout. TEXT, alasan yang sama dengan `scheduler_runs`:
  -- isi lama tidak perlu bermigrasi saat bentuk barisnya berubah.
  --
  -- ⚠ Yang disimpan adalah LABEL temuan (nomor dokumen, kode akun, mata uang),
  -- bukan nilai uangnya dan bukan baris datanya. Jejak ini dibaca untuk
  -- mengetahui APA yang harus diperiksa orang, bukan untuk menggantikan
  -- pemeriksaannya.
  `details` TEXT NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  -- Pola `backup_runs`: satu index untuk "yang terakhir", satu lagi untuk
  -- "yang terakhir BERSIH" — pertanyaan kedua itu yang dipakai putusan denyut.
  INDEX `conformance_runs_finished_at_idx` (`finished_at`),
  INDEX `conformance_runs_status_finished_at_idx` (`status`, `finished_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
