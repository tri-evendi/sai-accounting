# Beranda — `/dashboard`

> Beranda dipakai untuk *mengerjakan*, bukan sekadar melihat. Urutan seksinya
> disengaja dan menjadi sasaran tur berpandu, jadi tidak boleh digeser bebas.

## Dua wujud: hari pertama, lalu seterusnya

Beranda punya dua susunan; yang dipilih ditentukan keadaan perusahaan.

**Wujud hari pertama** (belum ada satu pun penjualan, penerimaan kas, maupun
gerakan stok; `isFirstRun` di `src/lib/first-steps.ts`): Aksi Cepat →
Langkah Pertama. Tidak ada seksi angka sama sekali.

Alasannya: susunan penuh pada perusahaan tanpa data menampilkan tiga kartu
Ringkasan berisi Rp 0, sembilan kartu angka berisi 0, dan dua empty state yang
berada di dalam badan tabel. Layar itu terbaca sebagai "ada yang rusak", dan
tak satu pun angka nol di sana memberitahu pembacanya apa yang harus dikerjakan.

- **Langkah Pertama menggantikan Alur Kerja.** Keduanya
  daftar bernomor yang menjawab "mulai dari mana"; dua sekaligus membuat
  keduanya lebih mudah diabaikan. Alur Kerja kembali begitu wujud biasa kembali.
- **Isinya milik `src/lib/first-steps.ts`** (modul murni, teruji di
  `tests/i18n.test.ts` & `tests/first-steps.test.ts`). Jangan menambah baris
  langsung di halaman, sama seperti Aksi Cepat.
- **Kueri berat tidak dijalankan** pada wujud ini. Probe-nya tiga `count()`
  dan berjalan lebih dulu; bila hasilnya "baru", ringkasan laba/rugi, piutang,
  utang, saldo kas, gerakan stok, dan kontrak tak pernah ditanyakan.
- Peran tanpa satu pun langkah yang boleh dikerjakan tetap mendapat wujud
  biasa: panel kosong lebih buruk daripada seksi berisi nol yang setidaknya
  punya empty state.
- **Tur Beranda tidak diputar otomatis di sini** (`data-tour-suppress="beranda"`).
  Ia menjelaskan Ringkasan dan seksi angka yang justru tidak dirender. Turnya
  belum ditandai "sudah dilihat", jadi ia berjalan sendiri pada kunjungan
  pertama ke beranda yang sudah berisi. Menu Bantuan tetap bisa memutarnya.

Aturan di bawah berlaku untuk wujud biasa.

## Aturan (meng-override / menambah MASTER.md)

- **Urutan seksi tetap:** Aksi Cepat → Alur Kerja → peringatan stok → Ringkasan
  bahasa sehari-hari → Stok Barang → Kas & Bank → Penjualan & Kontrak. Aksi
  Cepat selalu paling atas karena beranda adalah titik berangkat pekerjaan.
- **Setiap seksi berisi angka + daftar terbaru, tanpa grafik.** Isinya kartu
  angka yang bisa diklik ke sumbernya dan satu tabel ringkas; lihat "Grafik
  tidak tinggal di sini" di bawah.
- **Aksi Cepat disaring per peran di server** (`quickActionsForRole`), bukan
  disembunyikan CSS. Tombol yang tak boleh dipakai peran itu tidak pernah
  dikirim ke browser. Daftarnya milik `src/lib/quick-actions.ts` (teruji di
  `tests/quick-actions.test.ts`); jangan menambah tombol langsung di halaman.
- **Ringkasan memakai bahasa sehari-hari** (Uang Masuk / Uang Keluar / Selisih),
  bukan istilah akuntansi; setiap kartu wajib menaut ke laporan sumbernya agar
  angkanya selalu bisa dicek.
- **Visibilitas per peran:** seksi Kas & Bank dan Penjualan & Kontrak hanya
  peran kantor (Direktur Utama, Manajer Keuangan, Administrator); kartu
  untung/rugi hanya peran berakses penuh (Direktur Utama & Administrator);
  Kepala Gudang melihat beranda berfokus stok.
  Query seksi yang tersembunyi tidak dijalankan sama sekali (hasilnya tidak sekadar dibuang).
