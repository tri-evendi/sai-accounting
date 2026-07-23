# Override per Halaman — `pages/<page-name>.md`

> Konvensi dari MASTER.md: saat membangun/mengubah halaman tertentu, cek dulu
> file `pages/<page-name>.md`-nya. **Jika ada, aturannya meng-override MASTER.md**
> untuk halaman itu saja. Jika tidak ada, MASTER.md berlaku penuh.

## Kapan sebuah halaman butuh file override

Buat file HANYA bila halaman punya aturan yang **menyimpang dari atau menambah**
MASTER.md dan aturan itu pernah/berisiko dilanggar. Contoh yang layak: komposisi
seksi yang urutannya disengaja, aturan tampilan nilai yang tidak umum, anchor tur
yang wajib dipertahankan. Jangan membuat file yang hanya mengulang isi MASTER.md
— file kosong makna begitu justru menyesatkan pembaca berikutnya.

## Penamaan

Nama file = segmen rute halamannya, tanpa garis miring awal, `/` diganti `-`:
`/dashboard` → `dashboard.md`, `/approvals` → `approvals.md`,
`/inventory/opname` → `inventory-opname.md`.

## Format isi

```markdown
# <Judul halaman> — `<rute>`

> Satu kalimat: kenapa halaman ini punya aturan sendiri.

## Aturan (meng-override / menambah MASTER.md)
- Aturan konkret yang bisa diperiksa, satu per butir.

## Jangan
- Anti-pattern spesifik halaman ini (bila ada).
```

Tulis aturan yang **bisa diverifikasi** ("Aksi Cepat selalu seksi pertama"),
bukan selera ("harus terasa rapi"). Bila aturannya sudah dijaga tes, sebut nama
tesnya supaya pembaca tahu pelanggaran akan ketahuan otomatis.
