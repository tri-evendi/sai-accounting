# `/docs` — permukaan dokumentasi

> Berlaku untuk `src/app/(app)/(docs)/**` + `src/components/docs/**`.
> Tabel dimensi induknya di `MASTER.md` §Dokumentasi; berkas ini meng-override
> MASTER pada hal-hal yang disebut di bawah. Alasan bentuk aslinya di issue #300,
> pembenahan tata letak & pencarian di issue #453.

## Yang tidak berubah dari #300

| Dimensi | Nilai | Kenapa |
|---|---|---|
| Langit-langit tipografi | `fontSizeHeading2` (30px) | di bawah langit-langit app (38px); permukaan yang judulnya lebih kecil dari judul app tidak terbaca sebagai halaman jualan |
| Tombol berisi penuh | nol | dokumentasi tidak memajukan apa pun (§Aksi utama per layar: "nol juga sah") |
| Kolom baca | lebar penuh | batas 768px dicabut 23 Agu 2026 (keputusan pemilik); lihat §Lebar di bawah |
| Irama antar-blok | 24px (`--ant-margin-lg`) | irama app, bukan irama pemasaran |
| Prosa | bahasa Indonesia, kerangka trilingual | keputusan 3 #300; pembaca `en`/`zh` mendapat pemberitahuan dalam bahasanya sendiri |

## Lebar

Dokumentasi memakai lebar penuh area yang tersedia (keputusan pemilik,
23 Agu 2026). Batas kolom baca 768px yang berlaku sejak #300 dicabut.

Alasan batas lama, dicatat untuk peninjauan ulang: di atas ±75 karakter per baris, mata kehilangan awal
baris berikutnya saat kembali dari ujung kanan, dan kalimat berhenti bisa
di-scan sekali lihat. Akibatnya kini: di monitor lebar satu baris prosa bisa
memuat ±200 karakter.

Untuk mengembalikannya: satu `maxWidth` di `KOLOM_BACA` (`docs-shell.tsx`) + baris
§Dokumentasi di `MASTER.md`. Guard menolak lebar skala-kolom (≥600px) yang
diketik di luar berkas itu, supaya batasnya tidak hanya berlaku di satu kulit.

## Tata letak (#453)

Tiga kolom, satu simpul DOM, tiga bentuk (kolom baca mengisi sisa ruang):

```
container ≥1160px   [ daftar halaman 220 ][ kolom baca …sisa… ][ di halaman ini 200 ]
container ≥900px    [ daftar halaman 220 ][ di halaman ini            ]
                    [                    ][ kolom baca …sisa…        ]
container <900px    [ di halaman ini ]
                    [ kolom baca     ]
```

**Titik patahnya `@container`, bukan `@media`.**
Di kulit aplikasi `PlatformShell` sudah memakan ±240px untuk menunya sendiri,
jadi layar 1200px hanya menyisakan ±950px untuk dokumentasi. Aturan `@media`
akan memasang tiga kolom di sana dan memeras kolom baca menjadi ±460px,
setengah lebar yang diikat MASTER. `container-type: inline-size` dipasang di
`BINGKAI_DOKUMENTASI`, yang dipasang kedua kulit; `@container` menanyakan lebar
yang benar-benar tersedia, jadi satu aturan melayani keduanya tanpa bercabang.

- **Kolom kiri & kanan lengket** (`position:sticky` + `align-self:start`).
- **Kolom kiri tidak dirender di bawah 900px** (tidak sekadar disembunyikan):
  markup yang tetap dikirim dibaca sebagai navigasi kedua oleh sebagian
  pembaca layar. Di lebar sempit jalannya tetap daftar isi `/docs` + pengalih
  Sebelumnya/Berikutnya.
- **Bilah kepala kulit publik sejajar bingkai.** Keduanya lebar penuh, jadi
  lambang di kiri berdiri tepat di atas daftar halaman.
