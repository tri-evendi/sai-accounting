# Riwayat Perubahan

Perubahan yang **terlihat oleh pengguna**, per rilis ke produksi.

Bukan `git log`. Log mencatat setiap commit; berkas ini mencatat apa yang berubah
bagi orang yang memakai aplikasinya — dan sengaja diam soal refactor, penjaga,
serta pekerjaan dalam yang tidak mengubah apa pun di layar.

**Nomor versinya berarti.** Ia tampil di kaki menu samping, dan itulah yang
disebut orang ketika melaporkan masalah ("saya di v0.2.0"). `package.json`
memegang nomornya, `next.config.ts` menyuntikkannya saat build, dan
`tests/changelog.test.ts` menolak nomor yang tidak cocok dengan judul teratas di
bawah — jadi rilis tanpa catatan tidak bisa lolos gerbang.

Format: `## <versi> — <tanggal> (<sha main>)`. Versi naik di **minor** untuk
kemampuan baru, **patch** untuk perbaikan saja.

---

## 0.2.0 — 2026-08-30 (db7f748)

### Modul Manufaktur — baru

Modul produksi utuh, dari resep sampai jurnalnya. **Tidak menyala sendiri:**
ia modul opt-in pertama, dinyalakan per perusahaan di halaman Modul Usaha —
sebab perusahaan dagang tidak boleh tiba-tiba menemukan tiga menu yang tak
pernah dimintanya.

- **Stasiun Kerja** — tempat kerja beserta tarif upah dan overhead per jam.
- **Resep Produksi** — bahan dan tahapan sebuah produk. Susut bahan
  **membagi**, bukan mengalikan. Resep boleh bertingkat: layar resep menurunkan
  rakitan antara sampai bahan daun untuk memperlihatkan biaya standarnya —
  tetapi perintah produksi tetap mengambil komponen **langsung** dari gudang,
  jadi rakitan antara dibuat lewat perintah produksinya sendiri.
- **Perintah Produksi** — satu batch dari mulai sampai selesai. Dua tindakan
  menulis ke buku besar: bahan keluar ke Barang Dalam Proses, lalu barang jadi
  masuk dengan harga pokok yang benar-benar terpakai.
- **Varians** — rencana lawan kenyataan (bahan, efisiensi, hasil). **Informasi,
  bukan jurnal:** ia tidak menyentuh buku besar.
- Tiga akun baru saat modul dinyalakan: `1106` Barang Dalam Proses,
  `5103` Beban Upah Langsung, `5104` Beban Overhead Pabrik.
- Kategori usaha baru **Manufaktur** di wisaya setup.

### Panduan

- **Tujuh alur kerja baru** di panel Alur Kerja Beranda — Stok, Kas & Bank,
  Produksi, Kontrak & Dokumen Ekspor, Aset Tetap, Persetujuan, dan Pajak.
  Sebelumnya hanya ada tiga (Penjualan, Pembelian, Tutup Buku), jadi delapan
  dari sebelas modul tidak punya panduan urutan sama sekali. Sekarang
  **kesebelasnya punya**.
- **Tur baru** di layar Perintah Produksi.
- **Halaman dokumen Manufaktur** — resep, stasiun kerja, dan perintah produksi
  dalam satu cerita.

### Perbaikan letak menu

- **Retur Penjualan** dan **Surat Jalan** pindah ke modul yang sebenarnya
  memilikinya — sebelumnya keduanya ikut mati saat modul yang salah dimatikan.
- **Transaksi Berulang** berhenti digerbangi izin faktur; ia punya izinnya
  sendiri.

### Bahasa

Layar manufaktur ditulis ulang dengan kalimat yang dipahami pemilik usaha,
bukan terjemahan jargon ERP.

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
