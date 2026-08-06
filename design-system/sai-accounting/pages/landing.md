# Halaman Pendaratan `/` — override MASTER.md

> Berlaku HANYA untuk `/` (`src/app/page.tsx` + `src/components/landing/**`).
> Untuk halaman lain, MASTER.md tetap berlaku apa adanya.

## Kenapa halaman ini perlu override

MASTER.md dikurasi untuk **app akuntansi internal**, dan §Anti-Patterns
menolak gaya landing/marketing — dengan kualifikasi yang menentukan: *"…**di
app internal**"*. Halaman ini bukan app internal. Ia satu-satunya permukaan
yang dibaca orang yang **belum punya akun**, dan sebelum halaman ini ada,
orang itu disambut formulir kata sandi.

Karena itu yang di-override **hanya bentuknya**, bukan disiplinnya. Sejak
issue #245 bentuk itu tidak lagi ditulis sebagai kelas melainkan **dinyatakan
sebagai token** dan **dipagari tes** — lihat MASTER.md §Pemasaran vs App.

## Yang DILONGGARKAN di halaman ini

| MASTER.md | Di sini |
|---|---|
| Tanpa hero / CTA | Hero + CTA **boleh** — itu memang tugas halaman ini. Ukurannya `--sai-landing-font-size-hero` (≈53px di ≥576px), satu-satunya teks di aplikasi ini yang melampaui `fontSizeHeading1` |
| `PageHeader` wajib untuk judul | **Tidak berlaku**: `PageHeader` membawa breadcrumb & kerangka dasbor. Halaman ini menulis `<h1>` sendiri, satu buah, di hero |
| Density 6/10 (nyaman untuk data) | Lebih longgar — `--sai-landing-rhythm` (64px → 96px) antar-seksi. Tidak ada tabel data di sini |
| Lebar penuh area kerja | Kolom baca dikurung: 72rem per seksi, 42rem per kolom teks, keduanya di tengah |

## Bagaimana bentuk itu ditulis (bukan lagi kelas)

- **Nol `className`.** Seluruh halaman memakai gaya sebaris + `var(--ant-…)`;
  keadaan yang tidak bisa ditulis sebaris (`@media`, `:hover`, `:focus`,
  `details[open]`, `prefers-reduced-motion`) hidup di satu blok `<style>` yang
  dipasang `LandingShell`, menyasar atribut `data-landing-*`.
- **Satu titik patah: 576px** (`screenSM` AntD), bukan 640px (`sm:` Tailwind).
- **Skala pemasaran = `--sai-landing-*`**, dideklarasikan HANYA di dalam
  `[data-landing]` dan seluruhnya turunan token AntD, kecuali tiga lebar baca.
  Menyalinnya ke halaman internal tidak menghasilkan apa-apa.
- **Seksi lewat `LandingSection`/`LandingSectionIntro`** — irama, lebar, garis
  pemisah, dan jarak jangkar (`scroll-margin-top` = tinggi bilah menempel)
  datang dari satu tempat, bukan diulang di enam berkas.

## Yang TETAP BERLAKU PENUH (jangan tawar)

- **Primitif** — tombol lewat `Button` (ikon `size="icon"`), kartu lewat `Card`.
  Dijaga `tests/design-system-primitives.test.ts` (lingkupnya mencakup
  `src/components`, jadi `src/components/landing/**` ikut terjaga).
- **Ikon `@ant-design/icons`**, ukuran lewat `fontSize`, dekoratif `aria-hidden`,
  tanpa emoji.
- **Target sentuh ≥ 40px** — CTA hero memakai `size="lg"` (48px).
- **Kontras ≥ 4.5:1** dan **fokus keyboard terlihat**; ada tautan lewati-ke-isi
  sebelum bilah atas.
- **Teks penting ≥ 14px** — catatan harga memakai `--ant-font-size` eksplisit,
  bukan `<small>` (latar dokumen 16px ⇒ `<small>` = 12,8px).
- **Dua tema.** Latar halaman `colorBgContainer`, pita seksi
  `colorFillQuaternary` (translusen, bekerja di kedua tema), dan setiap
  pembatas bidang punya `border`.
- **Nama produk lewat `APP_NAME`**, lambang lewat `BrandMark` — bukan literal.
- **Trilingual.** Semua teks lewat kunci `landing.*` di ketiga kamus; kunci yang
  hilang ditolak `tsc`.
- **Tetap server component.** Halaman pertama bagi pengunjung tanpa sesi;
  `AMBANG_KLIEN` di `tests/rsc-boundary.test.ts` yang menguncinya. Dua daun
  client (`LocaleToggle`, `ThemeToggle`) tidak menarik apa pun di atasnya.

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
- **Nominal paket tidak dibesarkan ke skala hero.** Yang paling besar di
  halaman ini adalah kalimat yang menjelaskan produknya; halaman yang angkanya
  lebih besar dari janjinya menjual harga, bukan pekerjaan.
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
