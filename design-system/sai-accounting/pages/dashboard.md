# Beranda — `/dashboard`

> Beranda dipakai untuk *mengerjakan*, bukan sekadar melihat — urutan seksinya
> disengaja dan menjadi sasaran tur berpandu, jadi tidak boleh digeser bebas.

## Aturan (meng-override / menambah MASTER.md)

- **Urutan seksi tetap:** Aksi Cepat → peringatan stok → Ringkasan bahasa
  sehari-hari → Stok Barang → Kas & Bank → Penjualan & Kontrak. Aksi Cepat
  selalu paling atas karena beranda adalah titik berangkat pekerjaan.
- **Aksi Cepat disaring per peran di server** (`quickActionsForRole`), bukan
  disembunyikan CSS — tombol yang tak boleh dipakai peran itu tidak pernah
  dikirim ke browser. Daftarnya milik `src/lib/quick-actions.ts` (teruji di
  `tests/quick-actions.test.ts`), jangan menambah tombol langsung di halaman.
- **Ringkasan memakai bahasa sehari-hari** (Uang Masuk / Uang Keluar / Selisih),
  bukan istilah akuntansi; setiap kartu wajib menaut ke laporan sumbernya agar
  angkanya selalu bisa dicek.
- **Visibilitas per peran:** seksi Kas & Bank dan Penjualan & Kontrak hanya
  bos+core; kartu untung/rugi hanya bos; ptg melihat beranda berfokus stok.
  Query seksi yang tersembunyi tidak boleh dijalankan (bukan hasilnya dibuang).
- **Anchor tur wajib dipertahankan:** `data-tour="aksi-cepat"` dan
  `data-tour="ringkasan"` dipakai tur "Kenalan dengan Beranda"
  (`src/lib/tours.ts`). Mengubah/memindah seksi = perbarui juga tur & tesnya.

## Jangan

- Menambah kartu KPI berjargon akuntansi tanpa padanan bahasa sehari-hari.
- Menaruh seksi baru di atas Aksi Cepat.
