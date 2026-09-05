# Riwayat Perubahan

<!-- DIBANGKITKAN dari src/lib/changelog.ts — jangan sunting berkas ini.
     Ubah sumbernya, lalu jalankan: bun run changelog:build -->

Perubahan yang **terlihat oleh pengguna**, per rilis ke produksi.

Bukan `git log`. Log mencatat setiap commit; berkas ini mencatat apa yang
berubah bagi orang yang memakai aplikasinya — dan sengaja diam soal refactor,
penjaga, serta pekerjaan dalam yang tidak mengubah apa pun di layar.

Isi yang sama dibaca pengguna di dalam aplikasi lewat halaman **Apa yang
Baru** (`/docs/apa-yang-baru`), yang dijangkau dari nomor versi di kaki menu
samping.

**Nomor versinya berarti.** `package.json` memegang nomornya,
`next.config.ts` menyuntikkannya saat build, dan `tests/changelog.test.ts`
menolak nomor yang tidak cocok dengan rilis teratas di bawah — jadi rilis
tanpa catatan tidak bisa lolos gerbang.

---

## 0.5.0 — 2026-09-05 — belum digelar

Daftar yang gagal dimuat berhenti tampil sebagai daftar kosong, stok masuk bisa langsung memotong kas, dan kontrak menyebut sendiri apakah ia kena PPN.

### Baru

- Saat menambah stok masuk, Anda bisa memilih kas atau bank yang uangnya keluar untuk barang itu. Nilainya dihitung dari jumlah kali harga pokok dan tampil sebelum disimpan. Bawaannya tetap tidak memotong apa pun — barang yang masuk lewat layar Pembelian sudah punya hutang dan pelunasannya sendiri.
- Kontrak kini menyebut sendiri apakah ia kena PPN, dan faktur yang ditarik darinya mewarisi jawaban itu. Sebelumnya PPN baru muncul di faktur dengan bawaan yang disimpulkan dari mata uang dan pelanggan, sehingga kontrak rupiah tanpa PPN harus dibetulkan dengan tangan pada setiap fakturnya.

### Berubah

- Kontrak lama tidak berubah perilakunya: selama PPN-nya belum dinyatakan, fakturnya tetap memakai bawaan yang sama seperti sebelumnya. Tarifnya tetap mengikuti profil pajak perusahaan pada tanggal faktur — perusahaan non-PKP tetap tidak memungut.

### Perbaikan

- Pemilih pemasok, pelanggan, akun, dan pusat biaya sempat menampilkan “tidak ada pilihan” padahal datanya ada — yang gagal dimuat terbaca sama persis dengan yang memang kosong. Kini kegagalan dikatakan sebagai kegagalan, dan daftar kosong hanya muncul kalau memang tidak ada isinya.
- Jawaban “tidak” pada beberapa isian ya/tidak bisa tersimpan terbalik menjadi “ya” bila dikirim dari luar aplikasi. Menyangkut status PKP serta penonaktifan resep produksi dan stasiun kerja. Nilai yang tidak dikenali kini ditolak, bukan ditebak.
- Beberapa tugas terjadwal di latar bisa macet dan menahan seluruh tugas berikutnya tanpa tanda apa pun. Kini tugas yang macet dihentikan sendiri dan yang berikutnya tetap berjalan.

---

## 0.4.0 — 2026-08-30 (f990c44)

Halaman bantuan baru yang memperlihatkan alur kerja lengkap untuk tiap jenis usaha, lengkap dengan gambarnya.

### Baru

- Halaman bantuan “Alur kerja untuk jenis usaha Anda” — urutan ujung-ke-ujung untuk perdagangan ekspor, distribusi, jasa, dan manufaktur, masing-masing dengan gambar tahapannya dan modul yang mengerjakan tiap tahap.
- Empat gambar alur baru menjelaskan perbedaan tiap jenis usaha secara langsung: mana yang mulai dari kontrak, mana yang tak punya surat jalan sama sekali, dan di mana tahap produksi menyisip.

---

