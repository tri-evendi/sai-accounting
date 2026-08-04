# Halaman Pendaratan `/` — override MASTER.md

> Berlaku HANYA untuk `/` (`src/app/page.tsx` + `src/components/landing/**`).
> Untuk halaman lain, MASTER.md tetap berlaku apa adanya.

## Kenapa halaman ini perlu override

MASTER.md dikurasi untuk **app akuntansi internal**, dan §Anti-Patterns
menolak gaya landing/marketing — dengan kualifikasi yang menentukan: *"hero
raksasa, CTA 'Start trial' **di app internal**"*. Halaman ini bukan app
internal. Ia satu-satunya permukaan yang dibaca orang yang **belum punya
akun**, dan sebelum halaman ini ada, orang itu disambut formulir kata sandi.

Karena itu yang di-override **hanya bentuknya**, bukan disiplinnya.

## Yang DILONGGARKAN di halaman ini

| MASTER.md | Di sini |
|---|---|
| Tanpa hero / CTA | Hero + CTA **boleh** — itu memang tugas halaman ini |
| `PageHeader` wajib untuk judul | **Tidak berlaku**: `PageHeader` membawa breadcrumb & kerangka dasbor. Halaman ini menulis `<h1>` sendiri, satu buah, di hero |
| Density 6/10 (nyaman untuk data) | Lebih longgar — `py-16 sm:py-24` antar-bagian. Tidak ada tabel data di sini |

## Yang TETAP BERLAKU PENUH (jangan tawar)

- **Token semantik saja** — `bg-primary`, `text-muted-foreground`, `border-border`.
  Kelas palet mentah (`bg-blue-600`) ditolak lint (issue #54), termasuk di sini.
- **Primitif** — tombol lewat `Button` (ikon `size="icon"`), kartu lewat `Card`.
  Dijaga `tests/design-system-primitives.test.ts` (lingkupnya mencakup
  `src/components`, jadi `src/components/landing/**` ikut terjaga).
- **Ikon `lucide-react`**, tanpa emoji.
- **Target sentuh ≥ 40px** — CTA hero memakai `size="lg"` (48px).
- **Kontras ≥ 4.5:1** dan **fokus keyboard terlihat**; ada tautan lewati-ke-isi
  sebelum bilah atas.
- **Dua tema.** Latar halaman `bg-background` (bukan `bg-muted`), dan setiap
  pembatas bidang punya `border` — di tema gelap `--muted`/`--secondary` dan
  `--sidebar`/`--background` bernilai sama, jadi beda warna saja tidak terlihat.
- **Nama produk lewat `APP_NAME`**, lambang lewat `BrandMark` — bukan literal.
- **Trilingual.** Semua teks lewat kunci `landing.*` di ketiga kamus; kunci yang
  hilang ditolak `tsc`.

## Aturan khusus halaman ini: KLAIM HARUS PUNYA SUMBER

Halaman pemasaran adalah tempat paling mudah bagi angka untuk berbohong, dan
kebohongannya tidak berbunyi — ia hanya membuat orang mendaftar karena satu
angka lalu ditagih angka lain.

- **Harga & kuota** dari `activePlans()` (tabel `plans`), **bukan** diketik ke
  markup. `isActive: false` tidak ikut — paket yang ditarik masih dipakai
  pelanggan lama tapi tidak boleh ditawarkan lagi.
- **Harga adalah DPP.** `platformInvoiceAmounts()` menambahkan PPN di atasnya,
  jadi catatan PPN **wajib** ada, mengikuti sakelar (`PLATFORM_PPN_DISABLED`)
  dan tarif (`lib/tax.ts`) yang sama dengan yang menagih.
- **Lama uji coba** dari `TRIAL_DAYS`, konstanta yang sama yang menghitungnya.
- **Nama PT tidak pernah muncul di sini.** Pemasangan multi-PT belum bisa tahu
  tenant mana yang sedang datang; nilai cadangannya nama pemasang pertama —
  kesalahan yang sama yang dilarang MASTER §Orientasi Perusahaan untuk dokumen
  tercetak.
- **Tidak ada tombol yang menjanjikan lebih dari yang dikerjakan.** Tombol di
  kartu paket menuju `/register` **tanpa** `?plan=`: pendaftaran tidak menerima
  pilihan paket (setiap tenant lahir di paket `trial`), dan parameter yang tidak
  dibaca siapa pun terbaca sebagai janji bahwa paketnya sudah dipilih.
- **Klaim tanpa sumber di kode dilarang** — "tanpa kartu kredit", "gratis
  selamanya", jumlah pelanggan, logo perusahaan yang tidak memberi izin.
