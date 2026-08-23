# `/docs` — permukaan dokumentasi

> Berlaku untuk `src/app/(app)/(docs)/**` + `src/components/docs/**`.
> Tabel dimensi induknya di `MASTER.md` §Dokumentasi; berkas ini **meng-override**
> MASTER pada hal-hal yang disebut di bawah. Alasan bentuk aslinya di issue #300,
> pembenahan tata letak & pencarian di issue #453.

## Yang tidak berubah dari #300

| Dimensi | Nilai | Kenapa |
|---|---|---|
| Langit-langit tipografi | `fontSizeHeading2` (30px) | di BAWAH langit-langit app (38px) — permukaan yang judulnya lebih kecil dari judul app tidak akan pernah terbaca sebagai halaman jualan |
| Tombol berisi penuh | **nol** | dokumentasi tidak memajukan apa pun (§Aksi utama per layar: "nol juga sah") |
| Kolom baca | **lebar penuh** | batas 768px dicabut 23 Agu 2026 (keputusan pemilik) — lihat §Lebar di bawah |
| Irama antar-blok | 24px (`--ant-margin-lg`) | irama app, bukan irama pemasaran |
| Prosa | bahasa Indonesia, kerangka trilingual | keputusan 3 #300 — pembaca `en`/`zh` mendapat pemberitahuan dalam bahasanya sendiri |

## Lebar

**Dokumentasi memakai lebar penuh area yang tersedia** (keputusan pemilik,
23 Agu 2026). Yang dicabut: batas kolom baca 768px yang berlaku sejak #300.

Alasan batas lama, ditulis di sini supaya keputusannya bisa ditinjau ulang
dengan bahan yang sama: di atas ±75 karakter per baris, mata kehilangan awal
baris berikutnya saat kembali dari ujung kanan, dan kalimat berhenti bisa
dipindai sekali lihat. Konsekuensi yang berlaku sekarang: di monitor lebar satu
baris prosa bisa memuat ±200 karakter.

Mengembalikannya = satu `maxWidth` di `KOLOM_BACA` (`docs-shell.tsx`) + baris
§Dokumentasi di `MASTER.md`. Penjaga menolak lebar skala-kolom (≥600px) yang
diketik di luar berkas itu — supaya batasnya tidak pernah hidup di satu kulit
saja.

## Tata letak (#453)

Tiga kolom, satu simpul DOM, tiga bentuk (kolom baca mengisi sisa ruang):

```
container ≥1160px   [ daftar halaman 220 ][ kolom baca …sisa… ][ di halaman ini 200 ]
container ≥900px    [ daftar halaman 220 ][ di halaman ini            ]
                    [                    ][ kolom baca …sisa…        ]
container <900px    [ di halaman ini ]
                    [ kolom baca     ]
```

**Titik patahnya `@container`, bukan `@media` — dan itu inti keputusannya.**
Di kulit aplikasi `PlatformShell` sudah memakan ±240px untuk menunya sendiri,
jadi layar 1200px hanya menyisakan ±950px untuk dokumentasi. Aturan `@media`
akan memasang tiga kolom di sana dan memeras kolom baca menjadi ±460px —
setengah lebar yang diikat MASTER. `container-type: inline-size` dipasang di
`BINGKAI_DOKUMENTASI`, yang dipasang KEDUA kulit; `@container` menanyakan lebar
yang benar-benar tersedia, jadi satu aturan melayani keduanya tanpa bercabang.

- **Kolom kiri & kanan lengket** (`position:sticky` + `align-self:start`).
- **Kolom kiri tidak dirender di bawah 900px** — bukan disembunyikan lalu tetap
  dikirim: markup yang tetap ada dibaca sebagai navigasi kedua oleh sebagian
  pembaca layar. Di lebar sempit jalannya tetap daftar isi `/docs` + pengalih
  Sebelumnya/Berikutnya.
- **Bilah kepala kulit publik sejajar BINGKAI** — keduanya lebar penuh, jadi
  lambang di kiri berdiri tepat di atas daftar halaman.
- Semua aturan hidup di SATU blok `<style href precedence>` di `docs-shell.tsx`,
  menyasar `data-docs-*`. ⚠ Properti yang berubah per titik patah **tidak boleh**
  juga ditulis sebaris — gaya sebaris mengalahkan blok itu.

## Pencarian

**`<form action="/docs/cari" method="get">`, hasil dirender server, nol JavaScript.**
Bukan penghematan: hasilnya menjadi ALAMAT — bisa ditautkan, dibagikan, dibuka
dari riwayat. Kotak cari ber-JavaScript yang menampilkan hasil "di tempat"
kehilangan keempatnya.

- Indeks dibangun dari `DOC_BLOCKS` saat modul dimuat (`lib/docs-search.ts`),
  bukan dari pustaka pencarian: yang dicari 13 halaman yang SUDAH data bertipe.
  Pagefind bahkan tidak bisa dipakai — ia mengindeks HTML hasil build, sementara
  `/docs` `force-dynamic`.
- **Semua kata harus ada (DAN, bukan ATAU).** Pada korpus sekecil ini ATAU
  mengembalikan hampir seluruh dokumentasi untuk setiap kueri dua kata.
- Bobot: judul 8 · ringkas 4 · sub-judul 3 · badan 1. Hasil menunjuk **bagian**
  (`#jangkar`) bila kecocokan terkuatnya ada di sebuah sub-bagian.
- Cuplikan keluar sebagai potongan `{ teks, cocok }`, **bukan** string ber-HTML —
  perendernya tidak pernah memakai `dangerouslySetInnerHTML`.