## 0.3.0 — 2026-08-30 (978687f)

Riwayat perubahan kini bisa dibaca dari dalam aplikasi — halaman yang sedang Anda buka ini.

### Baru

- Halaman “Apa yang Baru” — halaman ini sendiri. Sebelumnya catatan perubahan hanya ada di tempat yang dibaca pengembang, jadi menu yang tiba-tiba muncul tidak pernah punya penjelasan yang bisa Anda buka sendiri.

### Berubah

- Nomor versi di kaki menu samping kini bisa diklik dan membawa Anda ke halaman ini. Sebelumnya ia hanya angka yang tidak menuju ke mana-mana.

---

## 0.2.0 — 2026-08-30 (8ac0d9c)

Modul Manufaktur, dan panduan untuk setiap modul — termasuk delapan yang selama ini tidak punya.

### Baru

- Modul Manufaktur: resep produksi, stasiun kerja, dan perintah produksi. Ia tidak menyala sendiri — dinyalakan per perusahaan di halaman Modul Usaha, atau dengan memilih kategori usaha Manufaktur saat setup.
- Perintah produksi menghitung harga pokok barang jadi dari biaya yang sungguhan terpakai: bahan, upah, dan overhead pabrik. Selisih rencana lawan kenyataan ditampilkan sebagai informasi, dan tidak pernah menjadi jurnal.
- Panduan Alur Kerja di Beranda bertambah tujuh: Stok, Kas & Bank, Produksi, Kontrak & Dokumen Ekspor, Aset Tetap, Persetujuan, dan Pajak. Sebelumnya hanya ada tiga, sehingga delapan dari sebelas modul tidak punya panduan urutan sama sekali.
- Halaman bantuan baru tentang manufaktur, dan tur berpandu di layar Perintah Produksi.

### Berubah

- Nomor versi di kaki menu samping kini benar-benar berganti tiap rilis. Sebelumnya ia menampilkan angka yang sama untuk setiap rilis yang pernah ada, sehingga tidak berguna ketika Anda menyebutnya dalam laporan masalah.

### Perbaikan

- Retur Penjualan dan Surat Jalan sebelumnya ikut menghilang ketika modul yang salah dimatikan. Keduanya kini berada di modul yang benar-benar memilikinya.
- Transaksi Berulang tidak lagi menuntut izin faktur; ia memakai izinnya sendiri.

---

## Sebelum penomoran — Maret s.d. 30 Agustus 2026

125 rilis, tidak tercatat satu per satu, dan **tidak akan direkonstruksi**:
pesan gabungnya sebagian besar berbunyi *"Merge pull request #N"*, jadi daftar
per-rilis yang ditulis sekarang akan menjadi karangan yang berpenampilan
catatan. Yang bisa dikatakan jujur adalah temanya. Rinciannya ada di
`git log --first-parent main`.

Versi `0.1.0` menandai seluruh era ini — satu nomor untuk 125 rilis, dan itulah
sebabnya berkas ini ada.

| Tema | Ditutup di |
|---|---|
| Fondasi akuntansi — jurnal berpasangan, buku besar, periode terkunci, persetujuan | Maret–Juli |
| Penjualan, pembelian, persediaan rata-rata tertimbang, biaya impor | Juli |
| Izin terpusat (matriks + override per peran & pengguna) | Juli |
| Trilingual id/en/zh lewat cookie | Juli |
| Desain berpindah ke Ant Design v6; Tailwind dicabut | Juli |
| Multi-perusahaan — satu basis data per PT | Awal Agustus |
| SaaS: paket, kuota, penagihan, konsol operator | Awal Agustus |
| Halaman promosi & harga publik | 17–18 Agustus |
| Dokumentasi dalam aplikasi (`/docs`) | Agustus |
| Kontrak → pelanggan tertaut; penjaga pihak pada faktur | 27 Agustus |
| Pemasok pada mutasi stok; pilihan akun kas/bank pada pelunasan | 27 Agustus |
| Modul Manufaktur | 30 Agustus |
