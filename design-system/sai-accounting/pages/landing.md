# Halaman Pendaratan `/` — override MASTER.md

> Berlaku hanya untuk `/` dan `/pricing` (`src/app/(marketing)/**` +
> `src/components/landing/**`).
> Untuk halaman lain, MASTER.md tetap berlaku apa adanya.

## Kenapa halaman ini perlu override

MASTER.md dikurasi untuk app akuntansi internal. §Anti-Patterns menolak gaya
landing/marketing dengan kualifikasi *"…di app internal"*. Halaman ini bukan
app internal: ia satu-satunya permukaan yang dibaca orang yang belum punya
akun. Sebelum halaman ini ada, orang itu disambut formulir kata sandi.

Yang di-override hanya bentuknya, bukan disiplinnya. Sejak issue #245 bentuk
itu dinyatakan sebagai token dan dipagari tes (MASTER.md §Pemasaran vs App).

## Yang DILONGGARKAN di halaman ini

| MASTER.md | Di sini |
|---|---|
| Tanpa hero / CTA | Hero + CTA **boleh** — itu memang tugas halaman ini. Ukurannya `--sai-landing-font-size-hero`, satu-satunya teks di aplikasi ini yang melampaui `fontSizeHeading1`. Di bawah 576px `fontSizeHeading2` (30px); di ≥576px **FLUID** `clamp(1,1× … 3.6vw … 1,3×)` di atas `--ant-font-size-heading-1` (≈42px → ≈49px). ⚠ Langit-langit 1,3× sengaja: kolom kalimat hero hanya 45% (kerangka aplikasi memikul 55%), dan di atasnya judul ≤8 kata patah tiga baris |
| `PageHeader` wajib untuk judul | **Tidak berlaku**: `PageHeader` membawa breadcrumb & kerangka dasbor. Halaman ini menulis `<h1>` sendiri, satu buah, di hero |
| Density 6/10 (nyaman untuk data) | Lebih longgar — `--sai-landing-rhythm` (64px → 96px) antar-seksi. Tidak ada tabel data di sini |
| Lebar penuh area kerja | Kolom baca dikurung: 72rem per seksi, 42rem per kolom teks, keduanya di tengah |
| Permukaan netral: halaman `colorBgLayout`, kartu `colorBgContainer` | **Bidang berwarna** — pita seksi & kartu berisi nada pekat `--sai-landing-band-*` / `-fill-*` / `-chip-*`. Lihat §Nada pekat di bawah |
| Satu aksi utama per layar (#267) | **Tidak berlaku**: halaman ini merender empat tombol berisi penuh sekaligus — bilah atas, hero, tiap kartu paket, penutup — dan itu memang bentuknya. **Batasnya**: keempatnya harus menuju tempat yang SAMA (`/register`), sebab yang sah adalah satu ajakan yang diulang, bukan empat ajakan yang bersaing. Dijaga `tests/button-emphasis.test.ts`; alasan lengkapnya di MASTER.md §Aksi utama per layar |

## ⚠ KALIMATNYA BISA DITIMPA DARI KONSOL OPERATOR

Lewat halaman `/content` di konsol operator (`ops.saiaccounting.id`), setiap
kunci `landing.*` bisa diganti dari basis data tanpa rilis. Yang perlu
diketahui sebelum menyunting kamus atau menyimpulkan apa yang terbaca di
produksi:

- **Kamus tetap sumber bawaan.** `site_contents` (basis data platform) hanya
  memuat kalimat yang sudah diganti; baris yang tidak ada berarti "pakai
  bawaan". Platform mati → pendaratan tampil utuh dengan kalimat kamus.
- **`id.json` belum tentu sama dengan yang terbaca di `/` hari ini.** Kalau
  kalimat di produksi tidak cocok dengan kamus, periksa `/content` di konsol
  (bahasa + bagian) sebelum mencari bug render.
- **Penimpaan hanya berlaku di `/`, `/pricing`, `/status`**
  (`SITE_CONTENT_PATHS`). Ia dipasang satu kali di `getDictionary`, jadi
  komponen pendaratan baru ikut tanpa tambahan apa pun. Di luar ketiga jalur
  itu tidak ada query sama sekali.
- **Kunci baru otomatis bisa disunting**: daftarnya diturunkan dari kamus
  (`siteContentDefaults`). Yang perlu diurus hanya penempatan di bagian yang
  benar: `SITE_CONTENT_SECTIONS` mencocokkan prefix nama kunci, dan
  `tests/site-content.test.ts` menolak kunci yang jatuh ke penampung terakhir.
- **Nama kunci terbaca manusia.** Label baris di konsol adalah nama kuncinya,
  jadi beri nama yang menyebut bagiannya (`pricingYearlySaving`, bukan
  `note3`).

## Susunan seksi, dan kenapa urutannya begitu

    hero (+ kerangka aplikasi & ponsel + strip fakta berpil)  gradien brand → cyan
      → "Yang Anda dapatkan"           polos, kartu bernada + potongan UI (#402)
      → "Apa saja yang ada di dalam"   pita cyan, DAFTAR (tanpa kartu)
          + galeri tiga layar          kerangka aplikasi, 1 besar + 2 kecil (#399, #401)
      → "Untuk siapa"                  polos, kartu bernada + pil modul   (#398)
      → "Integrasi & jalan keluar data" pita brand, DAFTAR (tanpa kartu)  (#398)
      → "Yang menjaga pembukuan Anda"  polos, kartu bernada  ← sebelum harga
      → "Paket & harga"                pita indigo, kartu `surface` bertepi
      → FAQ                            polos, panel bernada
      → ajakan penutup                 pita PEKAT navy merek — PUNCAK (#401)
      → kaki                           pita indigo
    (+ tombol WhatsApp melayang, ≥576px, bila nomornya disetel — bukan seksi, bukan pita; #402)

Iramanya polos → pita → polos → pita, sebagai hasil aturan tepi di bawah:
seksi yang kartunya bernada harus polos, dan seksi yang pitanya bernada tidak
mewarnai kartunya. Iramanya memuncak sekali, di ujung: semua pita lain tint
14–18% pada satu tingkat kecerahan, dan ajakan penutup satu-satunya bidang
pekat (§Pita pekat di bawah).

### "Untuk siapa" berdiri SESUDAH daftar modul, dan "Integrasi" adalah pita (#398)

Issue #398 membebaskan pilihan antara sesudah manfaat atau sesudah modul.
Dipilih sesudah modul, karena kartunya menyebut modul lewat namanya (pil
`MODULE_META[m].labelKey`, kunci `BusinessModule`; modul yang dihapus ditolak
`tsc`). Sebelum daftar modul, kata "Perdagangan"/"Dokumen ekspor" belum
diperkenalkan; sesudahnya seksi ini menjawab *"dari sepuluh itu, mana yang
untuk saya"*. Seksi polos berkartu nada tepat di bawah seksi manfaat yang
bentuknya sama juga menghasilkan dua kisi identik berturut-turut, yaitu
keluhan "terlalu kaku".

"Integrasi & jalan keluar data" berbentuk pita `brand` + daftar (bentuk seksi
modul), bukan kartu: tanpa pita itu halaman memajang tiga kisi kartu bernada
berturut-turut (untuk siapa → kepercayaan). Keenam butirnya punya sumber
(`packages/core/src/efaktur.ts`, `lib/reconciliation.ts` +
`lib/bank-statements.ts`, `lib/import/*` + `lib/coa-import.ts`,
`app/api/v1/*` + `lib/api-token.ts`, `lib/tenant-export.ts` +
`lib/report-export.ts`, `CURRENCIES`). Yang tidak ada di kode (sinkron bank
otomatis, marketplace) tidak ditulis. Tautan dokumennya `DocSlug | null`:
tanpa dokumen berarti tanpa tautan, bukan tautan ke topik terdekat.

Dua keberatan terbesar pada pembukuan multi-PT, *"apakah data saya bisa
tercampur"* dan *"apakah saya bisa keluar lagi"*, muncul saat orang
membayangkan memakai produknya, bukan saat melihat harganya. Karena itu seksi
kepercayaan berdiri sebelum harga. Keempat isinya punya sumber di kode (#104,
`authz-effective.ts`, `lib/audit.ts`, `lib/tenant-export.ts`) dan berakhir
pada tautan ke `/docs` yang publik, jadi klaimnya bisa diperiksa sebelum
mendaftar.

### Lencana keamanan, logo pelanggan, jumlah pelanggan: tetap DITOLAK

Pola *Trust & Authority* menyarankan ketiganya. Ketiganya tidak punya sumber di
repo ini, jadi §KLAIM HARUS PUNYA SUMBER berlaku penuh. Penggantinya adalah
mekanisme yang bisa diperiksa sendiri oleh pembaca.

## Warna merek: NAVY INSTITUSIONAL (menggantikan biru bawaan AntD)

Warna merek adalah navy tua, bukan `#1677ff` bawaan AntD yang terbaca sebagai
warna *framework*. Pilihan ini mengikuti riset jenis produk: perkakas faktur &
pembukuan menaruh navy sebagai primernya.

| Peran | TERANG | rasio | GELAP | rasio |
|---|---|---|---|---|
| `colorPrimary` (teks/aksen) | `#1E3A5F` | 11,50 | benih `#7FB0E4` → render `#6f99c5` | 5,52 |
| Isian tombol / lambang | `#1E3A5F` | 11,50 | `#2F6FBF` | 5,06 |
| Bibit nada (`brand`) | `#2F6FBF` | — | `#2F6FBF` | — |

### Tiga hal yang HANYA ketahuan lewat pengukuran

Ketiganya ditangkap guard atau audit, tidak terlihat oleh mata:

1. **Bibit nada ≠ warna teks.** Nada pita diturunkan dari warna berbobot
   permukaan. Memakai `colorPrimary` (yang di tema gelap sengaja terang)
   menjatuhkan isian tombol ke 2,96:1 terhadap pita ajakan.
2. **Benih ≠ warna yang dirender.** Algoritma gelap AntD mentransformasi
   `colorPrimary`: benih 5,41:1 keluar sebagai 4,24:1. Guard mengukur nilai
   yang terpakai, bukan benihnya.
3. **Lambang produk lenyap di tema gelap.** `BrandMark` menaruh glif putih di
   atas `colorPrimary`; dengan navy, di tema gelap itu 2,98:1. Karena
   `colorPrimary` memikul dua peran berlawanan, isian merek mendapat tokennya
   sendiri: `--ant-color-brand-solid`.

(Kadar nada `/platform` ikut diukur ulang saat isian tombolnya berubah — lihat
`pages/platform.md`.)

### Aturan yang lahir darinya

> **Warna merek punya tiga peran, dan ketiganya token terpisah:**
> `colorPrimary` (teks/aksen) · `colorBrandSolid` (isian di belakang teks
> terang) · `colorBrandTone` (bibit nada permukaan).
> Di tema terang ketiganya berdekatan; di tema gelap ketiganya berbeda, dan
> menyatukannya mematahkan salah satu.

## "Terlalu kaku": apa yang menyebabkannya, dan apa yang mengubahnya

Keluhan pemilik atas versi sebelumnya, *"desain masih terlalu kaku"*, punya
sebab yang bisa ditunjuk: enam seksi berturut-turut dengan susunan identik
(label → judul → kalimat → kisi kartu seragam), ~20 kartu bertepi 1px dengan
radius 8px yang sama, nol keadaan hover, dan nol kedalaman.

Empat hal yang mengubahnya, semuanya diturunkan dari token AntD:

1. **Radius pendaratan sendiri**: `--sai-landing-radius`
   (`--ant-border-radius-lg` × 2 = 16px) untuk kartu, dan
   `--sai-landing-radius-control` (`--ant-border-radius` × 2 = 12px) untuk
   control. Radius app (6–8px) dipilih untuk kerapatan data, dan pendaratan
   tidak memikul tabel. Pada bidang sebesar tombol ajakan, radius adalah
   selisih terbesar antara "berwibawa" dan "kaku".
2. **Kartu menjawab kursor**: `[data-landing-card]` naik 3px dan bayangannya
   naik ke `--ant-box-shadow`. Halaman yang tidak menjawab kursor terbaca
   sebagai gambar, bukan perangkat lunak. Hanya `transform` + `box-shadow`
   (properti komposit), dan dimatikan di `prefers-reduced-motion`.
3. **Hero berlapis dua**: sorotan radial di kuadran tempat purwarupa berdiri,
   di atas gradien liniernya. Gradien linier sendirian terlihat datar.
   Kedua lapis harus nada tingkat pita (`band`/`accent`), bukan `chip-*`:
   hero memikul tombol primer, dan nada sepekat `chip` menjatuhkan isian tombol
   di bawah 3:1 di tema gelap.
4. **Kotak ikon menjadi lingkaran** dan kartu manfaat kehilangan tepinya
   (lihat §Tepi di bawah).

## "Polos sekali": kekayaan visual DATANG DARI ISI, bukan dari hiasan

Mencabut outline menyelesaikan kekakuan, tetapi bidang berwarna rata tanpa
tepi terbaca polos. Yang mengembalikan kekayaannya bukan ornamen (ornamen di
produk keuangan terbaca murahan), tetapi tiga hal yang menambah informasi atau
permukaan:

### 1. Purwarupa hero menjadi *stat tile* penuh — dengan sparkline

Kontrak *stat tile* (skill `dataviz`): label · nilai · delta · tren. Baris
"Selisih bersih" memikul keempatnya: nominal, `+12,4% vs periode lalu`, dan
sparkline 12 titik. Dengan itu kartunya terbaca sebagai dasbor, bukan daftar
angka.

- **Area, bukan garis** — deretnya satu (satu seri = area; banyak seri = garis).
- **Tanpa legenda** — satu seri; judul barisnya yang menamainya.
- Isian 20%, garis 2px, titik periode berjalan bercincin permukaan.

**Tanpa tooltip, crosshair, atau padanan tabel, sebagai pengecualian yang
dibatasi.** Aturan bawaan `dataviz` mewajibkannya untuk grafik. Ini gambar
tentang grafik, di dalam purwarupa `aria-hidden` yang angkanya sudah
dinyatakan contoh. Tooltip di sini mengundang orang memeriksa angka karangan,
dan lapisan hover menuntut JavaScript sisi klien yang dikunci `AMBANG_KLIEN`.
Kalau kelak ada grafik dengan angka nyata di halaman ini, aturan `dataviz`
berlaku penuh.

### 2. Kartu bernada mendapat KEDALAMAN, bukan bayangan

`landingFillSoft()` adalah gradien dua-henti yang sangat tipis (nada murni di
bawah, 60% nada di atas permukaan). Kartu menerima cahaya dari arah yang sama
dengan sorotan radial hero, jadi ia terbaca sebagai permukaan, bukan swatch.

Ini bukan `box-shadow`. MASTER.md §Jarak, radius, bayangan melarang menulis
bayangan sendiri karena nilainya berlapis tiga dan disetel per algoritma tema.
Saran basis data gaya untuk *colored card shadows* `rgba(...,0.08)` ditolak
karena bertabrakan dengan aturan itu. Kedalaman di sini datang dari isian,
yang memang milik pemanggil.

### 3. Hero mendapat TEKSTUR — kisi titik

Titik 1px pada kisi 22px, 7% dari warna teks. Ia terlihat sebagai butiran
permukaan, tidak sebagai pola, dan menambah kedalaman tanpa menambah elemen
yang harus dibaca. Ini pola baku pemasaran produk keuangan.

Tekstur berhenti di hero. Kisi titik di setiap pita akan terbaca sebagai pola
hiasan.

## Outline: aturan yang menggantikan "beri tepi pada segalanya"

Keluhan lanjutan pemilik, *"terganggu dengan penggunaan outline-nya, terlihat
sangat kaku"*, adalah keluhan #266 dari sisi sebaliknya. Semua tepi tidak bisa
dicabut (di tema gelap tepi memikul pemisahan). Yang dipakai adalah satu aturan
yang menentukan kapan tepi diperlukan:

> **Tepi hanya dipakai bila tidak ada nada yang bisa menggambar batasnya.**

Aturan itu menghapus hampir semua outline di halaman ini:

| Elemen | Dulu | Sekarang |
|---|---|---|
| Kartu manfaat | `surface` + tepi | nada, tanpa tepi (seksi polos) |
| Kartu keamanan | `surface` + tepi, di atas pita `brand` | **seksinya dipoloskan**, kartunya bernada, tanpa tepi |
| Panel FAQ | `surface` + tepi | nada, tanpa tepi |
| Catatan uji coba & PPN | blok bertepi | kalimat biasa |
| Sepuluh kartu modul | kartu bertepi | daftar, tanpa kotak |
| Baris purwarupa hero | tiga hairline | hanya garis JUMLAH |
| **Kartu paket** | `surface` + tepi | **tetap bertepi** — lihat di bawah |

### Membalik pita ↔ kartu adalah cara mencabut tepi tanpa kehilangan pemisah

Kartu keamanan dulu berdiri di atas pita `brand`, dan di sana tepinya perlu:
selisih kartu terhadap pitanya hanya 1,01–1,06:1 di tema gelap. Membalik
keduanya (seksinya polos, nadanya pindah ke kartu) menyelesaikan pemisahan yang
sama tanpa garis, dan tetap mematuhi §"warnai pitanya ATAU kartunya, tidak
keduanya". Halaman jadi berselang-seling: polos (kartu bernada) → pita → polos
→ pita.

### Kartu paket TETAP bertepi, dan itu bukan kelalaian

Kartu paket satu-satunya kartu yang memikul tombol primer, jadi badannya harus
`surface` (nada 14%/28% menjatuhkan isian tombol di bawah 3:1 di tema gelap,
§Nada pekat). Kartu itu juga berdiri di atas pita, tempat `surface` tanpa tepi
menghilang di tema gelap. Kedua batasan itu hanya terpenuhi oleh tepi. Jangan
mencabutnya.

### Pemisah seksi: bentuknya yang diubah, bukan keberadaannya

Diukur di peramban pada token yang terpasang: selisih pita terhadap latar
halaman hanya 1,09:1 di tema terang dan 1,14:1 di tema gelap. Warna sendirian
tidak menggambar batas wilayah di kedua tema, jadi pemisahnya tidak bisa
dicabut.

Bentuknya berupa `::before` bergradien, bukan `border-top` selebar viewport:
pekat di kolom tempat isi berdiri dan memudar ke nol sebelum tepi layar.
Batasnya tetap terbaca tanpa kesan "kertas bergaris".

Isian pita juga memudar di kedua tepi (keluhan pemilik: *"transisi antar
seksi tidak smooth"*). Nadanya naik dari nol di tepi atas, penuh sepanjang
isi, lalu turun ke nol di tepi bawah (`bandBackground()` di
`landing-section.tsx`). Tiga hal yang membuatnya aman:

- **Jaraknya `--sai-landing-rhythm`**, yaitu padding seksi itu sendiri. Tidak
  ada baris teks yang berdiri di atas bagian yang memudar.
- **Memudar ke `colorBgContainer`, bukan ke `transparent`.** Nada pita adalah
  `color-mix(hue … over container)`, jadi container adalah "nada 0%" yang
  sebenarnya; `transparent` menyerahkan hasilnya pada interpolasi alfa
  peramban.
- **`solid` dikecualikan.** Pita itu memikul teks putih, dan memudarkan
  tepinya menaruh teks putih di atas permukaan terang. Puncak halaman tetap
  bidang rata.

Ini melembutkan isian, bukan mencabut batas. Angka 1,09:1 / 1,14:1 di atas
tetap berlaku, jadi `::before` tetap satu-satunya yang menggambar wilayah.

### Tepi hanya wajib untuk kartu DI ATAS PITA

Kartu manfaat bernada dan berdiri di seksi polos: nadanya sendiri yang
menggambar batasnya, jadi tepi 1px di sana hanya menambah kekakuan. Untuk
kartu di atas pita, tepi tetap tidak boleh dicabut: selisih kartu terhadap
pitanya hanya 1,01–1,06:1 di tema gelap, dan tepi itu satu-satunya pemisahnya.

### Daftar modul BUKAN sepuluh kartu

Blok paling kaku di halaman ini dulu seksi terpanjangnya: sepuluh `Card`
berpermukaan melayang di kisi tiga kolom. Modul di sini tidak diklik,
dibandingkan, atau dipilih; ia daftar isi. Bentuknya sekarang dua kolom,
centang + label + keterangan, tanpa kotak. Pita seksinya sudah menggambar
wilayahnya.

### Yang DICOBA lalu dibuang: kisi manfaat asimetris

Kartu pertama membentang penuh, tiga sisanya di dua kolom. Bentuk ini dibuang
karena menyisakan satu kartu sendirian di baris terakhir, yang terbaca sebagai
kisi yang gagal memuat. Irama halaman dipecah di daftar modul, bukan di sini.
Jangan menghidupkannya kembali tanpa menyelesaikan kartu sisa itu.

### Potongan UI di kartu manfaat & pil modul berikon (#402)

Sesudah hero memakai kerangka aplikasi (#401), seksi manfaat adalah yang
pertama kembali ke "ikon + judul + paragraf", sementara kompetitor terus
memperlihatkan produknya. Karena itu tiap kartu memuat satu potongan UI kecil,
dirender server, yang menggambar isi kalimatnya (`landing-features.tsx`):

| Kartu | Potongan | Sumbernya |
|---|---|---|
| Buku terpisah per PT | pengalih PT — chip yang SAMA dengan bilah kerangka (`FRAME_CHIP`, diekspor dari `landing-app-frame.tsx`) + kalimat `mockSwitcherHint` | nama PT contoh (`mockCompany*`) |
| Peran & jejak audit | tiga lencana peran (chip indigo) + baris "siapa · kapan · apa" | `ROLES` + `roleLabels()` — penolong yang sama dengan halaman Pengguna, bukan kunci kamus yang dirakit dinamis |
| PPN & e-Faktur | tabel tiga baris DPP / PPN / total | `computeTax(DEFAULT_TAX_RATE)` — kunci baris yang sama dengan faktur galeri; berkasnya masuk `ALLOWED` `tests/tax-rates.test.ts` |
| Tiga bahasa | pil bahasa | `LOCALES` + `LOCALE_LABELS` (nama dalam bahasanya sendiri) |

Aturan yang mengikatnya:

- **Primitif kerangka, bukan bentuk baru.** Wadah potongan = `FRAME_CARD`
  (permukaan `colorBgContainer` bertepi). Tepinya wajib karena ia berdiri di
  atas kartu bernada (1,2–1,5:1 tanpa tepi). Pil = `landingChip` sehue kartu.
- **§Angkanya karangan berlaku pada satu-satunya potongan bernominal (PPN)**:
  label "contoh tampilan" (`mockCaption`, kunci yang sama) ada di dalam
  kartunya, jadi labelnya tampil lima kali di `/` (hero + 3 galeri + 1),
  dikunci `tests/public-landing.test.tsx`. Seluruh potongan `aria-hidden`
  (ilustrasi kalimat di atasnya). Nama peran & bahasa bukan angka karangan.
- **Potongan selebar kartu, di bawah baris ikon+teks (diukur).** Di 320px kolom
  teks kartu hanya ±184px (kartu 288 − padding 48 − ikon 40 − jarak 16),
  sementara tabel DPP/PPN/total menuntut ±200px; di lebar kartu penuh (±240px)
  ia muat tanpa memotong nominal. Overflow potongan terukur 0 di
  320/390/576/768/992/1440. Tinggi kartu tidak seragam (1440: 208/208/267/267;
  390: 232/281/314/223); kisi `landingGrid` meregangkan per baris, jadi kartu
  sebaris tetap sama tinggi.
- **Tiga peran, bukan empat**: pil "Administrator Sistem" patah ke baris
  ketiga di kartu 280px.
- **Pil modul "Untuk siapa"** berikon `MODULE_ICON` (peta yang sama dengan
  daftar modul & sidebar kerangka), 32px, `fontWeight 500`, glif anak tangga
  -8 sehue (≥3:1 di atas chip, pasangan yang sudah diukur). Pil menunjuk balik
  ke baris yang baru dibaca di seksi modul.
- **Keterangan Integrasi dipangkas ke satu kalimat** di ketiga bahasa
  (`integration*Body`); klaimnya tidak berubah.

## Kontak: tidak ada seksi `#kontak`

Pendaratan tidak punya formulir "hubungi kami" (dicabut). Jalan menghubungi
yang ada, dan hanya yang memang ada kodenya:

| Jalan | Di mana | Sakelarnya |
|---|---|---|
| Tombol WhatsApp melayang | kulit pendaratan, ≥576px | `PLATFORM_CONTACT_WHATSAPP` sah (`contactChannels()`) |
| `mailto:` paket rundingan | kartu Business di seksi harga | `PLATFORM_CONTACT_EMAIL` terisi |
| Jawaban FAQ "kalau ada masalah" | `landing-faq.tsx` | menyebut alamat surel bila terisi, selain itu dokumentasi saja (`faqSupportADocsOnly`) |

Kalau seksi kontak kelak dikembalikan: server action, bukan formulir klien
(pendaratan nol JS); tombol kirim `outline`, bukan `primary` (setiap primer
pendaratan menuju `/register`); tanpa janji jam layanan/SLA.

## Setiap seksi harus punya JALAN KELUAR, bukan berhenti di tempat

Empat seksi dulu berakhir tanpa langkah berikutnya, tepat di titik pembaca
paling mungkin pergi. Yang ditambahkan adalah jalan memeriksa, bukan ajakan
kedua (yang melanggar §Aksi utama per layar):

- **Kepercayaan**: tiap butir menautkan dokumennya sendiri. Tombol tunggal di
  kaki seksi menjawab janji "dokumentasinya terbuka untuk diperiksa" secara
  umum; tautan per butir menjawabnya secara khusus.
  Jejak audit sengaja tanpa tautan. `DOC_INDEX` belum punya halaman yang
  membahasnya, dan tautan ke dokumen terdekat akan menyesatkan pembaca ke
  topik lain. Slug-nya bertipe `DocSlug`, jadi dokumen yang dihapus ditolak
  `tsc` alih-alih menjadi tautan mati di halaman publik.
- **Harga**: kalimat "semua paket mendapat". Kartu paket hanya menjawab apa
  bedanya (kuota), padahal yang lebih dulu ditanya orang adalah apa yang ia
  dapat terlepas dari paketnya. Tanpa kalimat itu pembaca menyimpulkan modul,
  bahasa, dan mata uang ikut dijatah. Ketiga angkanya dihitung dari registri
  yang sama dengan strip bukti di hero. Bentuknya satu kalimat, bukan strip
  kedua (§Strip fakta muncul sekali).
- **FAQ**: sebelas pertanyaan tidak mungkin menutup semuanya, jadi pembaca
  yang pertanyaannya tidak ada butuh jalan lanjut.
- **Ajakan penutup**: satu kalimat penenang tepat di bawah tombol, tempat
  keraguan menit terakhir muncul. Angkanya dari `TRIAL_DAYS`. "Tanpa kartu
  kredit" tidak ditulis karena tak ada kode di repo ini yang menjaminnya.

## Label kategori (eyebrow) di atas setiap judul seksi

Setiap seksi dulu langsung dimulai dengan `<h2>`, tanpa penanda bagi pembaca
yang menggulung cepat bahwa ia memasuki wilayah lain. Pita berwarna memberi
penanda untuk mata, tetapi tidak untuk orang yang men-scan teks, dan tidak
untuk pembaca layar.

Bentuknya: 12px, tebal, huruf besar, `letter-spacing: 0.08em`, warna merek. Dua
aturan yang mengikatnya:

- **`<p>`, bukan heading.** Menyisipkan `<h3>` di atas `<h2>` mematahkan urutan
  tingkat heading yang dipakai pembaca layar untuk menavigasi.
- Ini salah satu dari sedikit tempat `--ant-font-size-sm` (12px) sah untuk teks
  yang bukan keterangan berulang. MASTER.md melarangnya untuk data; di sini ia
  label struktural, dan huruf besar + `letter-spacing` menjaganya terbaca.

## Kaki halaman berkolom

Merek + tiga kolom bertajuk (Produk / Sumber / Ketentuan) + bilah bawah berisi
hak cipta dan sakelar tampilan. Di kaki halaman orang mencari yang tidak
ditemukannya di atas; kolom bertajuk menjawab "di mana saya melihatnya" tanpa
membaca setiap tautan. Sakelar turun ke bilah bawah karena ia bukan tautan; di
dalam kolom bertajuk ia terbaca sebagai salah satu tujuan.

Tahun hak cipta dihitung (`new Date()`), aman karena halaman ini
`force-dynamic`. Tahun yang diketik salah setiap 1 Januari.

## Purwarupa produk di hero (bukan tangkapan layar)

Hero mengurung kalimatnya pada 42rem di dalam seksi 72rem, sehingga di layar
lebar ~40% sisi kanannya bidang berwarna kosong yang seolah menunggu gambar.
Sebelum purwarupa ini, halaman tidak memuat satu pun gambar produk, jadi calon
pelanggan tidak bisa melihat layar apa pun sebelum membuat akun.

Isinya dirender, bukan PNG (`landing-hero-mock.tsx`): ia mengikuti tema dan
bahasa, dan tidak usang. Tangkapan layar di halaman pemasaran lama-lama
memajang antarmuka yang sudah tidak ada.

### ⚠ Angkanya karangan — dan itu SAH, dengan tiga syarat

§KLAIM HARUS PUNYA SUMBER menyasar klaim: harga, kuota, lama uji coba, jumlah
pelanggan, yaitu hal yang dipercaya orang lalu ternyata berbeda saat ditagih.
Contoh tampilan bukan klaim tentang produk; ia gambar tentang bentuk layarnya.
Batasnya dijaga tiga syarat, dan ketiganya wajib:

1. **Label berteks yang selalu terlihat**: "contoh tampilan, angka di atas
   bukan data nyata", di dalam kartunya sendiri. Bukan `title`, bukan
   `aria-label`, bukan keterangan terpisah yang bisa terpotong di layar sempit.
2. **Nama perusahaannya jelas contoh**: "PT Contoh Satu". Bukan nama yang bisa
   dikira nyata, dan bukan nama PT pemasangan ini (§"Nama PT tidak pernah
   muncul di sini" tetap berlaku).
3. **`aria-hidden`**: isinya angka karangan, dan membacakannya kepada pengguna
   pembaca layar berarti membacakan data palsu seolah data.

Nominalnya lewat `formatMoney()` (fungsi server), bukan primitif `Money` yang
merupakan komponen client. Satu `Money` di sini berarti hidrasi dibayar setiap
pengunjung, termasuk yang tidak pernah mendaftar.

### Ilustrasi harus MENGATAKAN HAL YANG SAMA dengan kalimatnya

Judul hero berjanji *"satu PT — atau banyak"*, sedangkan purwarupanya dulu
memperlihatkan satu perusahaan. Gambar yang tidak mengatakan hal yang sama
dengan kalimat di sebelahnya hanya hiasan. Janji itu kini digambar oleh
pengalih PT di bilah atas kerangka (dua PT contoh, satu aktif berisi nada, ikon
tukar), bentuk yang sama dengan penanda perusahaan di app, di hero maupun di
ketiga layar galeri. "Tumpukan map" versi sebelumnya (dua bilah menyembul di
atas kartu) dibuang bersama kartunya, karena kerangka aplikasi sudah punya
tempat yang sama dengan produknya untuk mengatakan "PT ini bisa diganti".

### Kerangka aplikasi + kartu ponsel — hero sejak #401

Tinjauan visual terhadap tujuh kompetitor (2026-08-17): halaman kita bersih
tetapi terlalu editorial (banyak paragraf, sedikit produk), sementara
Kledo/Zoho/Wave memenuhi setengah layar dengan kerangka aplikasi nyata. Hero
karena itu komposisi "dasbor + ponsel", dirender:

- **`landing-app-frame.tsx`**: satu komponen server untuk hero dan galeri.
  Isinya bilah atas (lambang `BrandMark`, nama layar, pengalih PT, lingkaran
  pengguna), sidebar navy berikon (enam modul dari `MODULE_META` +
  `MODULE_ICON`, registri yang sama dengan daftar modul; modul yang dihapus
  ditolak `tsc`), area kerja `colorBgLayout` berisi kartu `colorBgContainer`
  bertepi (jenjang yang sama dengan dasbor sungguhan), dan label "contoh
  tampilan" di kaki. Label itu dirender oleh kerangka supaya tidak ada pemakai
  yang lupa. Bentuk `src/components/layout/*` dirujuk, tidak diimpor, karena
  semuanya client component.
- **Isinya**: tiga ubin angka (kas & bank / piutang / utang, angka contoh yang
  sama), satu grafik area (pola sparkline yang sama, 96px, tiga garis bantu 8%
  tanpa angka sumbu), dan baris "buku besar tersegel per periode". Selisih
  bersih tetap dihitung dari ketiganya.
- **Kartu ponsel** (`LANDING_PHONE_WIDTH` = 168px) bertumpuk di sudut
  kanan-bawah, menjorok 16px keluar kerangka ke kanan & bawah (masih di dalam
  gutter seksi; terukur tanpa gulungan mendatar), dan memperlihatkan layar yang
  sama versi ringkas. Ia tanpa label contoh sendiri karena bagian dari
  komposisi yang labelnya di kaki kerangka. Kaki itu menyisakan ruang selebar
  kartu ponsel (`padding-inline-end`) supaya kalimatnya tidak tertutup.
  Disembunyikan di bawah 992px. Issue meminta <768px, tetapi di 768px kerangka
  370px dan kartu ponsel menutupi 45%-nya (separuh grafik + ubin ketiga),
  sehingga kaki kerangka tinggal 170px untuk kalimat contoh. Di 992px kerangka
  493px dan kartu menutupi 34%, hanya ujung kanan grafik. Kartu "selisih
  bersih" karena itu menumpuk label/nilai/delta di kiri dan baris periode rapat
  kiri: yang boleh tertutup hanya ujung grafik, tidak pernah angka.
- **Sidebar navy = `--ant-color-brand-solid`**, bukan `SIDER_BG_DARK` (yang
  bukan variabel CSS; halaman ini hanya boleh menulis token). Glif putih di
  atasnya 11,50 / 5,06:1 (angka `BrandMark`). Ia strip di dalam gambar produk,
  bukan pita, dan tidak memikul tombol, jadi tidak melanggar "satu pita pekat".
- **Ubin angka `flex-wrap` basis 120px, bukan kisi `auto-fit`**: di kerangka
  sempit tiga ubin tidak muat sebaris, dan dengan `flex-grow` ubin ketiga
  melebar memenuhi barisnya alih-alih menyisakan kotak setengah lebar (§Yang
  DICOBA lalu dibuang: kisi asimetris).

**Bentuk dalam kerangka mengikuti lebar kerangka (`@container`), bukan
viewport.** Kerangka yang sama berdiri di 55% kolom hero, ~60% kartu galeri
besar, dan ~40% kartu galeri kecil: tiga lebar pada satu viewport, yang tidak
bisa dijawab titik patah viewport. Aturannya di `LANDING_STYLE`: <360px sidebar
disembunyikan (seperti app di ponsel); ≥520px PT kedua tampil di pengalih, dan
sidebar yang meminta label (`data-landing-frame-nav="wide"`, hanya hero)
menampilkannya. Peramban tanpa `@container` mendapat keadaan bawaan: sidebar
berikon tanpa label, kerangka yang lebih sederhana tetapi utuh. Ini bukan
titik patah keempat.

### Grafik area melebar penuh

Sparkline 132×34 yang terselip di samping nominal terbaca sebagai hiasan
kecil. Membentang selebar kartunya (tinggi 96px di dasbor, 40px di ponsel), ia
menjadi bagian kartu itu. `preserveAspectRatio="none"` meregangkan sumbu-x,
jadi penanda periode berjalan berupa garis tegak, bukan lingkaran yang akan
menjadi elips.

### Daftar modul: satu ikon per baris, SATU warna

Sepuluh baris teks datar tidak bisa di-scan; ikon per modul membuatnya bisa.
Petanya `Record<BusinessModule, …>`, sehingga modul baru tanpa ikon ditolak
`tsc` alih-alih tampil tanpa lambang di halaman publik.

Kesepuluhnya memakai satu warna. Penolakan nada per-kategori di §Yang DITOLAK
berlaku sama untuk ikon: yang dibedakan bentuk, bukan warna.

Petanya hidup di komponen pendaratan, bukan di `business-modules.ts`: ikon
adalah keputusan tampilan, dan satu-satunya permukaan yang menampilkan
kesepuluh modul sekaligus adalah halaman ini.

### Yang membuatnya terbaca sebagai PEMBUKUAN, bukan tiga angka

Dua konvensi akuntansi:

1. **Baris periode + segel.** Nominal hanya berarti bersama periodenya, dan
   buku besar disegel per periode. Tanpa baris itu kartunya bisa ringkasan apa
   pun.
2. **Baris jumlah**, dipisah garis yang lebih tegas (`colorBorder`, bukan
   `colorBorderSecondary`), konvensi yang sama dengan neraca & laba rugi di
   dalam aplikasi. Angkanya dihitung dari ketiga baris di atasnya, tidak
   diketik. Akuntan, pembaca yang paling mungkin memeriksanya, akan membaca
   jumlah yang tidak cocok dengan rinciannya sebagai kesalahan.

Jangan menambahkan keterangan yang mengulang baris periode. Dua kalimat yang
menyebut hal sama berjarak satu baris terbaca sebagai render yang keliru.

## Strip fakta: bilangan dan daftar tidak sama besar

Ketiga nilai dulu memakai satu gaya. Untuk "10" dan "3" itu benar; untuk
"USD · CNY · IDR" tidak, karena tiga kode mata uang di ukuran itu menjadi
elemen terlebar di strip dan menarik mata ke fakta yang paling tidak penting.
Pembedanya peran: dua yang pertama bilangan (`tabular-nums`, skala judul
seksi), yang ketiga daftar (satu tingkat di bawah, tanpa `tabular-nums`, yang
untuk teks bukan angka hanya merenggangkan hurufnya).

## Strip bukti pindah ke hero

Tiga angka (`BUSINESS_MODULES.length`, `LOCALES.length`, `CURRENCIES`) adalah
bukti terbaik halaman ini karena semuanya dihitung. Letaknya dulu di dalam pita
modul, sekitar sepertiga halaman ke bawah (sesudah orang memutuskan untuk terus
menggulung atau tidak), dan bentuknya sama dengan sepuluh kartu modul di
bawahnya sehingga terbaca sebagai tiga modul lagi. Sekarang letaknya tepat
sesudah hero, angka di atas label, tanpa kotak.

### Strip fakta berpil: ikon + angka besar (#402)

Tiga angka teks polos adalah bobot visual paling lemah di halaman (tinjauan
visual 2026-08-17). Tiap fakta kini berdiri di dalam pil `chip-brand` (28%):
lingkaran ikon `surface` 40px di kiri (glif `colorPrimary`), angka
`fontSizeHeading2` `tabular-nums` + label 14px di kanan; ketiganya `flex-wrap`
basis 200px, tepat di atas garis bawah hero.

- **Nada di atas nada, diukur.** §"warnai pitanya ATAU kartunya" lahir dari
  `fill` (14%) di atas pita sehue: 1,03:1. Pil ini `chip` (28%), dan terhadap
  kedua ujung gradien hero terukur 1,22 / 1,31:1 (terang) · 1,31 / 1,23:1
  (gelap). Itu di atas lantai 1,05 "nada ini benar-benar ada di layar", dan
  lebih terlihat daripada permukaan `surface` (1,01:1 terhadap `band-brand` di
  tema gelap). Teks 11,89 / 9,43:1, glif 7,82 / 4,16:1; pil tidak memikul
  tombol. Dikunci `tests/landing-colors.test.ts` §#402.
- **Baris, diukur:** 320px (288 tersedia) & 390px → tiga pil bertumpuk (71px
  tiap); 576px → 2 + 1 (pil ketiga melebar 528px); ≥768px satu baris (232 →
  360px per pil di 1440). Aturan bilangan vs daftar (§di atas) tetap: mata
  uang `fontSizeHeading4` tanpa `tabular-nums`.
- **Slot lencana PSE Komdigi**: barisnya `flex-wrap` + `flex: 1 1 200px`, jadi
  butir keempat tinggal ditambahkan ke daftar `facts` dan barisnya patah
  sendiri (4 × 200 + 3 × 12 = 836px < 1152px → tetap sebaris di 1440; 2 + 2 di
  768). Lencananya belum ada dan tidak boleh dipajang sebelum pendaftarannya
  nyata (§KLAIM HARUS PUNYA SUMBER).
- Tetap muncul sekali (#397): di seksi harga ia tetap kalimat.

## Copy, harga, FAQ — hasil tinjauan terhadap sembilan kompetitor (#397)

Halaman ini dibandingkan dengan Jurnal, Accurate, Kledo, Zahir, Paper.id,
Majoo, Wave, FreshBooks, dan Zoho. Yang diambil hanya yang punya sumber di kode
kita. Yang tidak punya (jumlah pelanggan, "tanpa kartu kredit", SLA) tetap
ditolak; §KLAIM HARUS PUNYA SUMBER tidak melunak karena kompetitor
melakukannya.

### Ajakan hero menyebut lama uji coba

"Coba gratis {days} hari" (`heroTrialCta`), bukan "Buat akun". Tombol itu
menjual percobaan tanpa risiko, dan pesan itu baru sampai bila lamanya tertulis
di tombolnya. Sebelumnya angka itu baru muncul di ajakan penutup, tiga layar ke
bawah. Sumbernya `TRIAL_DAYS`, konstanta yang sama yang menghitung masa uji
coba.

- **Kunci baru, bukan `heroPrimary` yang diubah bunyinya.** `heroPrimary`
  dipanggil tanpa `{days}` oleh kartu paket dan ajakan penutup; placeholder
  yang tidak diisi akan tampil sebagai teks `{days}` di halaman publik. Kedua
  tempat itu tetap "Buat akun". Tujuannya sama (`/register`), jadi
  `tests/button-emphasis.test.ts` tetap membacanya sebagai satu ajakan yang
  diulang.
- Tetap tanpa "tanpa kartu kredit", karena tidak ada kode yang menjaminnya.

### Copy pembuka berorientasi hasil pembeli, kejujuran "dari kode" jadi kalimat KEDUA

Empat pembuka (hero, modul, harga, kepercayaan) dulu berbicara tentang
halamannya (*"Daftar ini bukan brosur…"*, *"Harga di bawah diambil dari
katalog…"*, *"Empat hal di bawah bukan janji pemasaran…"*), bukan tentang
masalah pembeli. Kalimat pertama kini menyebut pekerjaan yang selesai (catat
transaksi, tutup periode, laporan & PPN; satu buku besar per PT; pilih paket
sesuai PT & pengguna; catatan yang bisa dipertanggungjawabkan kepada pemilik,
auditor, kantor pajak). Kalimat "datanya dari kode" tetap ada sebagai kalimat
kedua, karena itulah yang membedakan halaman ini dari kompetitor yang
mengatakan hal serupa.

Setiap klaim di kalimat pertama punya pelaksananya: penutupan periode
(`/periods`, `form-guards.ts`), laporan (`lib/reports.ts`: neraca saldo, laba
rugi, neraca, arus kas), PPN & e-Faktur (`packages/core/src/tax.ts`, modul
`tax_id`), satu buku besar per PT (#104; modul tidak pernah menggerbangi buku
besar, `business-modules.ts` aturan 1), naik paket mandiri
(`packages/billing/src/plan-change.ts`).

**Judul hero merangkul satu PT**: "Pembukuan satu atau beberapa PT, dalam satu
akun". Judul lama ("Pembukuan beberapa PT…") membuat pemilik satu PT, pasar
terbesar, merasa bukan sasaran, padahal paket terkecil memang satu PT.

### Judul hero ≤ 8 kata, kalimat tubuh dua kalimat (#401)

Judul #397 (9 kata ID / 10 EN) terukur 4 baris di 1440px, setengah kolom hero.
Kini `heroHeading` ≤ 8 kata di ketiga bahasa: *"Pembukuan rapi, satu PT atau
banyak"* / *"Tidy books for one company — or many"* / *"一家或多家公司，账簿井井有条"*,
terukur 2 baris di ≥992px dan ≤3 di 320–768px. Kandidat issue (*"Pembukuan
rapi untuk satu PT — atau banyak"*, 42 huruf), diukur dengan metrik Inter yang
terpasang, patah tiga baris di kolom 497px pada setiap ukuran ≥47,5px; yang
dipilih (35 huruf) dua baris sampai 49,4px, langit-langit hero sekarang.

Janji "buku besar sendiri per PT, satu akun" turun ke `heroBody`, yang
dipendekkan menjadi dua kalimat (di 390px 5 baris, dulu 7). Kedua kunci dipakai
`generateMetadata` (title/OG/description) dan tetap bermakna berdiri sendiri.
"Satu PT atau banyak" tetap merangkul pemilik satu PT (§di atas), dan
purwarupanya (pengalih PT di kerangka) mengatakan hal yang sama. `ctaBody`
kehilangan kalimat "Tidak ada yang perlu dipasang", karena di pita penutup ia
berdiri satu baris di atas `ctaTrialNote` yang mengatakan hal yang sama.

**Kalimat kedua `heroBody` disembunyikan di bawah 576px (#402).** Dua kalimat
terukur 5 baris di 390px sebelum tombol. `landing-hero.tsx` memotong teks pada
tanda akhir kalimat pertama (`. ! ?` atau `。` ZH) dan membungkus sisanya
`[data-landing-hero-body-more]`. Di bawah 576px pembungkus itu dikurung 1px
(teknik nama merek di bilah, bukan `display:none`, supaya pembaca layar tetap
mendapat kalimat utuh) dan kembali `static` mulai 576px. Satu kunci kamus,
tetap dipakai `generateMetadata`. Diukur: 320px → 3 baris, 390px → 3 baris
(dulu 5); ≥576px kalimat utuh (576: 3 baris, 992/1440: 4 baris; 768: 5 baris,
karena kolom hero 45% di titik patah dua kolom, keadaan #401 yang tidak
berubah). Kamus yang kelak hanya satu kalimat dirender apa adanya.

### Hemat tahunan: DIHITUNG di kartu, hilang bila nol/negatif

Baris "Bayar tahunan hemat Rp X (≈ N bulan)" ada di bawah harga tahunan.
Nominal tahunan sendirian menuntut pembaca mengalikan 12 di kepalanya; Kledo &
Zoho menonjolkan selisihnya, dan itu informasi. Angkanya
`priceMonthly × 12 − priceYearly` dari dua kolom katalog yang sama yang
merender kedua harga di atasnya (`landing-pricing.tsx`); tidak ada angka diskon
yang diketik.

- **Nol atau negatif → baris tidak dirender.** Katalog yang menghapus diskon
  tahunan, atau memasang tahunan lebih mahal, tidak boleh memajang "hemat
  Rp 0" / "hemat −Rp …": benar secara aritmetika, tetapi terbaca sebagai
  halaman rusak.
- Bulan ditampilkan satu desimal format `id-ID` (2,0 → "2"; 1,5 tetap "1,5").
  `tabular-nums`, sesuai aturan angka MASTER.md.

### Kisi harga dipusatkan (≤2 kartu), Enterprise setinggi Pro (#402)

Katalog publik dulu memuat dua paket (Pro + rundingan), dan kisi 72rem memberi
masing-masing 568px: selebar dua kolom teks, dengan separuh badan Enterprise
kosong. `<ul>` paket karena itu ber-`maxWidth` 760px + `marginInline: auto`
selama `plans.length ≤ 2`, dan melebar otomatis (tanpa `maxWidth`) bila katalog
punya ≥3 paket. Diukur keduanya: dua kartu di 760px = (760 − 16) / 2 = 372px
per kartu di ≥992px (`<ul>` di x=116 pada 992, x=340 pada 1440); tiga kartu di
kisi penuh = (1152 − 32) / 3 = 373px. Jadi kartu paket berlebar sama berapa pun
jumlah paketnya. Di 768px kisi 720px (kartu 352), di ≤576px satu kolom.

Kartu rundingan mendapat tiga butir "termasuk" (kuota dirundingkan, dukungan
langsung lewat kanal kontak, ketentuan & masa kontrak khusus;
`pricingContactQuota/Support/Terms`, tiga bahasa) supaya isinya setinggi Pro
(terukur 402px keduanya di 992/1440; badannya memang diregang kisi, butir itu
mengisi ruangnya). Ketiganya jujur: kuota memang dirundingkan
(`plan-change-contact-only`), dukungan lewat kanal `contactChannels()` yang
sama tanpa jam layanan/SLA (§KLAIM HARUS PUNYA SUMBER), dan ketentuan kontrak
memang milik perundingan.

Kepala Pro `chip-brand` (28%) vs kepala Enterprise `fill-indigo` (14%): teks
di atas kepala Pro 11,89 / 9,43:1, dan kedua kepala berbeda satu sama lain
1,20 / 1,22:1 (kedua tema; lantai 1,05). Dikunci di
`tests/landing-colors.test.ts` §#402. Pil "Direkomendasikan" tetap netral.

### Kisi harga EMPAT paket: 1 → 2×2 → 4 kolom (#404)

Katalog memuat empat paket: Starter · Pro · Business · Enterprise
(`docs/PRICING.md` sumber angkanya; kartu tetap membaca `plans`).
`landingGrid()` di kartu paket dibatasi tiga kolom, jadi empat paket berarti 3
+ satu kartu selebar sepertiga di baris kedua. Empat kolom lewat `auto-fit`
juga tidak bisa. Diukur di 992px: seksi 944px → kartu 224px, isi 176px
(padding 24+24), sedangkan "Rp 1.199.000 /bln" pada 24px tebal butuh ~200px.
`auto-fit` ber-minimum 276px juga jatuh kembali ke 3 + 1 di 992–1199px.

Karena itu saat `plans.length ≥ 4` `<ul>` melepas `landingGrid` dan memasang
`[data-landing-pricing-grid]` yang dipegang lembar gaya bertitik-patah: 1 kolom
(<768), 2×2 (768–1199, kartu 340–560px), 4 kolom (≥1200,
`LANDING_PRICING_FOUR_COLUMNS_BREAKPOINT`; seksi 1152px → kartu 276px, isi
228px, nominal muat satu baris). Kisi ≤3 paket tidak berubah (termasuk
pemusatan 760px di ≤2, #402). Atribut dan `landingGrid` saling eksklusif, jadi
tidak ada aturan yang saling menimpa.

**Butir "termasuk" di luar kuota** hanya untuk paket yang punya sumber di luar
tabel `plans` (§KLAIM HARUS PUNYA SUMBER). Business memikul *"Dukungan
prioritas — dibalas hari kerja berikutnya"* (`plans.highlight.prioritySupport`,
tiga bahasa; keputusan pemilik di #404, dicatat di `docs/PRICING.md`). Butir itu
dipetakan di `packages/billing/src/plan-copy.ts` §SOROTAN dan dirender di kartu
publik dan halaman paket di dalam aplikasi dari daftar yang sama. Paket lain
tidak diberi butir hiasan ("semua modul", "tiga bahasa"): itu sudah dinyatakan
sekali untuk semua paket (`pricingAllNote`), dan mengulanginya per kartu
menyiratkan paket lain tidak mendapatkannya. Butir kedua Enterprise adalah
*"Migrasi data, pelatihan tim, dukungan langsung"* (`pricingContactSupport`),
jasa yang memang membedakannya dari Business (`docs/PRICING.md` §2), tetap
tanpa jam layanan.

Nama paket tidak diterjemahkan (nama produk, `packages/billing/src/plan-copy.ts`):
"Starter"/"Business", bukan "Mulai"/"Bisnis", supaya ketiga kamus memakai satu
tangga dalam satu bahasa. Deskripsi tiap paket tetap lewat
`plans.description.*`.

### Enterprise dilebur ke kaki kartu Business — tiga kartu lagi (#408)

Sehari sesudah #404 pemilik memutuskan funel publik tiga anak tangga: Starter
→ Pro → Business, dan rundingan hanya bagi yang melewati kuota Business.
`enterprise` menjadi `is_public = false` (tetap aktif & `contact_only`,
diberikan operator untuk kontrak; migration platform 0010), sehingga kisi
kembali ke tiga kolom `landingGrid`. Jalur ≥4 kartu (#404) tidak dihapus:
katalog lain boleh memajang empat, dan kartu `contactOnly` generik tetap
dirender bila operator memublikasikan paket rundingan lain.

Yang tersisa dari Enterprise di halaman harga adalah satu paragraf catatan di
kaki kartu Business (`[data-landing-negotiate]`, `pricingNegotiateNote`):
*"Butuh lebih dari 8 PT atau 40 pengguna? Kuota, migrasi data, SLA, dan masa
kontrak dirundingkan. Hubungi kami →"*. Angkanya dari `maxCompanies`/`maxUsers`
paket pemikulnya (`packages/billing/src/plan-copy.ts` `planCarriesNegotiation`,
dipetakan, bukan `key === "business"` di komponen). Tautannya tautan teks pola
`faqMoreCta` (`data-landing-link`, `colorLink`), bukan tombol kedua: kartu itu
sudah memikul satu primer, dan dua tombol bertumpuk adalah dua ajakan yang
bersaing. Tanpa `PLATFORM_CONTACT_EMAIL` kalimatnya tetap dan
`pricingContactMissing` menggantikan tautan (pola #397). Diuji
`public-landing.test.tsx` §#408.

### Kartu paket #413: sakelar siklus, nominal besar, ubin kuota, menara — dan `/pricing`

Permintaan pemilik 2026-08-18: *"perbaiki visualisasi plan dan pricing, buat
semenarik mungkin."* Yang ditambah adalah bentuk; disiplinnya (badan `surface`
bertepi, kepala bernada, satu primer per kartu, klaim bersumber, tanpa JS)
tetap. Empat perubahan, semuanya di `landing-pricing.tsx` + `landing-scale.ts`:

1. **Sakelar Bulanan / Tahunan tanpa JavaScript.** Dua radio
   (`name="sai-billing"`) tersembunyi dari mata (dikurung 1px, bukan
   `display:none`, jadi tetap fokusabel) + dua label sebagai pil bersegmen
   (`[data-landing-billing-switch]`). Pil terpilih berisian `colorBrandSolid` +
   teks terang, token ketiga warna merek (§Warna merek), 11,50/5,06:1. Kartu
   merender kedua blok harga (`[data-landing-price="monthly"|"yearly"]`), dan
   lembar gaya memilih yang tampak:
   `[data-landing-pricing]:has(radio[value=yearly]:checked)
   [data-landing-price=monthly]{display:none}` + sebaliknya. Peramban tanpa
   `:has()` selalu melihat bulanan; sakelarnya tidak bereaksi tetapi tidak
   rusak. Halaman tetap memuat kedua harga (mesin pencari, cetak, DOM pembaca
   layar).
   Pil "Tahunan" menyebut hemat dalam bulan: angka terkecil di antara paket
   berbayar, dan hanya bila semua punya harga tahunan (`hematTahunan`,
   dihitung), supaya janji di pil berlaku untuk setiap kartu. Sakelar tidak
   dirender bila tak ada harga tahunan, karena dua pil yang menampilkan hal
   yang sama adalah control palsu. Blok tahunan memajang yang ditagih (harga
   tahunan) sebagai angka besar; padanan bulanan (`priceYearly / 12`,
   dibulatkan `formatMoney`) menjadi kalimat kecil di bawahnya
   (`pricingYearlyEquivalent`).
2. **Nominal `--sai-landing-font-size-section`** (24 → 30px di ≥576px), tebal,
   tracking `-0.02em`, tabular; satuan "/bulan" duduk di baseline dan boleh
   turun baris sendiri (`flexWrap`). Tetap di bawah hero: angka adalah bidang
   terbesar di kartunya, bukan di halamannya. Diukur: "Rp 1.199.000" 30px
   ≈ 215px, muat di isi kartu 228px (kisi empat kolom #404).
3. **Kuota = ubin angka** (`[data-landing-quota]`): dua ubin sebaris, angka
   `heading-3` tabular + label kata benda (`pricingQuotaCompaniesLabel` "PT
   (perusahaan)" / "Companies" / "公司", `…UsersLabel`), nada `fill-indigo`
   (14%) di atas badan `surface`, nada yang sama dengan kepala kartu biasa.
   Ubin tidak memikul tombol, jadi 14% sah. Alasannya §"Polos sekali": kuota
   satu-satunya isi yang membedakan paket, dan sebelumnya ia hanya dua baris
   centang yang sebentuk butir hiasan. Label kata benda (bukan kalimat
   berjumlah) mencegah "1 companies" muncul lagi (#404). Butir sorotan
   (`plan-copy.ts` §SOROTAN) tetap daftar centang di bawah ubin, dan daftarnya
   tidak dirender kosong.
4. **Kartu disarankan = menara.** `<li data-landing-plan-recommended>`
   bermargin blok negatif 16px di ≥992px: butir kisi yang `stretch` menjadi
   baris + 32px, dan kartu (`height:100%`) menjulur di atas dan di bawah
   tetangganya. Kartunya bercincin merek + `boxShadow-secondary` tetap. Hover
   bawaan `[data-landing-card]` menimpa `box-shadow`, jadi ada aturan yang
   mengembalikan cincin + bayangan hover bersama. Di bawah 992px (satu/dua
   kolom) menara menabrak kartu di atasnya, jadi di sana ia sejajar. Sorotan
   memakai empat penanda: lencana berteks, nada kepala, cincin, bentuk.

Urutan isi kartu: kepala → nominal (blok aktif) → deskripsi → "Termasuk" →
ubin kuota → butir sorotan → catatan rundingan (#408) → tombol
(`marginTop:auto`, sejajar antar-kartu; PR #411). Kartu Starter/Pro menyisakan
ruang kosong di atas tombolnya karena Business memikul butir sorotan + catatan
rundingan. Ruang itu tidak diisi butir hiasan ("semua modul", "3 bahasa");
alasan §Kisi harga EMPAT paket tetap berlaku.

**`/harga` → `/pricing` (308 permanen, `next.config.ts` `redirects`).**
Alamat kanoniknya `/pricing` (`alternates.canonical`, `sitemap.ts`). `/harga`
adalah alamat lama (#399/#413) yang sudah dibagikan & terindeks, jadi ia tidak
boleh menjadi 404; jawabannya redirect permanen, bukan halaman kedua berisi
sama. Redirect `next.config` dievaluasi sebelum sistem berkas dan `proxy.ts`,
jadi `/pricing` tidak masuk `isPublicPath`. Diuji `public-landing.test.tsx`
§#413.

### Pembanding "menumpuk vs naik paket" — hitungan, bukan klaim (10 Okt 2026)

Pertanyaan pertama pembeli grup multi-PT biasanya *"saya punya tiga PT, lebih
murah tiga paket kecil atau satu paket besar?"*, bukan "paket mana yang paling
murah". Sebelumnya seksi harga membiarkan pembaca menghitung sendiri dari tiga
kartu nominal.

Jawabannya sudah menjadi keputusan komersial tercatat (`docs/PRICING.md` §1:
*3 × Starter = Rp 747.000 > Pro; 3 × Pro = Rp 1.797.000 > Business*), jadi yang
ditambahkan di layar hanya penurunannya dari katalog:
`packages/billing/src/plan-stacking.ts`, pasangan paket berurutan, `Math.ceil`
pada kuota PT.

Empat aturan yang mengikatnya:

- **Nol angka diketik.** Hemat dihitung `count × small − large`; harga yang
  berubah mengubah tabelnya (§KLAIM HARUS PUNYA SUMBER).
- **Baris yang tidak hemat dijatuhkan.** Tangga sekarang membuat menumpuk
  selalu lebih mahal, tetapi itu sifat angkanya: Starter pada Rp 199.000
  membuat 3 × Starter (597.000) lebih murah daripada Pro, angka yang ditolak
  `PRICING.md`. Pada keadaan itu klaimnya salah, jadi barisnya hilang. Dijaga
  `tests/plan-stacking.test.ts`.
- **Permukaan netral, tanpa nada.** Seksi harga sudah memikul tiga kartu
  bernominal; bidang berwarna keempat menambah warna tanpa menambah arti.
  `colorFillQuaternary` memisahkannya tanpa memperkenalkan hue.
- **`<table>` sungguhan, satu-satunya di direktori ini.** Bagian pendaratan
  lain digambar `div` karena bukan data bertabel. Yang ini dua baris × tiga
  kolom dengan judul kolom yang memberi arti pada selnya; dengan `div`, pembaca
  layar menerima enam angka tanpa tahu mana "menumpuk" dan mana "naik paket".
  `StaticTable` tidak dipakai karena ia primitif tabel aplikasi dan di halaman
  pemasaran terbaca sebagai layar kerja.

Satu-satunya angka berwarna di panel itu adalah hematnya (`colorMoneyPositive`,
token uang #186 yang lolos 4,5:1 sebagai teks; `colorSuccess` AntD tidak).

### Strip fakta muncul SEKALI — di hero; di harga tinggal kalimatnya

Tiga angka (modul · bahasa · mata uang) dulu tampil dua kali identik: strip
bukti di bawah hero dan `<dl>` "Semua paket mendapat" di seksi harga. Strip
dipertahankan di hero, dan yang di harga menjadi satu kalimat berangka
(`pricingAllNote`: *"Semua paket mendapat 10 modul, 3 bahasa antarmuka, dan
mata uang USD · CNY · IDR. Yang dijatah per paket hanya jumlah PT dan
pengguna."*). Alasannya:

1. **Kedua tempat menjawab pertanyaan yang berbeda.** Di hero pertanyaannya
   *"seberapa banyak"*, dan bukti berbentuk angka besar. Di harga
   pertanyaannya *"apa yang saya dapat terlepas dari paket"*, dan jaminan
   berbentuk kalimat. Kalimatnya menjawab "apakah modul dijatah" sekaligus
   menyebut apa yang memang dijatah (`Plan` hanya punya `maxCompanies` &
   `maxUsers`).
2. **Seksi harga sudah memikul tiga kartu berisi nominal.** Tiga angka besar
   lagi di bawahnya bersaing dengan harga, yang seharusnya paling dibaca.
3. Bukti yang diulang mulai terbaca sebagai pengisi. Arah sebaliknya (strip di
   harga, kalimat di hero) ditolak karena alasan §Strip bukti pindah ke hero
   masih berlaku: bukti terbaik halaman harus tampil sebelum orang memutuskan
   menggulung.

Ketiga angka di kalimatnya tetap dihitung dari registri yang sama
(`BUSINESS_MODULES.length`, `LOCALES.length`, `CURRENCIES`). Kunci
`pricingAllTitle` dihapus dari ketiga kamus (guard kunci yatim).

### Lima FAQ pembeli — setiap jawaban diverifikasi ke kode SEBELUM ditulis

Enam pertanyaan lama seluruhnya soal tagihan & isolasi, sehingga pertanyaan
yang muncul sebelum orang sampai ke tagihan tidak terjawab. Lima yang
ditambahkan, dan sumber tiap jawabannya (juga tercatat di kepala
`landing-faq.tsx`):

| Pertanyaan | Sumber jawaban | Yang SENGAJA tidak diklaim |
|---|---|---|
| Cocok untuk usaha apa | `BUSINESS_CATEGORIES`/`CATEGORY_META` — daftar presetnya **dirakit dari registri** (tanpa `custom`) dan `BUSINESS_MODULES.length`; modul per PT, tidak menggerbangi buku besar | segmen/industri yang tidak punya preset |
| Impor dari sistem lama | `coa-import.ts` (akun, kolom Accurate), `import/master.ts` (pelanggan/pemasok/barang), `import/opening-ar-ap.ts`, `import/fixed-assets.ts`, templat `import/template.ts`, kolom dikenali dari judul (`import/spec.ts`), yang sudah ada dilewati bukan ditimpa; saldo awal akun di wizard penyiapan | **riwayat jurnal** — TIDAK diimpor, dan itu ditulis apa adanya |
| Akuntan/KAP eksternal | undangan surel + peran per PT (docs/MULTI-TENANT.md §7.2–7.3, kuota `maxUsers`), peran bawaan bisa disetel + peran kustom (docs/RBAC.md), jejak audit, pencabutan sesi (docs/RBAC.md §Sesi & pencabutan) | peran "hanya-baca" siap pakai (tidak ada; yang ada: bisa dibuat) |
| Kanal dukungan | dokumentasi publik `/docs`; alamat surel `contactChannels().email` bila disetel | **jam layanan / SLA / telepon / obrolan** — tidak ada kodenya |
| Tempat data & UU PDP | basis data per PT (#104), ekspor mandiri, permintaan hapus bertenggang 30 hari & bisa dibatalkan (docs/COMPLIANCE.md), tidak ada hapus otomatis, `/privacy` | **lokasi server** — data residency masih keputusan terbuka (COMPLIANCE.md §5.1) |

**Jawaban dukungan bercabang pada `PLATFORM_CONTACT_EMAIL`.** Tanpa seksi
kontak (§Kontak: tidak ada seksi `#kontak`), jawabannya menyebut alamat surel
langsung, dan hanya bila alamat itu disetel; menyuruh orang menulis ke alamat
yang tidak ada adalah penunjuk palsu. Tanpa alamat, jawabannya
`faqSupportADocsOnly` (dokumentasi saja).

Urutan lima pertanyaan mengikuti urutan orang menanyakannya: cocok untuk saya?
→ data lama saya? → akuntan saya? → kalau macet? → data saya di mana?
`FAQPage` JSON-LD ikut otomatis (dibangkitkan dari array yang sama).

### Catatan undangan disembunyikan di bawah 576px

"Sudah diundang rekan kerja? …" (`heroNote`) `display:none` di bawah 576px
lewat `[data-landing-hero-note]` di `LANDING_STYLE`, dan tampil kembali di blok
media ≥576px. Di ponsel hero satu kolom, dan setiap baris di atas purwarupa
mendorong sisa halaman ke bawah lipatan. Kalimat ini menyasar orang yang hampir
pasti tidak membaca hero, karena yang diundang datang lewat tautan di surelnya.
Alternatif "pindahkan ke bawah tombol Masuk" ditolak: di ponsel tombol-tombol
bertumpuk satu kolom, jadi "di bawah Masuk" adalah tempatnya sekarang dan tidak
menghemat satu baris pun. Kalimatnya tetap di HTML dan tetap tampil di layar
yang punya ruang.

## Gerak: CSS, tidak pernah JavaScript

Scroll-reveal halus memakai `animation-timeline: view()` tanpa berkas skrip,
jadi `AMBANG_KLIEN` tidak bergerak. **GSAP/ScrollTrigger ditolak** di halaman
ini: ia JavaScript sisi klien yang hidrasinya dibayar pengunjung yang mungkin
tidak pernah mendaftar. Tiga pagar wajib, semuanya di `landing-scale.ts`:
`prefers-reduced-motion: no-preference` (izin, bukan larangan), `@supports`
(tanpa dukungan = tidak ada animasi), dan hanya `translateY`.

### ⚠ `opacity` DILARANG di keyframes ini

Versi pertama menganimasi `opacity: 0 → 1`. Itu benar saat orang menggulung,
tetapi gagal di setiap konteks yang tidak menggulung: seksi yang belum "masuk"
berhenti di keadaan awalnya, tak terlihat. Terukur di Chromium 131 dengan
viewport setinggi dokumen (bentuk yang dipakai perender halaman-penuh,
termasuk perayap yang merender): tiga seksi terakhir (harga, FAQ, ajakan
penutup) tetap di `opacity: 0`.

Di halaman pemasaran yang diberi metadata & data terstruktur agar ditemukan,
itu berisiko membuat mesin pencari membaca bagian harga sebagai isi
tersembunyi. Dengan hanya `transform`, kegagalan terburuk hanya menggeser teks
14px; isinya tidak bisa hilang. `@media print` mematikan sisa gerak, karena
mencetak juga tidak menggulung.

Atributnya dipasang pada seksi, bukan tiap kartu: sepuluh kartu yang muncul
satu per satu adalah animasi hias.

## Bagaimana bentuk itu ditulis (bukan lagi kelas)

- **Nol `className`.** Seluruh halaman memakai gaya sebaris + `var(--ant-…)`.
  Keadaan yang tidak bisa ditulis sebaris (`@media`, `:hover`, `:focus`,
  `details[open]`, `prefers-reduced-motion`) hidup di satu blok `<style>` yang
  dipasang `LandingShell`, menyasar atribut `data-landing-*`.
- **Titik patah: 576px** (`screenSM` AntD) untuk seluruh isi halaman, dengan
  pengecualian yang lahir dari pengukuran:
  - Tautan seksi di bilah atas muncul mulai **768px**
    (`LANDING_NAV_LINKS_BREAKPOINT`). Bilah atas adalah satu baris yang harus
    memuat merek + empat tautan + pemilih bahasa + dua tombol, dan dengan
    tautan tampil ia menuntut 685px. Mulai 576px, halaman akan menggulung
    mendatar di seluruh rentang 576–685px. Cacat itu tidak terlihat di dua
    ukuran tangkapan yang biasa (1920 & 390) dan baru ketahuan setelah lebar
    disapu satu per satu. Jangan menambah titik patah baru tanpa mengukur.
  - **Hero juga berpatah di 768px.** Diukur: kerangka aplikasi (sidebar 40px +
    tiga ubin "Rp 184.500.000" ±118px + grafik) tidak muat di kolom purwarupa
    206px yang tersedia di 576px. Di 576–767px hero satu kolom, kerangka
    selebar isi (528–720px). Mulai 768px dua kolom 45:55 (kerangka 55%, karena
    gambar produknya yang menjual; judulnya ≤8 kata supaya muat di 45%), dengan
    jarak `margin-xxl` (48px), bukan `rhythm` (96px). Dengan 96px kolom kalimat
    di 768px tinggal 281px.
  - **Titik patah ketiga, 992px** (`screenLG`, `LANDING_WIDE_BREAKPOINT`), untuk
    galeri 1 besar + 2 kecil dan kemunculan kartu ponsel hero (#401). Pada
    3fr:2fr kolom kanan baru mencapai ~360px (lebar minimum agar kerangka di
    dalamnya masih memuat sidebar berikon) mulai 992px. Di 768–991px kerangka
    faktur kehilangan sidebarnya sementara jurnal di sebelahnya masih punya, dan
    dua kerangka yang tidak sebentuk berdampingan terbaca sebagai bug.
- **Menu ponsel (#398): `<details><summary>`, tanpa JavaScript.** Di bawah
  768px tautan seksi + pemilih bahasa (<576px saja; di 576–768 sakelar di bilah
  sudah tampil) hidup di panel `position:absolute` di bawah bilah, dibuka tombol
  40px yang ikonnya bertukar (garis tiga ↔ X) lewat `[open]`. Bilah di bawah
  768px berkisi dua kolom (`auto 1fr`), tiga kolom mulai 768px. Teks merek
  disembunyikan visual di bawah 576px (lambang tetap, teks tetap di DOM untuk
  pembaca layar), karena di 390px ia terukur patah dua baris begitu tombol menu
  ikut ke kolom aksi. Titik patah 576px yang sudah ada cukup; tidak perlu 400px
  baru. Disapu 320–767px lewat CDP: `scrollWidth == innerWidth` di setiap lebar,
  tertutup maupun terbuka; panel tidak melampaui viewport.
  Batasnya: tanpa skrip, panel tidak menutup sendiri saat tautan seksi ditekan.
  Ia tetap terbuka di bawah bilah menempel sampai tombol X ditekan. Menutup
  otomatis menuntut JavaScript, yang lebih mahal daripada satu ketukan.
- **Dua penumpang titik patah 576px (#402):** `[data-landing-fab]` (tombol
  WhatsApp melayang: `none` → `block`) dan `[data-landing-hero-body-more]`
  (kalimat kedua hero: dikurung 1px → `static`). Keduanya memakai titik patah
  yang sudah ada.
- **Skala pemasaran = `--sai-landing-*`**, dideklarasikan hanya di dalam
  `[data-landing]` dan seluruhnya turunan token AntD, kecuali tiga lebar baca.
  Menyalinnya ke halaman internal tidak menghasilkan apa-apa.
- **Seksi lewat `LandingSection`/`LandingSectionIntro`**: irama, lebar, garis
  pemisah, dan jarak jangkar (`scroll-margin-top` = tinggi bilah menempel)
  datang dari satu tempat, tidak diulang di enam berkas.

## Nada pekat: kenapa halaman ini berwarna, dan sampai di mana

Keluhan pemilik atas halaman ini sama dengan keluhan yang melahirkan issue #266
di app internal ("dominan putih-hitam dengan outline saja"), ditambah satu
kalimat yang menentukan bentuk jawabannya: *"gunakan warna solid juga, jangan
hanya outline atau border saja."*

Itu berlawanan arah dengan pola yang benar untuk produk keuangan (*Trust &
Authority*: navy/abu korporat, biru kepercayaan, aksen hanya untuk CTA).
Tegangannya diselesaikan lewat peran warna, bukan jumlahnya: warna di sini
membawa hierarki (mana wilayah, mana yang disorot), tidak dipakai sebagai
hiasan.

### Empat aturan yang membuat izin ini tidak berkembang jadi palet sendiri

1. **Satu hue sejak 10 Okt 2026; keempat hue tetap sah, tiga tidak dipakai di
   halaman ini.** Izin palet ini dulu "empat hue, keempatnya tanpa arti di app
   ini": biru merek, cyan, indigo (`geekblue`), violet (`purple`). Di layar,
   pembaca yang menuruni halaman melewati gradien brand→cyan (hero) → kartu
   manfaat indigo/cyan/violet → pita cyan (modul) → kartu "untuk siapa"
   indigo/violet/cyan → pita brand (integrasi) → pita indigo (harga) → pita
   pekat → kaki indigo. Keluhan pemilik, *"terlalu warna warni"*, punya sebab
   yang bisa dihitung: empat hue di sembilan permukaan.

   Yang dicabut adalah pemakaiannya: seluruh pita, `fill`, dan `chip`
   pendaratan kini `brand`. Tidak ada informasi yang hilang, karena kartu sudah
   dibedakan ikon + judulnya (argumen yang sama dengan §"Daftar modul: satu
   ikon per baris, SATU warna").

   `cyan`/`indigo`/`violet` tetap dideklarasikan (`LANDING_HUES`, dipakai juga
   `/platform`) dan tetap lolos ukuran kontrasnya. Menghidupkannya kembali di
   pendaratan menuntut alasan yang menyebut apa yang dibedakannya, bukan selera
   irama. **Hijau, merah, emas, jingga tidak dipakai sebagai nada dekoratif**:
   keempatnya sudah menjadi bahasa uang & status (`colorMoney*`,
   `colorSuccess`, `colorWarning`, `colorError`), dan pita hijau selebar layar
   di halaman yang menjual pembukuan terbaca sebagai pernyataan tentang angka.
2. **`color-mix()` di atas permukaan yang sedang berlaku, bukan anak tangga
   palet telanjang.** Resepnya milik `packages/ui/src/theme/tone-recipe.ts`,
   modul netral-permukaan yang juga dipakai `/platform` (MASTER.md §Permukaan
   KETIGA). Yang dibagi hanya bentuk `color-mix`-nya; kadar di bawah tetap
   milik halaman ini. Tangga AntD (`--ant-blue-1` … `-10`) membalik di tema
   gelap, jadi `blue-1` gelap (`#111a2c`) praktis sewarna latar halaman gelap
   (`#141414`), dan pitanya lenyap di satu tema tanpa ada tes yang gagal.
   Resepnya satu, `color-mix(in srgb, var(--ant-<hue>-6) N%, var(--ant-color-bg-*))`,
   dan otomatis menjadi tint terang di tema terang dan tint gelap di tema gelap.
   Hasilnya opak; `colorFillQuaternary` yang digantikannya translusen 2–4% dan
   praktis tak terlihat.
3. **Kadar campurannya dibatasi tombol, bukan selera.** Kadarnya `LANDING_MIX`
   di `landing-scale.ts` (angka terukur & alasannya di komentar konstanta itu).
   Pita diukur terhadap teks ≥4,5:1, isian tombol primer ≥3:1, dan tepi tombol
   garis ≥3:1 di kedua tema, jadi **pita boleh memikul tombol**. `fill-*` dan
   `chip-*` di bawah 3:1 terhadap isian primer gelap, jadi **tidak boleh ada
   tombol primer di atasnya**. Kartu paket karena itu berbadan
   `--sai-landing-surface` dan hanya kepalanya bernada. Bila isian tombol
   berubah, kadarnya diukur ulang; `tests/landing-colors.test.ts` menghitung
   semuanya.
4. **Warnai pitanya ATAU kartunya, tidak keduanya.** Nada di atas nada sehue
   saling meniadakan di tema terang (1,03:1). Kartu fitur bernada karena
   seksinya polos. Kartu modul & paket berdiri di atas pita, jadi badannya
   `--sai-landing-surface` dan **tepinya tidak boleh dicabut**: di tema gelap
   jenjang kartu-vs-pita hanya 1,01–1,06:1, dan yang memisahkan keduanya adalah
   `colorBorderSecondary`.

### Nada `accent` dipakai TEPAT SEKALI — di sorotan radial hero

Puncak halaman adalah pita pekat (bagian berikut), bukan tint. `accent`
dipakai tepat sekali, untuk sorotan radial di kuadran hero
(`landing-hero.tsx`), yang harus lebih pekat daripada `band-brand` di bawahnya
agar hero punya satu sumber cahaya. Ia bukan nilai `tone` seksi (`LandingTone`
tidak mengenal `accent`; dijaga `tests/landing-colors.test.ts`), karena dua
puncak berarti tidak ada puncak. Kadarnya tetap dikunci ambang tombol primer
(hero memikul tombol).

### Pita PEKAT — ajakan penutup sebagai PUNCAK (#401)

Semua pita lain tint pada satu tingkat kecerahan; tanpa satu bidang pekat
halaman berakhir datar. Karena itu `LandingClosingCta` =
`LandingSection tone="solid"`, satu-satunya puncak.

| Peran | TERANG | rasio | GELAP | rasio |
|---|---|---|---|---|
| Pita `--sai-landing-band-solid` = `--ant-color-brand-solid` | `#1E3A5F` | — | `#2F6FBF` | — |
| Judul & tombol-label: `colorTextLightSolid` di atas pita | putih | **11,50** | putih | **5,06** |
| Catatan penenang: putih **92%** di atas pita | — | 10,84 | — | **4,56** |
| Isian tombol `inverse` (putih) sebagai bidang vs pita | — | 11,50 | — | 5,06 |
| Label tombol `inverse` (`brand-solid`) di atas isian putih | — | 11,50 | — | 5,06 |
| …saat hover (isian putih 94% + navy) | — | 10,4 | — | **4,68** |
| …saat aktif (isian putih 92% + navy) | — | 10,1 | — | **4,56** |
| Isian tombol `primary` vs pita (DILARANG) | — | **1,00** | — | 1,00 |

Semua angka dihitung ulang tiap suite berjalan (`tests/landing-colors.test.ts`
§"pita pekat"), dari token yang terpasang dan dari kadar yang diurai dari
`LANDING_STYLE` / `INVERSE_BUTTON_STYLE`, tidak diketik ulang di tes.

Empat keputusan yang lahir dari angka itu:

1. **Teks redup 92%, bukan 85%.** Issue meminta "putih 85%", tetapi 85% di
   atas navy tema gelap hanya 4,14:1, dan 90% → 4,44. 92% adalah kadar
   terendah yang lolos, dan tesnya mengunci bahwa ia memang batas (90% masih
   gagal). Akibatnya hierarki judul/kalimat di pita ini datang dari ukuran,
   karena selisih warnanya tipis.
2. **Tombol `inverse`, bukan `primary`.** Isian primer sama dengan isian merek
   pitanya (1,00:1), sehingga tombol lenyap sebagai bidang. `variant="inverse"`
   (`packages/ui/src/components/button.tsx`) adalah varian bernama (isian
   putih, label navy), bukan gaya sebaris ad-hoc. Guard penekanan
   (`tests/button-emphasis.test.ts`) menghitungnya sebagai ajakan penuh: satu
   per wadah, dan di pendaratan harus menuju `/register`. `primary`/`default`
   dilarang di `landing-closing-cta.tsx` (dijaga).
3. **Hover/aktif tombol terbalik menggelap tipis (94% / 92% putih).** Yang
   mengikat adalah label navy di atas isian saat disentuh di tema gelap: 90%
   putih sudah 4,44. Label yang tetap terbaca lebih penting daripada hover yang
   jelas.
4. **Ditulis lewat variabel CSS per-elemen AntD** (`--ant-btn-bg-color`,
   `-hover`, `-active`, `--ant-btn-text-color*`;
   `antd/es/button/style/variant.js`), sebaris. Kelas ber-hash yang disalin
   akan berhenti berlaku tanpa tanda, dan `ConfigProvider` bersarang menuntut
   warna mentah serta membangkitkan lembar gaya kedua.

**Hanya satu pita pekat.** Sidebar navy 40px di dalam kerangka aplikasi (hero
& galeri) memakai token yang sama, tetapi ia strip di dalam gambar produk,
bukan pita, dan tidak memikul tombol. Pita `solid` kedua di halaman ini
menghapus puncaknya.

**Tombol WhatsApp melayang (#402) juga bukan pita.** Ia bulatan 48px
`position:fixed` kanan-bawah (`bottom/right: margin-lg`), isian
`--ant-color-brand-solid` + glif putih (11,50 / 5,06:1, angka `BrandMark`),
`landing-whatsapp.tsx`. Aturan satu pita menyasar bidang navy selebar layar
yang memikul ajakan; ini bidang kecil yang memikul satu ikon. Angka &
keputusannya:

| | TERANG | GELAP |
|---|---|---|
| glif putih di atas isian diam / hover / aktif (`brand-solid`, `-hover`, `-active` — token global baru = `PRIMARY_BUTTON_*`) | 11,50 / 13,38 / 16,59 | 5,06 / 6,24 / 8,64 |
| bidang navy vs latar halaman | 11,50 | 3,64 |
| bidang navy vs `band-brand` / `band-cyan` (hero yang dilintasinya) | 9,55 / 10,23 | 3,22 / 3,02 |
| bidang navy vs pita penutup (token yang SAMA) | **1,00** | **1,00** |
| cincin 2px `colorBgContainer` vs pita penutup | 11,50 | 3,64 |

- **Cincin `border` 2px `colorBgContainer`, bukan `box-shadow` tulisan
  tangan.** Tanpa cincin bulatannya lenyap saat melintasi pita penutup
  (1,00:1); di atas halaman cincin sewarna latar dan tak terlihat. Bayangan
  melayangnya token `--ant-box-shadow`.
- **Bukan hijau WhatsApp**: hijau berarti uang masuk di app ini, dan
  `tests/landing-colors.test.ts` menolak warna mentah.
- **`Button href` `outline` + gaya varian bernama (`WHATSAPP_FAB_STYLE`),
  bukan `primary`.** Ia tautan keluar (`https://wa.me/…`, tab baru, `rel`
  noopener), dan guard penekanan mengunci primer pendaratan ke `/register`;
  dijaga eksplisit di `tests/button-emphasis.test.ts`. Sumbernya
  `contactChannels()`: nomor kosong / salah bentuk berarti tidak dirender.
- **Hover/aktif lewat token global `--ant-color-brand-solid-hover` /
  `-active`** (`antd-tokens.ts` `brandSolidHover/Active`, nilainya =
  `PRIMARY_BUTTON_*`). Token komponen `Button` (`colorPrimaryHover`) terukur
  tidak sampai ke dokumen sebagai variabel (`getComputedStyle` →
  `--ant-button-color-primary-hover` kosong), dan `var()` yang tak teratasi
  membuat isian hover jatuh ke `unset`.
- **Hanya ≥576px, diukur** (issue: "kalau bertabrakan, ≥576px"). Di 320/390
  tombol hero bertumpuk selebar isi (x 16–304 / 16–374), dan bulatan 48px
  menempati x 248–296 / 318–366, menutupi 48px = 17% / 13% lebar ajakan utama
  pada setiap posisi gulungan yang menaruhnya di 72px terbawah layar. Di 576px
  tombol hero berjajar dan berakhir di x=191, bulatan di x=504–552, jadi
  keduanya tidak bersentuhan. Di bawah 576px WhatsApp hanya lewat jawaban FAQ
  dukungan.

### Hijau/merah/emas/jingga: TERMASUK glif dan lencana

Aturan "keempatnya sudah menjadi bahasa uang & status" berlaku juga untuk glif
ikon dan lencana:

- Centang "modul ini ada" dan "kuota ini termasuk" bukan pernyataan tentang
  uang; lima belas centang hijau di halaman yang menjual pembukuan terbaca
  sebagai pernyataan tentang angka. Keduanya `colorPrimary`.
- Lencana "Selalu aktif" dan "Direkomendasikan" bukan status *berhasil*;
  keduanya `Badge variant="default"` (netral berisi). Yang dijaga tes adalah
  bahwa lencananya berteks, bukan warnanya.

Satu-satunya tempat warna uang dipakai di halaman ini adalah purwarupa produk,
tempat ia memang menyatakan uang (hijau kas, merah utang). Di sana pun label
barisnya sudah menyebutnya, jadi warna bukan penanda tunggal.

### Yang DITOLAK karena melewati batas kepercayaan

- **Pita ajakan penutup dari tangga biru AntD dengan teks putih.** Gagal karena
  aritmetika: tangga biru membalik di tema gelap, jadi tidak ada satu anak
  tangga biru yang bisa memikul teks putih di kedua tema (`blue-7` terang
  6,16:1 tapi gelap 3,54:1; `blue-6` gelap 5,19:1 tapi terang 4,10:1).
  Memaksanya berarti mencabang tema di dalam blok gaya pendaratan, yaitu
  mekanisme tema kedua di satu halaman. Pita pekat yang sah memakai token
  `colorBrandSolid` (§Pita pekat di atas): satu nilai per tema yang dipilih di
  `antd-tokens.ts`, jadi tidak ada branch tema di halaman.
  Ini berlaku untuk biru, tidak untuk setiap hue: `geekblue-6` dan `purple-6`
  memikul teks putih di kedua tema, dan yang menjatuhkan bidang pekat mereka
  adalah elemen lain di atasnya (`pages/platform.md` §Yang DITOLAK).
- **Permukaan gelap permanen (`SIDER_BG_DARK`) sebagai pita penutup.** Teksnya
  lolos, tetapi isian tombol primer di atasnya gagal 3:1 sebagai bidang, dan
  tombol ajakan harus bisa ditemukan sebagai bidang. Di atas bidang pekat,
  tombolnya harus terbalik, bukan primer.
- **Tombol `primary` di atas pita navy merek.** Isian primer sama dengan isian
  pitanya: 1,00:1 di tema terang. Dijaga `tests/landing-colors.test.ts`
  (aturan terbalik); yang sah di sana `variant="inverse"`.
- **Nada per kategori untuk kesepuluh kartu modul.** `BUSINESS_MODULES` tidak
  punya kategori; mengarangnya di halaman pemasaran adalah klaim tanpa sumber
  (§KLAIM HARUS PUNYA SUMBER), dan sepuluh hue berdampingan tidak membentuk
  hierarki.

### Guard-nya

`tests/landing-colors.test.ts` menghitung ulang setiap pasangan
teks-di-atas-warna (sejak #402 juga kepala Pro vs kepala Enterprise, pil strip
fakta vs gradien hero, dan tombol WhatsApp melayang di setiap keadaan) dari
token yang terpasang dan dari resep `color-mix` yang diurai dari
`LANDING_STYLE` sendiri, tidak diketik ulang di tes. Ia mengunci: teks ≥4,5:1
di kedua tema, isian tombol ≥3:1 pada setiap permukaan yang memikulnya, glif
ikon ≥3:1 di atas kotaknya, dan lantai 1,05:1 "nada ini benar-benar ada di
layar". Ia juga mengunci batas terbalik, yaitu bahwa `fill-*`/`chip-*` tidak
layak memikul tombol, supaya pemisahan badan/kepala kartu paket tidak dicabut
tanpa sengaja.

## Yang TETAP BERLAKU PENUH (jangan tawar)

- **`variant` ditulis eksplisit di setiap `<Button>`.** Pengecualian di atas
  membebaskan halaman ini dari batas jumlah primer, bukan dari menuliskannya.
  Bawaannya `secondary`, jadi tombol ajakan yang tidak menulis
  `variant="primary"` kehilangan penekanannya tanpa tanda.
- **Primitif**: tombol lewat `Button` (ikon `size="icon"`), kartu lewat `Card`.
  Dijaga `tests/design-system-primitives.test.ts` (lingkupnya mencakup
  `src/components`, jadi `src/components/landing/**` ikut terjaga).
- **Ikon `@ant-design/icons`**, ukuran lewat `fontSize`, dekoratif `aria-hidden`,
  tanpa emoji.
- **Target sentuh ≥ 40px**; CTA hero memakai `size="lg"` (48px).
- **Kontras ≥ 4.5:1** dan **fokus keyboard terlihat**; ada tautan lewati-ke-isi
  sebelum bilah atas.
- **Teks penting ≥ 14px**: catatan harga memakai `--ant-font-size` eksplisit,
  bukan `<small>` (latar dokumen 16px ⇒ `<small>` = 12,8px).
- **Dua tema.** Latar halaman `colorBgContainer`; pita seksi lewat nada pekat
  (§Nada pekat), yang mengikuti tema karena resepnya dicampur ke permukaan yang
  sedang berlaku, tanpa branch tema di halaman ini. Setiap pembatas bidang
  tetap punya `border`, juga ketika nadanya sudah berbeda.
- **Nama produk lewat `APP_NAME`**, lambang lewat `BrandMark`, bukan literal.
- **Trilingual.** Semua teks lewat kunci `landing.*` di ketiga kamus; kunci yang
  hilang ditolak `tsc`.
- **Tetap server component.** Ini halaman pertama bagi pengunjung tanpa sesi;
  `AMBANG_KLIEN` di `tests/rsc-boundary.test.ts` menguncinya. Dua daun client
  (`LocaleToggle`, `ThemeToggle`) tidak menarik apa pun di atasnya.

## Aturan khusus halaman ini: KLAIM HARUS PUNYA SUMBER

Di halaman pemasaran angka paling mudah keliru tanpa ketahuan: orang mendaftar
karena satu angka lalu ditagih angka lain.

- **Harga & kuota** dari `activePlans()` (tabel `plans`), tidak diketik ke
  markup. `isActive: false` tidak ikut: paket yang ditarik masih dipakai
  pelanggan lama tetapi tidak boleh ditawarkan lagi.
- **Harga adalah DPP.** `platformInvoiceAmounts()` menambahkan PPN di atasnya,
  jadi catatan PPN wajib ada, mengikuti sakelar (`PLATFORM_PPN_DISABLED`) dan
  tarif (`packages/core/src/tax.ts`) yang sama dengan yang menagih.
- **Nominal paket tidak dibesarkan ke skala hero.** Yang paling besar di
  halaman ini adalah kalimat yang menjelaskan produknya; halaman yang angkanya
  lebih besar dari janjinya menjual harga, bukan pekerjaan. Nominal memakai
  `--sai-landing-font-size-section` (sebesar judul seksi, di bawah hero).
- **Lama uji coba** dari `TRIAL_DAYS`, konstanta yang sama yang menghitungnya.
- **Nama PT tidak pernah muncul di sini.** Pemasangan multi-PT belum bisa tahu
  tenant mana yang sedang datang, dan nilai fallback-nya nama pemasang pertama.
  Ini kesalahan yang sama yang dilarang MASTER §Orientasi Perusahaan untuk
  dokumen tercetak.
- **Tidak ada tombol yang menjanjikan lebih dari yang dikerjakan.** Tombol di
  kartu paket menuju `/register` tanpa `?plan=`: pendaftaran tidak menerima
  pilihan paket (setiap tenant lahir di paket `trial`), dan parameter yang tidak
  dibaca siapa pun terbaca sebagai janji bahwa paketnya sudah dipilih.
- **Klaim tanpa sumber di kode dilarang**: "tanpa kartu kredit", "gratis
  selamanya", jumlah pelanggan, logo perusahaan yang tidak memberi izin.
- **Teks paket lewat kunci kamus, bukan kolom basis data.** `plans.description`
  disemai sebagai literal bahasa Indonesia (`scripts/seed-plans.ts`). Dirender
  apa adanya, kartu Pro berbahasa Inggris berbunyi *"Sampai tiga PT, lima belas
  pengguna."* tepat di atas baris kuota *"3 companies / 15 users"*: satu fakta,
  dua bahasa. Pemetaannya di `packages/billing/src/plan-copy.ts`; paket buatan
  operator jatuh ke kolomnya. `name` sengaja tidak diterjemahkan karena nama
  produk bukan teks antarmuka.
- **Paket rundingan tidak boleh tersortir ke depan.** Harganya `0.00` di
  katalog, jadi `orderBy: priceMonthly asc` telanjang menaruh kartu yang tidak
  bisa dibeli di posisi pertama. `contactOnly` disortir lebih dulu
  (`plan-catalog.ts`); ini kegagalan "Rp 0 terbaca sebagai gratis" di sumbu
  urutan.
- **`PLATFORM_CONTACT_EMAIL` wajib diisi bila katalog memuat paket rundingan.**
  Tanpa itu kartunya tidak punya tombol dan memajang kalimat untuk pemasang
  kepada calon pelanggan. Sudah didokumentasikan di kedua `.env*.example`.

## Halaman ini juga DIBAGIKAN, bukan hanya dibuka

Halaman ini satu-satunya permukaan yang ditempel orang ke WhatsApp, LinkedIn,
atau Slack, kanal yang menjadi jalur penjualan sebenarnya di Indonesia. Karena
itu:

- `generateMetadata` di `app/(marketing)/page.tsx`: judul, deskripsi (kalimat
  hero, bukan kalimat pemasaran kedua), kanonik, `openGraph`, `twitter`;
- `app/(marketing)/opengraph-image.tsx` dibangkitkan, bukan PNG. Warnanya
  harfiah dan hidup di `packages/ui/src/theme/antd-tokens.ts` (`OG_*`) beserta
  rasio kontrasnya, karena Satori tidak punya dokumen dan `var(--ant-…)` di
  sana tidak pernah teratasi;
- `app/sitemap.ts` menurunkan pohonnya dari `DOC_INDEX`, tidak mengetiknya;
- `app/robots.ts` melarang seluruh app internal. Itu bukan kontrol akses (yang
  tetap `proxy.ts`), tetapi agar perayap tidak memicu ribuan render dinamis
  yang pasti dipantulkan;
- data terstruktur (`FAQPage`, `SoftwareApplication`) diterbitkan di komponen
  tempat datanya hidup, bukan sebagai satu blok terpisah, karena salinan kedua
  yang ditulis jauh dari aslinya akan menyimpang. Paket rundingan tidak
  diterbitkan sebagai `Offer`: "IDR 0" yang dibaca mesin akan dipajang sebagai
  gratis.

**`hreflang` sengaja tidak dipasang.** Ia menuntut satu alamat per bahasa,
sedangkan aplikasi ini menyimpan bahasa di cookie, bukan segmen rute
(`packages/core/src/i18n/config.ts`). Ketiga bahasa berbagi satu alamat, jadi
`alternates` yang menunjuk alamat yang sama tiga kali memberi tahu mesin
pencari sesuatu yang tidak benar. Pasang hanya bila bahasa kelak pindah ke
`/(id|en|zh)/…`.

## Tombol menuju rute internal: `ButtonLink`, bukan `Button href`

`/register` dan `/login` adalah rute di dalam app, jadi keduanya `ButtonLink`
(#289): navigasi sisi-klien + prefetch. Sebelumnya keenam ajakan di halaman ini
memuat ulang seluruh aplikasi, sehingga tombol terpenting halaman ini juga
tautan paling lambatnya. Yang tetap `Button href` hanya `mailto:` paket
rundingan, karena itu tautan keluar.

Guard penekanan (`tests/button-emphasis.test.ts`) mengenali kedua tag.
Sebelumnya ia hanya mencocokkan `<Button>`, sehingga seluruh aturan #267 bisa
dilewati dengan `<ButtonLink variant="primary">`, termasuk batas "setiap primer
pendaratan menuju `/register`". Diukur saat diperlebar: 0 `<ButtonLink>` tanpa
`variant`, 0 wadah yang menjadi >1 primer karenanya.

## Layout akar pemasaran, `/pricing`, galeri layar (#399)

### Akar pemasaran sendiri — tanpa kamus & identitas perusahaan di payload

`/` dan `/pricing` hidup di route group `app/(marketing)/**` dengan root
layout-nya sendiri, terpisah dari `app/(app)/**`. Akar aplikasi memasang
`LocaleProvider` (kamus lengkap ikut payload RSC) dan `CompanyIdentityProvider`
(satu `GET /api/company/identity` per muatan). Halaman publik tidak
membutuhkan keduanya, dan memisahkan akarnya memangkas payload dokumen
pendaratan kira-kira separuh. Bagian yang sama (`<html>`, font, kelas pemikul
token, skrip tema, `AntdRegistry`, `AntdProvider`) ditulis sekali di
`RootDocument` (`packages/ui/src/providers/root-document.tsx`) dan dipakai
setiap root layout kedua aplikasi, supaya root layout-nya tidak menyimpang.

`AntdProvider` sengaja tetap di akar pemasaran: ialah yang menulis blok
`.sai-tokens{--ant-…}` yang mewarnai seluruh pendaratan. Sisa JS-nya adalah
AntD (dua daun client `LocaleToggle`/`ThemeToggle`) dan runtime Next/React.
Menurunkannya berarti pendaratan tanpa satu pun komponen AntD, pekerjaan
tersendiri.

⚠ Dua daun client pendaratan menerima `locale`/label sebagai prop dari
komponen server (`landing-nav.tsx`, `landing-footer.tsx`), karena akar
pemasaran tidak memasang `LocaleProvider`. Daun client baru yang memanggil
`useT()` di sini menampilkan kuncinya sebagai teks. Pasang propnya, jangan
providernya.

### `/pricing` — komponen yang sama, alamat sendiri

Semua situs pembukuan berbahasa Indonesia yang ditinjau di #397 punya alamat
harga sendiri, sedangkan kita hanya jangkar. `/pricing` merender
`LandingPricing` + `LandingFaq` yang sama (judul harga menjadi `<h1>` lewat
`headingLevel`), dengan metadata & kanonik sendiri, masuk `sitemap.ts`,
dilepaskan `isPublicPath` di `proxy.ts`, dan pengunjung bersesi dipantulkan ke
`/dashboard` seperti `/`. Ia pintu masuk kedua ke `components/landing/**`
(`PINTU_MASUK`, `tests/landing-boundary`).

Akibatnya pada bilah & kaki, yang kini dipakai dua halaman: jangkar ditulis
berakar (`/#modul`, bukan `#modul`). Di `/` peramban tetap menggulung
dalam-dokumen, dan di `/pricing` ia menuju seksi yang benar. "Harga" adalah
`<Link href="/pricing">` di kedua halaman, bukan jangkar, sehingga perilakunya
tidak bercabang per halaman. Di kaki, tautan berakar itu `<Link>`, karena
`@next/next/no-html-link-for-pages` menolak `<a href="/#…">` harfiah.

### Galeri tiga layar — purwarupa dirender, di dalam pita modul

Kompetitor memperlihatkan beberapa layar produk; kita dulu satu kartu
ringkasan. `landing-gallery.tsx` menambah tiga purwarupa dengan pola
`landing-hero-mock`: jurnal umum (debit = kredit, jumlahnya dihitung dari
barisnya), faktur penjualan (PPN dari `computeTax`/`DEFAULT_TAX_RATE`, karena
itu berkasnya masuk `ALLOWED` di `tests/tax-rates.test.ts`), dan pengalih PT
(dua PT contoh). Ketiga syarat §"Angkanya karangan" berlaku penuh: label
"contoh tampilan" selalu terlihat, nama PT jelas contoh, `aria-hidden`; nominal
lewat `formatMoney()` server. Galeri hidup di dalam pita "Apa saja yang ada di
dalam" (sesudah daftar modul), bukan seksi sendiri: gambar layar menjawab
secara visual pertanyaan yang dijawab seksi itu dengan daftar, "apakah
pekerjaan saya ada di dalamnya".

#### Galeri memakai kerangka aplikasi, satu kartu dominan (#401)

Tiga kartu "dokumen" sejajar tanpa chrome aplikasi terbaca sebagai tiga kartu,
bukan tiga layar. Tiap layar karena itu dibungkus `LandingAppFrame` yang sama
dengan hero (bilah judul: nama layar + pengalih PT mini; sidebar 40px berikon
dengan modul layar itu aktif: jurnal → pembukuan inti, faktur → penjualan),
isinya di satu kartu area kerja (`FRAME_CARD`). Tata letaknya 1 besar + 2 kecil
di ≥992px (`[data-landing-gallery]`, 3fr:2fr; jurnal `grid-row: 1 / span 2` di
kiri) dan satu kolom di bawahnya; alasan titik patahnya di §Titik patah. Karena
kartu jurnal dua baris tingginya, jurnalnya berisi dua entri: penjualan kredit
dan pelunasan faktur yang sama (kas & bank ← piutang). Jumlah & keseimbangan
tiap entri tetap dihitung, dan ketiga layar membentuk satu cerita: faktur →
jurnal → pelunasan.

### Ikon menu ponsel: dua rule, spesifisitas (0,2,0)

Ditemukan pada build produksi (tidak terlihat di `next dev`): `≡` dan `×`
tampil bersamaan. `[data-landing-menu-close]{display:none}` berspesifisitas
(0,1,0), sama dengan `.anticon{display:inline-flex}` milik `@ant-design/icons`,
yang di produksi disisipkan sesudah blok pendaratan dan karena itu menang.
Ketiga rule ikon kini disarangkan di bawah `[data-landing-menu-toggle]`
(≥ (0,2,0)). Rule pendaratan yang menyasar elemen AntD tidak boleh
mengandalkan urutan penyisipan.