- `<mark>` bertoken (`colorWarningBg`) + bobot 600: sorotan tidak pernah warna saja.
- `/docs/cari` **`robots: noindex`** — isinya ditentukan pengunjung, dan ribuan
  varian `?q=` menenggelamkan halaman yang menjawab pertanyaannya.
- Isian & tombolnya `<input>`/`<button>` telanjang bertoken app, satu-satunya
  pengecualian `<button>` mentah di permukaan ini (terdaftar di
  `RAW_BUTTON_ALLOWLIST` dengan alasannya).

## Blok isi

| Blok | Bentuk |
|---|---|
| `paragraf` | 16px/1,75 |
| `sub` | 20px/600, **`marginTop` 32px** — satu-satunya lampauan irama 24px, sebab sub-judul berjarak 12px berdiri lebih dekat ke paragraf DI ATASNYA daripada ke miliknya sendiri |
| `poin` | jarak butir 8px |
| `catatan` | dua nada: `info` (bawaan) dan `peringatan` (tepi/latar warning **+ kata "Perhatikan:"**) — warna tidak pernah penanda tunggal |
| `kode` | `<pre>` monospace, `tab-size:2`, bergulung sendiri, label bahasa 12px |
| `langkah` | `<ol>`, penomoran dari peramban — dipakai HANYA untuk yang urutannya berarti; sisanya tetap `poin` |
| `diagram` | gambar mekanisme + `<figcaption>`; lihat §Gambar mekanisme |
| `istilah` | dibaca dari `TERMS`, tidak pernah disalin |
| `matriks-izin`, `endpoint-api` | dibangkitkan saat render dari `authz.ts` / `api-v1-spec.ts` |

**Waktu baca** dihitung dari jumlah kata bloknya (200 kata/menit, dibulatkan ke
atas, minimum 1) — bukan diketik.

## Gambar mekanisme (#453 Tahap 3)

**HTML, bukan SVG — dan itu perubahan dari rencana awal berkas ini.** SVG
ber-`viewBox` menskalakan seluruh isinya mengikuti lebar kotak, termasuk
hurufnya: di kolom baca ponsel 320px, teks 14 satuan di dalam `viewBox` 560
mendarat sebagai ±7px. Benar tergambar, tidak terbaca — dan tidak terlihat
sebagai cacat di layar pengembang. Bentuk HTML (kotak + panah + kisi) mengalir
mengikuti lebar, hurufnya tetap huruf halaman pada ukuran yang sama, warnanya
token yang sama, tema gelap gratis, dan pembaca layar membacanya sebagai TEKS.

- Setiap gambar `<figure>` + `<figcaption>`; keterangannya **prosa di
  `docs-content.ts`**, bukan di komponennya — ia yang dibaca orang yang tidak
  melihat gambarnya, jadi ia harus berdiri sendiri sebagai kalimat.
- Panah `aria-hidden`; arah dibaca dari urutan teksnya. Bentuknya berganti
  →/↓ mengikuti arah tumpukan.
- **Gambar adalah WADAHNYA SENDIRI** (`container-type: inline-size` di
  `<figure>`): titik patahnya menanyakan lebar gambar, bukan lebar bingkai
  halaman — bingkai selebar 1200px memberi kolom baca ±760px saat tiga kolom
  tampil dan ±960px saat hanya dua.
- ⚠ Gambar TIDAK BOLEH mengklaim apa pun yang tidak dikatakan prosanya. Angka
  contoh jurnal (100 juta · 11% · 111 juta) adalah angka yang sudah tertulis di
  halaman `mesin-akuntansi`.
- Tiga yang ada: `alur-jurnal`, `alur-persetujuan`, `buku-per-pt`. Nama yang
  tidak punya perender ditolak `tsc`; perender yang tidak dipakai ditolak tes.

## Penjaga

`tests/docs.test.ts` menolak: daftar impor di luar daftar-IZIN, `--sai-landing-*`,
`fontSizeHeading1`, tombol berisi penuh, `<main>` ganda, lebar skala-kolom
(≥600px) yang diketik di luar `docs-shell.tsx`, definisi kamus yang disalin ke prosa, **daftar halaman/TOC yang
diketik alih-alih dibangkitkan**, indeks pencarian yang kehilangan halaman,
jangkar hasil cari yang tidak dirender, slug `cari` yang menutupi halaman
pencarian, dan **satu pun `"use client"` di permukaan ini** (termasuk komponen
klien mana pun di `src/` yang mengimpor isi dokumentasi).

## Batas yang diketahui, bukan yang terlupa

- **Tidak ada sorotan "bagian yang sedang dibaca" di TOC** — menuntut
  `IntersectionObserver`, yaitu modul klien pertama di permukaan nol JS.
- **Tidak ada kolom kiri di bawah 900px** (lihat di atas).
- **Blok bangkitan tidak ikut terindeks** pencarian: isinya baru ada saat render,
  dan meratakannya ke indeks berarti menyalin daftar yang justru dibangkitkan
  supaya tidak pernah disalin. Halaman API tetap ditemukan lewat prosanya.
- **Gambar hanya untuk MEKANISME.** "Tanpa tangkapan layar" (keputusan 5 #300)
  tetap berlaku penuh: aturan itu menyasar gambar TOMBOL, yang berpindah tiap
  rilis dan membuat dokumennya berbohong tanpa satu baris pun disunting. Gambar
  mesin tidak berubah karena tata letak halaman berubah.
