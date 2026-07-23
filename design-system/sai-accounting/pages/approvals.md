# Perlu Persetujuan — `/approvals`

> Satu-satunya halaman kerja yang dilihat SEMUA peran, dan tempat uang bernilai
> besar diputuskan — aturan tampilannya lebih ketat dari halaman lain.

## Aturan (meng-override / menambah MASTER.md)

- **Nilai selalu tampil dua kali dan itu disengaja:** dalam mata uang dokumen
  (yang ditandatangani orang) DAN setara IDR base beserta kursnya (yang diadu
  dengan ambang). Tanpa keduanya, faktur USD terlihat seolah jauh di bawah
  ambang rupiah. Ambangnya juga ditampilkan di tiap baris.
- **Isi halaman diturunkan dari SESI, bukan parameter URL** — penyetuju melihat
  antreannya, pemohon melihat pengajuannya; tidak ada cara mengintip antrean
  orang lain. Jangan menambah filter berbasis query yang membocorkan ini.
- **Urutan kartu tetap:** Menunggu Keputusan Anda → Pengajuan Saya → Riwayat
  Keputusan. Ketiganya membawa anchor tur `persetujuan-antrean`,
  `persetujuan-pengajuan`, `persetujuan-riwayat` untuk tur "Cara kerja
  persetujuan" (`src/lib/tours.ts`, teruji di `tests/tours.test.ts`) — jangan
  dihapus/dipindah tanpa memperbarui tur & tesnya.
- **Keputusan selalu diberi umpan balik yang menjelaskan akibat pembukuannya**
  ("Disetujui — jurnalnya sudah terbit" / "Ditolak. Dokumen tetap tersimpan
  tanpa jurnal"), bukan sekadar "berhasil".
- Badge status wajib ikon + teks (bukan warna saja) — di halaman ini badge
  adalah alat keputusan utama, bukan hiasan.

## Jangan

- Menampilkan hanya nilai IDR (atau hanya mata uang dokumen) pada baris antrean.
- Menyembunyikan tombol Tolak atau menghilangkan kolom catatan alasan — alasan
  penolakan adalah bahan pemohon memperbaiki dokumennya.