- **Anchor tur wajib dipertahankan:** `data-tour="aksi-cepat"` dan
  `data-tour="ringkasan"` dipakai tur "Kenalan dengan Beranda"
  (`src/lib/tours.ts`). Mengubah/memindah seksi = perbarui juga tur & tesnya.

## Grafik tidak tinggal di sini

Kelima grafik dipindah dari beranda ke halaman yang angkanya dijelaskan:

| Grafik | Sekarang di |
| --- | --- |
| Kondisi stok (donat) | `/inventory` |
| Stok terbanyak (batang) | `/inventory` |
| Uang masuk & keluar per mata uang | `/reports/cash-flow` |
| Status kontrak (donat) | `/contracts` |
| Aktivitas bulanan | `/contracts` |

Alasannya:

1. **Grafik adalah permukaan *melihat*.** Beranda adalah titik berangkat
   pekerjaan; grafik yang berdiri sendiri di sana hanya bisa dipandangi. Di
   halaman tujuannya ia berdiri di sebelah baris yang menyusunnya, jadi
   angkanya bisa langsung dicek, sama seperti kartu Ringkasan.
2. **Ongkos muat halaman pertama.** `src/components/shared/dashboard-charts.tsx`
   adalah satu-satunya pemakai `recharts` di aplikasi ini. Selama ia diimpor
   dari beranda, seluruh pustaka grafik ikut termuat di halaman yang dibuka
   setiap pengguna, termasuk yang datang hanya untuk menekan satu tombol
   Aksi Cepat.

Beranda juga tidak lagi menjalankan kueri 6 bulan (kas, kontrak, tagihan) maupun hitungan status kontrak untuk
grafik. Halaman tujuan menghitung sendiri dari kueri yang sudah ia jalankan
bila memungkinkan (`/inventory` memakai ringkasan persediaan yang sudah ada),
dan bagian murni serinya dipakai bersama lewat `src/lib/chart-data.ts`.

Aturan yang ikut berlaku di halaman tujuan:

- **Warna donat per posisi, bukan per teks label.** Urutan data wajib
  aman → menipis → habis dan sah → menunggu → dibatalkan. Peta warna berkunci
  teks pernah membuat semua irisan abu-abu begitu labelnya ikut bahasa
  pengguna.
- **Warna grafik dari token AntD, dan warna seri memakai token uang #186**
  (issue #202). Sebabnya: recharts juga memakai warna seri sebagai teks.
  `Pie` menyalin `fill` irisan ke label "Aman 62%", dan tooltip
  bawaannya mewarnai tiap barisnya dengan warna serinya. `colorSuccess` bawaan
  AntD berada di 2,08:1 di sana. Yang tanpa arah (hitungan, kuantitas) memakai
  biru/emas, bukan hijau; hijau di aplikasi ini berarti "uang masuk".
  Tooltip recharts wajib diberi `contentStyle`: bawaannya `#fff` tetap,
  sehingga muncul kotak putih di halaman gelap. Dikunci `tests/chart-tokens.test.tsx`.
- **Izin dulu, baru kueri.** Aturan "kueri seksi tersembunyi tidak dijalankan"
  ikut pindah: `/contracts` tidak mengambil baris tagihan (dan tidak merender
  Aktivitas bulanan) tanpa `invoice.read` efektif; `/reports/cash-flow` tidak
  membaca buku kas tanpa `cash.read` efektif, izin yang berbeda dari
  `report.read` penjaga halamannya.

## Jangan

- Menambah kartu KPI berjargon akuntansi tanpa padanan bahasa sehari-hari.
- Menaruh seksi baru di atas Aksi Cepat.
- Mengembalikan grafik ke beranda, termasuk versi "kecil saja" atau
  "satu saja". Grafik baru masuk ke halaman yang angkanya dijelaskan.
