# Beranda — `/dashboard`

> Beranda dipakai untuk *mengerjakan*, bukan sekadar melihat — urutan seksinya
> disengaja dan menjadi sasaran tur berpandu, jadi tidak boleh digeser bebas.

## Aturan (meng-override / menambah MASTER.md)

- **Urutan seksi tetap:** Aksi Cepat → Alur Kerja → peringatan stok → Ringkasan
  bahasa sehari-hari → Stok Barang → Kas & Bank → Penjualan & Kontrak. Aksi
  Cepat selalu paling atas karena beranda adalah titik berangkat pekerjaan.
- **Setiap seksi berisi angka + daftar terbaru, TANPA grafik.** Isinya kartu
  angka yang bisa diklik ke sumbernya dan satu tabel ringkas — lihat "Grafik
  tidak tinggal di sini" di bawah.
- **Aksi Cepat disaring per peran di server** (`quickActionsForRole`), bukan
  disembunyikan CSS — tombol yang tak boleh dipakai peran itu tidak pernah
  dikirim ke browser. Daftarnya milik `src/lib/quick-actions.ts` (teruji di
  `tests/quick-actions.test.ts`), jangan menambah tombol langsung di halaman.
- **Ringkasan memakai bahasa sehari-hari** (Uang Masuk / Uang Keluar / Selisih),
  bukan istilah akuntansi; setiap kartu wajib menaut ke laporan sumbernya agar
  angkanya selalu bisa dicek.
- **Visibilitas per peran:** seksi Kas & Bank dan Penjualan & Kontrak hanya
  peran kantor (Direktur Utama, Manajer Keuangan, Administrator); kartu
  untung/rugi hanya peran berakses penuh (Direktur Utama & Administrator);
  Kepala Gudang melihat beranda berfokus stok.
  Query seksi yang tersembunyi tidak boleh dijalankan (bukan hasilnya dibuang).
- **Anchor tur wajib dipertahankan:** `data-tour="aksi-cepat"` dan
  `data-tour="ringkasan"` dipakai tur "Kenalan dengan Beranda"
  (`src/lib/tours.ts`). Mengubah/memindah seksi = perbarui juga tur & tesnya.

## Grafik tidak tinggal di sini

Kelima grafik pernah ada di beranda dan **sudah dipindah ke halaman yang
angkanya dijelaskan**:

| Grafik | Sekarang di |
| --- | --- |
| Kondisi stok (donat) | `/inventory` |
| Stok terbanyak (batang) | `/inventory` |
| Uang masuk & keluar per mata uang | `/reports/cash-flow` |
| Status kontrak (donat) | `/contracts` |
| Aktivitas bulanan | `/contracts` |

Alasannya dua, dan keduanya masih berlaku:

1. **Grafik adalah permukaan *melihat*.** Beranda adalah titik berangkat
   pekerjaan; grafik yang berdiri sendiri di sana hanya bisa dipandangi. Di
   halaman tujuannya ia berdiri tepat di sebelah baris yang menyusunnya, jadi
   angkanya bisa langsung dicek — janji "setiap angka bisa ditelusuri" yang
   sama dengan yang dipegang kartu Ringkasan.
2. **Ongkos muat halaman pertama.** `src/components/shared/dashboard-charts.tsx`
   adalah satu-satunya pemakai `recharts` di aplikasi ini. Selama ia diimpor
   dari beranda, seluruh pustaka grafik ikut termuat di halaman yang dibuka
   **setiap** pengguna — termasuk yang datang hanya untuk menekan satu tombol
   Aksi Cepat.

Yang ikut pindah bukan cuma JSX-nya: beranda **tidak lagi menjalankan**
kueri 6 bulan (kas, kontrak, tagihan) maupun hitungan status kontrak untuk
grafik. Halaman tujuan menghitung sendiri dari kueri yang sudah ia jalankan
bila memungkinkan (`/inventory` memakai ringkasan persediaan yang sudah ada),
dan bagian murni serinya dipakai bersama lewat `src/lib/chart-data.ts`.

Aturan yang ikut berlaku di halaman tujuan:

- **Warna donat per POSISI, bukan per teks label.** Urutan data wajib
  aman → menipis → habis dan sah → menunggu → dibatalkan. Peta warna berkunci
  teks pernah membuat semua irisan abu-abu begitu labelnya ikut bahasa
  pengguna.
- **Izin dulu, baru kueri.** Aturan "kueri seksi tersembunyi tidak dijalankan"
  ikut pindah: `/contracts` tidak mengambil baris tagihan (dan tidak merender
  Aktivitas bulanan) tanpa `invoice.read` efektif; `/reports/cash-flow` tidak
  membaca buku kas tanpa `cash.read` efektif, izin yang berbeda dari
  `report.read` penjaga halamannya.

## Jangan

- Menambah kartu KPI berjargon akuntansi tanpa padanan bahasa sehari-hari.
- Menaruh seksi baru di atas Aksi Cepat.
- **Mengembalikan grafik ke beranda** — termasuk versi "kecil saja" atau
  "satu saja". Itu membatalkan kedua alasan di atas sekaligus: grafik baru
  masuk ke halaman yang angkanya dijelaskan, bukan ke sini.
