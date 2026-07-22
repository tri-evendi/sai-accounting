-- Penilaian ulang persetujuan saat dokumen diedit (issue #45).
--
-- ── LUBANG YANG DITUTUP ─────────────────────────────────────────────────────
-- Sampai #25, pengajuan persetujuan hanya dibuat saat dokumen PERTAMA kali
-- ditulis. Akibatnya ambang bisa dilewati dalam dua langkah tanpa niat jahat:
--   1. dokumen di bawah ambang (tanpa pengajuan) diedit menjadi bernilai besar
--      → tetap masuk jurnal tanpa pernah disetujui siapa pun;
--   2. dokumen yang disetujui pada nilai X diedit menjadi jauh di atas X
--      → `repostForSource` membalik jurnal lama lalu memposting nilai baru,
--        karena gerbangnya hanya melihat status `approved` yang sudah melekat.
--
-- ── SATU KOLOM, DAN MENGAPA IA HARUS ADA ────────────────────────────────────
-- `base_amount` mengikuti dokumen: ia diperbarui setiap dokumennya diedit.
-- Karena itu ia TIDAK bisa sekaligus menjadi catatan "berapa yang disetujui" —
-- begitu dokumennya berubah, bukti nilai yang direstui penyetuju ikut hilang,
-- dan "sudah diedit melebihi yang disetujui" tak lagi bisa dibedakan dari
-- "memang sebesar itu sejak awal". `approved_base_amount` diisi sekali, saat
-- keputusan setuju diambil, lalu tidak ikut berubah.
--
-- ── DAMPAK PADA DATA LAMA ───────────────────────────────────────────────────
-- Kolomnya NULL untuk semua baris yang sudah ada; tidak ada backfill dan tidak
-- ada tabel dokumen yang disentuh. Pengajuan lama yang terlanjur `approved`
-- diperlakukan konservatif oleh `coveredByApproval`: dianggap disetujui pada
-- AMBANGNYA sendiri, sehingga kenaikan nilai di atas itu meminta persetujuan
-- lagi alih-alih diam-diam lolos. Dokumen tanpa pengajuan sama sekali tetap
-- seperti sebelumnya (`blocksPosting(null) === false`).

ALTER TABLE `approval_requests`
    ADD COLUMN `approved_base_amount` DECIMAL(15, 2) NULL AFTER `decision_note`;
