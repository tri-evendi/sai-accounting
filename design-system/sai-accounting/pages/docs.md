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
| Kolom baca | **768px** | angka telanjang, preseden `/terms` & `/privacy`; ditulis SEKALI di `docs-shell.tsx` |
| Irama antar-blok | 24px (`--ant-margin-lg`) | irama app, bukan irama pemasaran |
| Prosa | bahasa Indonesia, kerangka trilingual | keputusan 3 #300 — pembaca `en`/`zh` mendapat pemberitahuan dalam bahasanya sendiri |

## Tata letak (#453)

Tiga kolom, satu simpul DOM, tiga bentuk:

```
container ≥1160px   [ daftar halaman 220 ][ kolom baca 768 ][ di halaman ini 200 ]
container ≥900px    [ daftar halaman 220 ][ di halaman ini            ]
                    [                    ][ kolom baca               ]
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
- **Bilah kepala kulit publik sejajar BINGKAI**, bukan kolom baca — sejak ada
  kolom kiri, lambang yang rata dengan kolom baca menggantung di tengah halaman.
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
| `istilah` | dibaca dari `TERMS`, tidak pernah disalin |
| `matriks-izin`, `endpoint-api` | dibangkitkan saat render dari `authz.ts` / `api-v1-spec.ts` |

**Waktu baca** dihitung dari jumlah kata bloknya (200 kata/menit, dibulatkan ke
atas, minimum 1) — bukan diketik.

## Penjaga

`tests/docs.test.ts` menolak: daftar impor di luar daftar-IZIN, `--sai-landing-*`,
`fontSizeHeading1`, tombol berisi penuh, `<main>` ganda, angka 768 di luar
`docs-shell.tsx`, definisi kamus yang disalin ke prosa, **daftar halaman/TOC yang
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
- **Belum ada diagram** (issue #453 Tahap 3): blok `langkah` + SVG skematik untuk
  tiga mekanisme (dokumen → jurnal → laporan, alur persetujuan, satu PT satu
  basis data). "Tanpa tangkapan layar" tetap berlaku — aturan itu menyasar gambar
  TOMBOL yang menua tiap rilis, bukan gambar MESIN.
