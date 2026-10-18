# Perlu Persetujuan — `/approvals`

> Satu-satunya halaman kerja yang dilihat semua peran, dan tempat uang bernilai
> besar diputuskan. Aturan tampilannya lebih ketat dari halaman lain.

## Aturan (meng-override / menambah MASTER.md)

- **Nilai selalu tampil dua kali:** dalam mata uang dokumen
  (yang ditandatangani orang) dan setara IDR base beserta kursnya (yang diadu
  dengan ambang). Tanpa keduanya, faktur USD terlihat seolah jauh di bawah
  ambang rupiah. Ambangnya juga ditampilkan di tiap baris.
- **Isi halaman diturunkan dari sesi, bukan parameter URL.** Penyetuju melihat
  antreannya, pemohon melihat pengajuannya; tidak ada cara melihat antrean
  orang lain. Jangan menambah filter berbasis query yang membocorkan ini.
- **Urutan kartu tetap:** Menunggu Keputusan Anda → Pengajuan Saya → Riwayat
  Keputusan. Ketiganya membawa anchor tur `persetujuan-antrean`,
  `persetujuan-pengajuan`, `persetujuan-riwayat` untuk tur "Cara kerja
  persetujuan" (`src/lib/tours.ts`, teruji di `tests/tours.test.ts`). Jangan
  dihapus/dipindah tanpa memperbarui tur & tesnya.
- Keputusan selalu diberi umpan balik yang menjelaskan akibat pembukuannya
  ("Disetujui — jurnalnya sudah terbit" / "Ditolak. Dokumen tetap tersimpan
  tanpa jurnal"), bukan sekadar "berhasil".
- Badge status wajib ikon + teks (bukan warna saja); di halaman ini badge
  adalah alat keputusan utama.

## Jangan

- Menampilkan hanya nilai IDR (atau hanya mata uang dokumen) pada baris antrean.
- Menyembunyikan tombol Tolak atau menghilangkan kolom catatan alasan. Alasan
  penolakan adalah bahan pemohon memperbaiki dokumennya.
