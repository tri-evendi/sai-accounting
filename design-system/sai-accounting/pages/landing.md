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
| Permukaan netral: halaman `colorBgLayout`, kartu `colorBgContainer` | **Bidang berwarna** — pita seksi & kartu berisi nada pekat `--sai-landing-band-*` / `-fill-*` / `-chip-*`. Lihat §Nada pekat di bawah |
| Satu aksi utama per layar (#267) | **Tidak berlaku**: halaman ini merender empat tombol berisi penuh sekaligus — bilah atas, hero, tiap kartu paket, penutup — dan itu memang bentuknya. **Batasnya**: keempatnya harus menuju tempat yang SAMA (`/register`), sebab yang sah adalah satu ajakan yang diulang, bukan empat ajakan yang bersaing. Dijaga `tests/button-emphasis.test.ts`; alasan lengkapnya di MASTER.md §Aksi utama per layar |

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

## Nada pekat: kenapa halaman ini berwarna, dan sampai di mana

Keluhan pemilik atas halaman ini sama dengan keluhan yang melahirkan issue #266
di app internal — "dominan putih-hitam dengan outline saja" — ditambah satu
kalimat yang menentukan bentuk jawabannya: *"gunakan warna solid juga, jangan
hanya outline atau border saja."*

Itu berlawanan arah dengan pola yang memang benar untuk produk keuangan
(*Trust & Authority*: navy/abu korporat, biru kepercayaan, aksen HANYA untuk
CTA). Yang menyelesaikan tegangannya bukan kompromi jumlah warna melainkan
**perannya**: warna di sini membawa hierarki — mana wilayah, mana yang
disorot — bukan hiasan.

### Empat aturan yang membuat izin ini tidak berkembang jadi palet sendiri

1. **Empat hue, dan keempatnya tanpa arti di app ini**: biru merek, cyan,
   indigo (`geekblue`), violet (`purple`). **Hijau, merah, emas, jingga tidak
   dipakai sebagai nada dekoratif** — keempatnya sudah menjadi bahasa uang &
   status (`colorMoney*`, `colorSuccess`, `colorWarning`, `colorError`), dan
   pita hijau selebar layar di halaman yang menjual pembukuan terbaca sebagai
   pernyataan tentang angka.
2. **`color-mix()` di atas permukaan yang sedang berlaku, bukan anak tangga
   palet telanjang.** Tangga AntD (`--ant-blue-1` … `-10`) MEMBALIK di tema
   gelap, jadi `blue-1` gelap (`#111a2c`) praktis sewarna latar halaman gelap
   (`#141414`): pita yang lenyap di satu tema tanpa ada yang gagal. Resepnya
   satu — `color-mix(in srgb, var(--ant-<hue>-6) N%, var(--ant-color-bg-*))` —
   dan ia menjadi tint terang di tema terang dan tint gelap di tema gelap
   dengan sendirinya. Hasilnya **opak**; `colorFillQuaternary` yang digantikannya
   translusen 2–4% dan di layar praktis tidak ada.
3. **Kadar campurannya dibatasi tombol primer, bukan selera.** Isian tombol
   primer tema gelap (`#1668dc`) hanya berjarak 3,55:1 dari latar halaman, dan
   setiap tint memakan jarak itu. Karena itu pita berhenti di 10% (ajakan
   penutup 16%) — masih ≥3,11:1, jadi **pita boleh memikul tombol** — sedangkan
   `fill-*` (14%) dan `chip-*` (28%) sudah di bawah 3:1, jadi **tidak boleh ada
   tombol primer di atasnya**. Kartu paket karena itu berbadan
   `--sai-landing-surface` dan hanya KEPALANYA bernada.
4. **Warnai pitanya ATAU kartunya, tidak keduanya.** Nada di atas nada sehue
   saling meniadakan di tema terang (1,03:1). Kartu fitur bernada karena
   seksinya polos; kartu modul & paket berdiri di atas pita, jadi badannya
   `--sai-landing-surface` — dan **tepinya tidak boleh dicabut**: di tema gelap
   jenjang kartu-vs-pita hanya 1,01–1,06:1, yang memisahkan keduanya di sana
   adalah `colorBorderSecondary`.

### Nada `accent` dipakai TEPAT SEKALI

Ajakan penutup. Nada terkuat halaman kehilangan artinya kalau ia muncul dua
kali — dan hero, yang juga memakainya, memakainya sebagai UJUNG gradien, bukan
sebagai bidang rata.

### Yang DITOLAK karena melewati batas kepercayaan

- **Pita ajakan penutup berisi biru pekat dengan teks putih.** Terukur, dan ia
  gagal karena aritmetika, bukan selera: tangga biru membalik di tema gelap,
  jadi tidak ada SATU anak tangga yang bisa memikul teks putih di kedua tema
  (`blue-7` terang 6,16:1 tapi gelap ≈3,4:1; `blue-6` gelap 5,19:1 tapi terang
  4,10:1). Memaksanya berarti mencabang tema di dalam blok gaya pendaratan,
  yaitu mekanisme tema KEDUA di satu halaman.
- **Permukaan gelap permanen (`SIDER_BG_DARK`) sebagai pita penutup.** Bekerja
  untuk teksnya, tetapi isian tombol primer tema terang (`#0958d9`) di atasnya
  hanya 2,99:1 — angka yang sudah tercatat di `lib/theme/antd-tokens.ts` dan
  yang membuat `Menu` diberi tokennya sendiri. Tombol ajakan yang tidak bisa
  ditemukan sebagai bidang adalah harga yang terlalu mahal untuk sebuah pita.
- **Nada per kategori untuk kesepuluh kartu modul.** `BUSINESS_MODULES` tidak
  punya kategori; mengarangnya di halaman pemasaran adalah klaim tanpa sumber
  (§KLAIM HARUS PUNYA SUMBER), dan sepuluh hue berdampingan adalah konfeti,
  bukan hierarki.

### Penjaganya

`tests/landing-colors.test.ts` menghitung ulang setiap pasangan
teks-di-atas-warna dari token yang benar-benar terpasang dan dari resep
`color-mix` yang **diurai dari `LANDING_STYLE` itu sendiri** — bukan diketik
ulang di tes. Ia mengunci: teks ≥4,5:1 di kedua tema, isian tombol ≥3:1 pada
setiap permukaan yang memikulnya, glif ikon ≥3:1 di atas kotaknya, dan lantai
1,05:1 "nada ini benar-benar ada di layar". Ia juga mengunci batas terbalik —
bahwa `fill-*`/`chip-*` memang TIDAK layak memikul tombol — supaya pemisahan
badan/kepala kartu paket tidak dicabut tanpa sengaja.

## Yang TETAP BERLAKU PENUH (jangan tawar)

- **`variant` ditulis eksplisit di setiap `<Button>`** — pengecualian di atas
  membebaskan halaman ini dari BERAPA BANYAK primer, bukan dari menuliskannya.
  Bawaan `primary` akan dibalik ke `secondary` setelah audit #267 selesai;
  tombol pendaratan yang mengandalkan bawaan akan turun pada hari itu, dan
  halaman pemasaran kehilangan seluruh ajakannya tanpa satu diff pun menyebutnya.
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
- **Dua tema.** Latar halaman `colorBgContainer`; pita seksi lewat nada pekat
  (§Nada pekat), yang mengikuti tema karena resepnya dicampur ke permukaan yang
  sedang berlaku — bukan karena ada cabang tema di halaman ini. Setiap pembatas
  bidang tetap punya `border`, juga ketika nadanya sudah berbeda.
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