- Semua aturan ada di satu blok `<style href precedence>` di `docs-shell.tsx`,
  menyasar `data-docs-*`. Properti yang berubah per titik patah tidak boleh
  juga ditulis sebaris, karena gaya sebaris mengalahkan blok itu.

## Pencarian

**`<form action="/docs/cari" method="get">`, hasil dirender server, nol JavaScript.**
Alasannya: hasil pencarian menjadi alamat yang bisa ditautkan, dibagikan, dan
dibuka dari riwayat. Kotak cari ber-JavaScript yang menampilkan hasil "di tempat"
kehilangan semua itu.

- Indeks dibangun dari `DOC_BLOCKS` saat modul dimuat (`lib/docs-search.ts`),
  bukan dari pustaka pencarian: yang dicari halaman-halaman yang sudah berupa data bertipe.
  Pagefind tidak bisa dipakai: ia mengindeks HTML hasil build, sementara
  `/docs` `force-dynamic`.
- **Semua kata harus ada (AND, bukan OR).** Pada korpus sekecil ini OR
  mengembalikan hampir seluruh dokumentasi untuk setiap kueri dua kata.
- Bobot: judul 8 · ringkas 4 · sub-judul 3 · badan 1. Hasil menunjuk bagian
  (`#jangkar`) bila kecocokan terkuatnya ada di sebuah sub-bagian.
- Cuplikan keluar sebagai potongan `{ teks, cocok }`, bukan string ber-HTML;
  perendernya tidak pernah memakai `dangerouslySetInnerHTML`.
- `<mark>` bertoken (`colorWarningBg`) + bobot 600: sorotan tidak pernah warna saja.
- `/docs/cari` `robots: noindex`: isinya ditentukan pengunjung, dan ribuan
  varian `?q=` menenggelamkan halaman yang menjawab pertanyaannya.
- Isian & tombolnya `<input>`/`<button>` telanjang bertoken app, satu-satunya
  pengecualian `<button>` mentah di permukaan ini (terdaftar di
  `RAW_BUTTON_ALLOWLIST` dengan alasannya).

## Blok isi

| Blok | Bentuk |
|---|---|
| `paragraf` | 16px/1,75 |
| `sub` | 20px/600, `marginTop` 32px; satu-satunya lampauan irama 24px, sebab sub-judul berjarak 12px berdiri lebih dekat ke paragraf di atasnya daripada ke miliknya sendiri |
| `poin` | jarak butir 8px |
| `catatan` | dua nada: `info` (bawaan) dan `peringatan` (tepi/latar warning + kata "Perhatikan:"); warna tidak pernah penanda tunggal |
| `kode` | `<pre>` monospace, `tab-size:2`, bergulung sendiri, label bahasa 12px |
| `langkah` | `<ol>`, penomoran dari peramban; dipakai hanya untuk yang urutannya berarti; sisanya tetap `poin` |
| `diagram` | gambar mekanisme + `<figcaption>`; lihat §Gambar mekanisme |
| `istilah` | dibaca dari `TERMS`, tidak pernah disalin |
| `matriks-izin`, `endpoint-api` | dibangkitkan saat render dari `authz.ts` / `api-v1-spec.ts` |

**Waktu baca** dihitung dari jumlah kata bloknya (200 kata/menit, dibulatkan ke
atas, minimum 1), tidak diketik.

## Gambar mekanisme (#453 Tahap 3)

**HTML, bukan SVG** (berubah dari rencana awal). SVG ber-`viewBox` menskalakan
seluruh isinya mengikuti lebar kotak, termasuk hurufnya: di kolom baca ponsel
320px, teks 14 satuan di dalam `viewBox` 560 menjadi ±7px dan tidak terbaca,
sementara di layar pengembang terlihat wajar. Bentuk HTML (kotak + panah + kisi) mengalir
mengikuti lebar, hurufnya tetap huruf halaman pada ukuran yang sama, warnanya
token yang sama, tema gelap gratis, dan pembaca layar membacanya sebagai teks.

- Setiap gambar `<figure>` + `<figcaption>`; keterangannya prosa di
  `docs-content.ts`, bukan di komponennya. Keterangan itu yang dibaca orang yang tidak
  melihat gambarnya, jadi ia harus berdiri sendiri sebagai kalimat.
- Panah `aria-hidden`; arah dibaca dari urutan teksnya. Bentuknya berganti
  →/↓ mengikuti arah tumpukan.
- **Gambar adalah wadahnya sendiri** (`container-type: inline-size` di
  `<figure>`): titik patahnya menanyakan lebar gambar, bukan lebar bingkai
  halaman. Bingkai selebar 1200px memberi kolom baca ±760px saat tiga kolom
  tampil dan ±960px saat hanya dua.
- Gambar tidak boleh mengklaim apa pun yang tidak dikatakan prosanya. Angka
  contoh jurnal (100 juta · 11% · 111 juta) adalah angka yang sudah tertulis di
  halaman `mesin-akuntansi`.
- Tiga yang ada: `alur-jurnal`, `alur-persetujuan`, `buku-per-pt`. Nama yang
  tidak punya perender ditolak `tsc`; perender yang tidak dipakai ditolak tes.

## Guard

`tests/docs.test.ts` menolak: daftar impor di luar daftar-IZIN, `--sai-landing-*`,
`fontSizeHeading1`, tombol berisi penuh, `<main>` ganda, lebar skala-kolom
(≥600px) yang diketik di luar `docs-shell.tsx`, definisi kamus yang disalin ke prosa, daftar halaman/TOC yang
diketik alih-alih dibangkitkan, indeks pencarian yang kehilangan halaman,
jangkar hasil cari yang tidak dirender, slug `cari` yang menutupi halaman
pencarian, dan satu pun `"use client"` di permukaan ini (termasuk komponen
klien mana pun di `src/` yang mengimpor isi dokumentasi).

## Batas yang diketahui, bukan yang terlupa

- **Tidak ada sorotan "bagian yang sedang dibaca" di TOC.** Ia menuntut
  `IntersectionObserver`, yaitu modul klien pertama di permukaan nol JS.
- **Tidak ada kolom kiri di bawah 900px** (lihat di atas).
- **Blok bangkitan tidak ikut terindeks** pencarian: isinya baru ada saat render,
  dan meratakannya ke indeks berarti menyalin daftar yang justru dibangkitkan
  supaya tidak pernah disalin. Halaman API tetap ditemukan lewat prosanya.
- **Tangkapan layar hanya yang DIBANGKITKAN (direvisi Okt 2026).** Keputusan 5
  #300 menolak tangkapan layar karena gambar tombol yang dibuat tangan menua
  diam-diam. Panduan bergambar menerimanya dengan pagar mesin, bukan disiplin:
  setiap gambar di `public/docs/screenshots/` lahir dari resep di
  `scripts/docs-screenshots.ts` (`bun run docs:screenshots`, data demo fiktif,
  1440×900, tema terang, bahasa `id`), dan `tests/docs-screenshots.test.ts`
  menjaga tiga arah — rujukan ↔ berkas ↔ resep. Blok `gambar` WAJIB ber-`alt`
  yang berdiri sendiri sebagai kalimat, dimuat malas, lebarnya mengikuti kolom
  baca, dan bertepi token supaya gambar terang tidak melayang di mode gelap.
  Gambar MEKANISME (blok `diagram`) tetap dipakai untuk menjelaskan mesinnya;
  tangkapan layar menyertai langkah-langkahnya, tidak menggantikan alasannya.
  Skrip penangkap butuh aplikasi yang berjalan dan karena itu bukan bagian
  `verify`/CI — jalankan ulang setiap kali layar yang tergambar berubah.
