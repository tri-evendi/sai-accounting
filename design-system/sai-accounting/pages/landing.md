# Halaman Pendaratan `/` — override MASTER.md

> Berlaku HANYA untuk `/` dan `/pricing` (`src/app/(marketing)/**` +
> `src/components/landing/**`).
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
| Tanpa hero / CTA | Hero + CTA **boleh** — itu memang tugas halaman ini. Ukurannya `--sai-landing-font-size-hero`, satu-satunya teks di aplikasi ini yang melampaui `fontSizeHeading1`. **FLUID**: `clamp(1,1× … 3.6vw … 1,3×)` di atas `--ant-font-size-heading-1` (≈42px → ≈49px). Angka mati 1,4× sebelumnya berarti hero yang sama besarnya di 576px dan di 2560px. ⚠ Langit-langitnya **1,3× sejak #401** (dulu 1,6× ≈ 61px): kolom kalimat hero kini 45% (~497px di 1440px) karena kerangka aplikasi memikul 55%, dan diukur dengan metrik Inter yang terpasang setiap judul ≤8 kata patah TIGA baris pada 61px di kolom itu; pada 49px judul ID/EN/ZH yang dipilih dua baris |
| `PageHeader` wajib untuk judul | **Tidak berlaku**: `PageHeader` membawa breadcrumb & kerangka dasbor. Halaman ini menulis `<h1>` sendiri, satu buah, di hero |
| Density 6/10 (nyaman untuk data) | Lebih longgar — `--sai-landing-rhythm` (64px → 96px) antar-seksi. Tidak ada tabel data di sini |
| Lebar penuh area kerja | Kolom baca dikurung: 72rem per seksi, 42rem per kolom teks, keduanya di tengah |
| Permukaan netral: halaman `colorBgLayout`, kartu `colorBgContainer` | **Bidang berwarna** — pita seksi & kartu berisi nada pekat `--sai-landing-band-*` / `-fill-*` / `-chip-*`. Lihat §Nada pekat di bawah |
| Satu aksi utama per layar (#267) | **Tidak berlaku**: halaman ini merender empat tombol berisi penuh sekaligus — bilah atas, hero, tiap kartu paket, penutup — dan itu memang bentuknya. **Batasnya**: keempatnya harus menuju tempat yang SAMA (`/register`), sebab yang sah adalah satu ajakan yang diulang, bukan empat ajakan yang bersaing. Dijaga `tests/button-emphasis.test.ts`; alasan lengkapnya di MASTER.md §Aksi utama per layar |

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

Perhatikan iramanya: **polos → pita → polos → pita**. Itu bukan kebetulan
melainkan hasil aturan tepi di bawah — seksi yang kartunya bernada wajib polos,
dan seksi yang pitanya bernada tidak boleh mewarnai kartunya. Dan iramanya
**memuncak** sekali, di ujung: semua pita lain tint 14–18% pada satu tingkat
kecerahan, ajakan penutup satu-satunya bidang pekat (§Pita pekat di bawah).

### "Untuk siapa" berdiri SESUDAH daftar modul, dan "Integrasi" adalah pita (#398)

Issue #398 membebaskan pilihan antara sesudah manfaat atau sesudah modul.
Sesudah modul, karena kartunya menyebut modul lewat NAMANYA (pil
`MODULE_META[m].labelKey`, kunci `BusinessModule` — modul yang dihapus ditolak
`tsc`): sebelum daftar modul kata "Perdagangan"/"Dokumen ekspor" belum
diperkenalkan; sesudahnya seksi ini menjawab *"dari sepuluh itu, mana yang
untuk saya"*. Dan menaruh seksi polos berkartu nada tepat di bawah seksi
manfaat yang bentuknya sama menghasilkan dua kisi identik berturut-turut —
persis keluhan "terlalu kaku".

"Integrasi & jalan keluar data" berbentuk **pita `brand` + daftar** (bentuk
seksi modul), bukan kartu — bukan karena selera: tanpa pita itu halaman
memajang TIGA kisi kartu bernada berturut-turut (untuk siapa → kepercayaan).
Enam butirnya semuanya punya sumber (`lib/efaktur.ts`, `lib/reconciliation.ts`
+ `lib/bank-statements.ts`, `lib/import/*` + `lib/coa-import.ts`,
`app/api/v1/*` + `lib/api-token.ts`, `lib/tenant-export.ts` +
`lib/report-export.ts`, `CURRENCIES`); yang tidak ada di kode (sinkron bank
otomatis, marketplace) tidak ditulis, dan tautan dokumennya `DocSlug | null` —
tanpa dokumen = tanpa tautan, bukan tautan ke topik terdekat.

Dua keberatan terbesar pada pembukuan multi-PT — *"apakah data saya bisa
tercampur"* dan *"apakah saya bisa keluar lagi"* — muncul saat orang
membayangkan MEMAKAI produknya, bukan saat ia melihat angkanya. Karena itu
seksi kepercayaan berdiri **sebelum** harga; menjawabnya sesudah harga berarti
menjawab kepada orang yang sudah pergi. Keempat isinya punya sumber di kode
(#104, `authz-effective.ts`, `lib/audit.ts`, `lib/tenant-export.ts`) dan
berakhir pada tautan ke `/docs`, yang publik — jadi klaimnya bisa diperiksa
sebelum ada yang mendaftar.

### Lencana keamanan, logo pelanggan, jumlah pelanggan: tetap DITOLAK

Pola *Trust & Authority* menyarankan ketiganya. Ketiganya tidak punya sumber di
repo ini, jadi §KLAIM HARUS PUNYA SUMBER berlaku penuh. Yang menggantikannya
bukan versi lebih lembut dari klaim yang sama, melainkan hal yang **berbeda
jenisnya**: mekanisme yang bisa diperiksa sendiri.

## Warna merek: NAVY INSTITUSIONAL (menggantikan biru bawaan AntD)

Keputusan pemilik berubah: warna merek bukan lagi `#1677ff` bawaan AntD —
biru itu terbaca sebagai warna *framework*, bukan merek — melainkan navy tua,
mengikuti riset jenis produk (perkakas faktur & pembukuan menaruh navy sebagai
primernya).

| Peran | TERANG | rasio | GELAP | rasio |
|---|---|---|---|---|
| `colorPrimary` (teks/aksen) | `#1E3A5F` | 11,50 | benih `#7FB0E4` → render `#6f99c5` | 5,52 |
| Isian tombol / lambang | `#1E3A5F` | 11,50 | `#2F6FBF` | 5,06 |
| Bibit nada (`brand`) | `#2F6FBF` | — | `#2F6FBF` | — |

### Empat hal yang HANYA ketahuan lewat pengukuran

Semuanya ditangkap penjaga atau audit, bukan mata:

1. **Bibit nada ≠ warna teks.** Nada pita diseed dari warna berbobot PERMUKAAN.
   Memakai `colorPrimary` (yang di tema gelap sengaja terang) menjatuhkan isian
   tombol ke **2,96:1** terhadap pita ajakan.
2. **Benih ≠ warna yang dirender.** Algoritma gelap AntD mentransformasi
   `colorPrimary`: benih 5,41:1 keluar sebagai **4,24:1**. Penjaga lama
   mengukur benih, jadi buta terhadap ini — kini ia mengukur nilai TERPAKAI.
3. **Lambang produk lenyap di tema gelap.** `BrandMark` menaruh glif putih di
   atas `colorPrimary`; dengan navy, di tema gelap itu **2,98:1**. Karena
   `colorPrimary` kini memikul dua peran berlawanan, isian merek mendapat
   tokennya sendiri: `--ant-color-brand-solid`.
4. **`chip` `/platform` 32% → 36%.** Mengikuti preseden yang sudah ada
   (30% → 32%): pada 32% violet kembali ke 3,03:1 terhadap isian tombol baru.

### Aturan yang lahir darinya

> **Warna merek punya TIGA peran, dan ketiganya token terpisah:**
> `colorPrimary` (teks/aksen) · `colorBrandSolid` (isian di belakang teks
> terang) · `colorBrandTone` (bibit nada permukaan).
> Di tema terang ketiganya kebetulan berdekatan; di tema GELAP ketiganya
> berbeda, dan menyatukannya akan mematahkan salah satu.

## "Terlalu kaku": apa yang menyebabkannya, dan apa yang mengubahnya

Keluhan pemilik atas versi sebelumnya — *"desain masih terlalu kaku"* — punya
sebab yang bisa ditunjuk, bukan selera: **enam seksi berturut-turut dengan
susunan identik** (label → judul → kalimat → kisi kartu seragam), **~20 kartu
bertepi 1px dengan radius 8px yang sama**, **nol keadaan hover**, dan **nol
kedalaman**. Halaman itu tertib sampai kehilangan denyut.

Empat hal yang mengubahnya, dan semuanya tetap diturunkan dari token AntD:

1. **Radius pendaratan sendiri** — `--sai-landing-radius`
   (`--ant-border-radius-lg` × 2 = 16px) untuk kartu, dan
   `--sai-landing-radius-control` (`--ant-border-radius` × 2 = 12px) untuk
   kendali. Radius app (6–8px) dipilih untuk KERAPATAN DATA; pendaratan tidak
   memikul tabel. Ini selisih terbesar antara "berwibawa" dan "kaku" pada
   bidang sebesar tombol ajakan.
2. **Kartu menjawab kursor** — `[data-landing-card]` mengangkat 3px + menaikkan
   bayangan ke `--ant-box-shadow`. Halaman yang tidak menjawab kursor terbaca
   sebagai GAMBAR, bukan sebagai perangkat lunak — kesan yang salah untuk
   halaman yang menjual perangkat lunak. Hanya `transform` + `box-shadow`
   (properti komposit), dan dimatikan di `prefers-reduced-motion`.
3. **Hero berlapis dua** — sorotan radial di kuadran tempat purwarupa berdiri,
   di atas gradien liniernya. Gradien linier sendirian berpindah warna dalam
   satu garis lurus: rapi, dan mati.
   ⚠ Kedua lapis WAJIB nada tingkat pita (≤16%), bukan `chip-*` (28%) — hero
   memikul tombol primer, dan di atas 16% isian tombol jatuh di bawah 3:1 di
   tema gelap.
4. **Kotak ikon menjadi LINGKARAN** dan kartu manfaat **kehilangan tepinya**
   (lihat §Tepi di bawah).

## "Polos sekali": kekayaan visual DATANG DARI ISI, bukan dari hiasan

Mencabut outline menyelesaikan kekakuan dan melahirkan masalah berikutnya —
bidang berwarna rata tanpa tepi terbaca **polos**. Yang mengembalikan
kekayaannya sengaja bukan ornamen (ornamen di produk keuangan terbaca murahan),
melainkan tiga hal yang semuanya menambah INFORMASI atau PERMUKAAN:

### 1. Purwarupa hero menjadi *stat tile* penuh — dengan sparkline

Kontrak *stat tile* (skill `dataviz`): **label · nilai · delta · tren**. Baris
"Selisih bersih" kini memikul keempatnya — nominal, `+12,4% vs periode lalu`,
dan sparkline 12 titik. Ini yang mengubah kartunya dari daftar angka menjadi
DASBOR, dan tidak satu piksel pun darinya hiasan.

- **Area, bukan garis** — deretnya satu (satu seri = area; banyak seri = garis).
- **Tanpa legenda** — satu seri; judul barisnya yang menamainya.
- Isian 20%, garis 2px, titik periode berjalan bercincin permukaan.

⚠ **Tanpa tooltip, crosshair, atau padanan tabel — dan itu pengecualian yang
DIBATASI.** Aturan bawaan `dataviz` mewajibkan keduanya untuk grafik. Ini bukan
grafik yang dibaca siapa pun: ia **gambar TENTANG grafik**, di dalam purwarupa
`aria-hidden` yang angkanya sudah dinyatakan contoh. Tooltip di sini justru
mengundang orang memeriksa angka karangan, dan lapisan hover menuntut
JavaScript sisi klien yang dikunci `AMBANG_KLIEN`. **Kalau kelak ada grafik
SUNGGUHAN di halaman ini — angka nyata yang dibaca orang — aturan itu berlaku
penuh dan pengecualian ini tidak menular.**

### 2. Kartu bernada mendapat KEDALAMAN, bukan bayangan

`landingFillSoft()` — gradien dua-henti yang sangat tipis (nada murni di bawah,
60% nada di atas permukaan). Efeknya: kartu menerima cahaya dari arah yang sama
dengan sorotan radial hero, jadi ia terbaca sebagai permukaan alih-alih swatch.

⚠ Ini **bukan** `box-shadow`. MASTER.md §Jarak, radius, bayangan melarang
menulis bayangan sendiri — nilainya berlapis tiga dan disetel per algoritma
tema. (Basis data gaya menyarankan *colored card shadows* `rgba(...,0.08)`;
saran itu **ditolak** karena bertabrakan dengan aturan tersebut.) Kedalaman di
sini datang dari ISIAN, yang memang milik pemanggil.

### 3. Hero mendapat TEKSTUR — kisi titik

Titik 1px pada kisi 22px, hanya 7% dari warna teks. Ia terlihat sebagai butiran
permukaan, tidak pernah sebagai pola, dan inilah selisih antara "bidang
berwarna" dan "bidang yang terasa punya permukaan". Pola baku pemasaran produk
keuangan justru karena ia menambah kedalaman **tanpa menambah satu elemen pun
yang harus dibaca**.

⚠ Tekstur berhenti di hero. Kisi titik di setiap pita akan menjadi pola, dan
pola adalah hiasan.

## Outline: aturan yang menggantikan "beri tepi pada segalanya"

Keluhan lanjutan pemilik — *"terganggu dengan penggunaan outline-nya, terlihat
sangat kaku"* — adalah keluhan #266 yang muncul kembali dari sisi sebaliknya.
Jawabannya bukan mencabut semua tepi (di tema gelap tepi memang memikul
pemisahan), melainkan **satu aturan yang menentukan kapan tepi diperlukan**:

> **Tepi hanya dipakai bila tidak ada NADA yang bisa menggambar batasnya.**

Diterapkan, aturan itu menghapus hampir semua outline di halaman ini:

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

Kartu keamanan dulu berdiri di atas pita `brand`, dan tepinya **wajib** di sana:
selisih kartu terhadap pitanya hanya 1,01–1,06:1 di tema gelap. Membalik
keduanya — seksinya polos, nadanya pindah ke kartu — menyelesaikan pemisahan
yang sama **tanpa satu garis pun**, dan tetap mematuhi §"warnai pitanya ATAU
kartunya, tidak keduanya". Halaman jadi berselang-seling: polos (kartu bernada)
→ pita → polos → pita.

### Kartu paket TETAP bertepi, dan itu bukan kelalaian

Ia satu-satunya kartu yang **memikul tombol primer**, jadi badannya wajib
`surface` (nada 14%/28% menjatuhkan isian tombol di bawah 3:1 di tema gelap —
§Nada pekat). Dan ia berdiri di atas pita, tempat `surface` tanpa tepi
menghilang di tema gelap. Dua batasan itu berpotongan tepat di satu titik:
tepi. Jangan mencabutnya.

### Pemisah seksi: bentuknya yang diubah, bukan keberadaannya

**Diukur ulang di peramban pada token yang benar-benar terpasang**, bukan
dikutip: selisih pita terhadap latar halaman hanya **1,09:1 di tema terang** dan
**1,14:1 di tema gelap**. Warna sendirian TIDAK menggambar batas wilayah di
kedua tema, jadi pemisahnya tidak bisa dicabut.

Yang diubah bentuknya: bukan lagi `border-top` selebar viewport melainkan
`::before` bergradien — pekat di kolom tempat isi berdiri, meleleh menjadi nol
sebelum tepi layar. Batasnya tetap terbaca; kesan "kertas bergaris" hilang.

### Tepi hanya wajib untuk kartu DI ATAS PITA

Kartu manfaat bernada dan berdiri di seksi **polos**: nadanya sendiri yang
menggambar batasnya, jadi tepi 1px di sana murni kekakuan. Aturan "tepi tidak
boleh dicabut" tetap berlaku penuh untuk kartu di atas **pita** — di sana
selisih kartu terhadap pitanya hanya 1,01–1,06:1 di tema gelap dan tepi itu
satu-satunya pemisahnya.

### Daftar modul BUKAN sepuluh kartu

Blok paling kaku di halaman ini adalah seksi terpanjangnya: sepuluh `Card`
berpermukaan melayang di kisi tiga kolom. Yang hilang bersama kartunya tidak
ada — modul di sini bukan sesuatu yang diklik, dibandingkan, atau dipilih; ia
**daftar isi**. Sekarang: dua kolom, centang + label + keterangan, tanpa satu
kotak pun. Pita seksinya sudah menggambar wilayahnya.

### Yang DICOBA lalu dibuang: kisi manfaat asimetris

Kartu pertama membentang penuh, tiga sisanya di dua kolom. Terlihat di layar
dan dibuang: tiga sisa di dua kolom menyisakan **satu kartu yatim** di baris
terakhir, yang terbaca sebagai kisi yang gagal memuat — bukan sebagai
penekanan. Irama halaman ini dipecah di daftar modul, bukan di sini. Jangan
menghidupkannya kembali tanpa menyelesaikan yatimnya lebih dulu.

### Potongan UI di kartu manfaat & pil modul berikon (#402)

Sesudah hero memakai kerangka aplikasi (#401), seksi manfaat adalah yang
pertama kembali ke "ikon + judul + paragraf" — kompetitor tidak pernah berhenti
memperlihatkan produknya. Tiap kartu kini memuat SATU potongan UI kecil,
dirender server, yang menggambar hal yang kalimatnya katakan
(`landing-features.tsx`):

| Kartu | Potongan | Sumbernya |
|---|---|---|
| Buku terpisah per PT | pengalih PT — chip yang SAMA dengan bilah kerangka (`FRAME_CHIP`, diekspor dari `landing-app-frame.tsx`) + kalimat `mockSwitcherHint` | nama PT contoh (`mockCompany*`) |
| Peran & jejak audit | tiga lencana peran (chip indigo) + baris "siapa · kapan · apa" | `ROLES` + `roleLabels()` — penolong yang sama dengan halaman Pengguna, bukan kunci kamus yang dirakit dinamis |
| PPN & e-Faktur | tabel tiga baris DPP / PPN / total | `computeTax(DEFAULT_TAX_RATE)` — kunci baris yang sama dengan faktur galeri; berkasnya masuk `ALLOWED` `tests/tax-rates.test.ts` |
| Tiga bahasa | pil bahasa | `LOCALES` + `LOCALE_LABELS` (nama dalam bahasanya sendiri) |

Aturan yang mengikatnya:

- **Primitif kerangka, bukan bentuk baru.** Wadah potongan = `FRAME_CARD`
  (permukaan `colorBgContainer` bertepi — tepinya WAJIB: ia berdiri di atas
  kartu BERNADA, 1,2–1,5:1 tanpa tepi), pil = `landingChip` sehue kartu.
- **§Angkanya karangan berlaku pada satu-satunya potongan bernominal (PPN)**:
  label "contoh tampilan" (`mockCaption`, kunci yang sama) di dalam kartunya —
  jadi labelnya kini tampil LIMA kali di `/` (hero + 3 galeri + 1), dikunci
  `tests/public-landing.test.tsx`. Seluruh potongan `aria-hidden` (ilustrasi
  kalimat di atasnya). Nama peran & bahasa bukan angka karangan.
- **Potongan SELEBAR kartu, di bawah baris ikon+teks — DIUKUR.** Di 320px
  kolom teks kartu hanya ±184px (kartu 288 − padding 48 − ikon 40 − jarak 16)
  dan tabel DPP/PPN/total menuntut ±200px; di lebar kartu penuh (±240px) ia
  muat tanpa memotong nominal. Overflow potongan terukur 0 di 320/390/576/
  768/992/1440. Tinggi kartu tidak lagi seragam (1440: 208/208/267/267;
  390: 232/281/314/223) — kisi `landingGrid` meregangkan per baris, jadi
  yang berpasangan sebaris tetap sama tinggi.
- **Tiga peran, bukan empat**: pil "Administrator Sistem" patah ke baris
  ketiga di kartu 280px.
- **Pil modul "Untuk siapa"** kini berikon `MODULE_ICON` (peta yang sama
  dengan daftar modul & sidebar kerangka), 32px, `fontWeight 500`, glif anak
  tangga -8 sehue (≥3:1 di atas chip — pasangan yang sudah diukur). Pil
  menunjuk balik ke baris yang baru dibaca di seksi modul, bukan sekadar
  menyebut namanya.
- **Keterangan Integrasi dipangkas ke SATU kalimat** di ketiga bahasa
  (`integration*Body`); klaimnya tidak berubah, hanya panjangnya.

## Seksi kontak — DICABUT dari pendaratan

Pendaratan pernah punya satu seksi `#kontak`: formulir "hubungi kami" (server
action `lib/contact-actions.ts`, tanpa JavaScript, `zod` di server, perangkap
madu + pembatas laju persisten) ditambah daftar kanal dukungan. Keduanya
**dihapus** — beserta komponennya (`landing-contact.tsx`), server action-nya,
kunci kamus `landing.contact*`/`landing.navContact` (kecuali
`contactWhatsappCta` yang dipakai tombol melayang), jatah laju `contactIp`, dan
tautan `#kontak` di bilah/kaki/panel menu.

**Jalan menghubungi yang TERSISA — dan hanya yang memang ada kodenya:**

| Jalan | Di mana | Sakelarnya |
|---|---|---|
| Tombol WhatsApp melayang | kulit pendaratan, ≥576px | `PLATFORM_CONTACT_WHATSAPP` sah (`contactChannels()`) |
| `mailto:` paket rundingan | kartu Business di seksi harga | `PLATFORM_CONTACT_EMAIL` terisi |
| Jawaban FAQ "kalau ada masalah" | `landing-faq.tsx` | menyebut alamat surel bila terisi, selain itu dokumentasi saja (`faqSupportADocsOnly`) |

⚠ Yang ikut hilang bersama seksinya: satu-satunya jalan menghubungi yang tidak
menuntut orang punya klien surel atau WhatsApp. Kalau kelak seksi ini
dikembalikan, alasan-alasan lamanya masih berlaku dan tercatat di riwayat git
(`git log -- src/components/landing/landing-contact.tsx`): server action bukan
formulir klien (pendaratan nol JS), tombol kirim `outline` bukan `primary`
(setiap primer pendaratan menuju `/register`), dan tanpa jam layanan/SLA.

## Setiap seksi harus punya JALAN KELUAR, bukan berhenti di tempat

Empat seksi dulu berakhir buntu — pembaca sampai di ujungnya tanpa langkah
berikutnya, tepat di titik ia paling mungkin pergi. Yang ditambahkan bukan
ajakan kedua (itu akan melanggar §Aksi utama per layar), melainkan **jalan
memeriksa**:

- **Kepercayaan** — tiap butir menautkan DOKUMENNYA sendiri. Seksi ini berjanji
  "dokumentasinya terbuka untuk diperiksa"; tombol tunggal di kakinya menjawab
  secara umum, tautan per butir menjawab secara khusus.
  ⚠ **Jejak audit sengaja TANPA tautan.** `DOC_INDEX` belum punya halaman yang
  membahasnya, dan menautkannya ke dokumen terdekat adalah penunjuk PALSU —
  pembaca mengklik lalu menemukan topik lain, merusak persis kepercayaan yang
  sedang dibangun. Slug-nya bertipe `DocSlug`, jadi dokumen yang dihapus
  ditolak `tsc`, bukan menjadi tautan mati di halaman publik.
- **Harga** — kalimat "semua paket mendapat". Kartu paket hanya menjawab *apa
  bedanya* (kuota); yang lebih dulu ditanya orang adalah *apa yang saya dapat
  terlepas dari paket mana pun*. Tanpa itu pembaca menyimpulkan modul, bahasa,
  dan mata uang ikut dijatah — padahal tidak. Ketiga angkanya dihitung dari
  registri yang sama dengan strip bukti di hero. (Sejak #397 bentuknya SATU
  KALIMAT, bukan strip kedua — §Strip fakta muncul sekali.)
- **FAQ** — sebelas pertanyaan tidak mungkin menutup semuanya; yang
  pertanyaannya tidak ada di sana sebelumnya sampai di ujung tanpa jalan ke
  mana pun.
- **Ajakan penutup** — satu kalimat penenang tepat di bawah tombol, tempat
  keraguan menit terakhir muncul. Angkanya dari `TRIAL_DAYS`.
  ⚠ "Tanpa kartu kredit" TIDAK ditulis — tak ada kode di repo ini yang
  menjaminnya.

## Label kategori (eyebrow) di atas setiap judul seksi

Setiap seksi dulu dimulai **dingin** — langsung `<h2>`, tanpa apa pun yang
memberi tahu pembaca yang menggulung cepat bahwa ia memasuki wilayah lain. Pita
berwarna melakukannya untuk mata, tetapi tidak untuk orang yang memindai teks,
dan sama sekali tidak untuk pembaca layar.

Bentuknya: 12px, tebal, huruf besar, `letter-spacing: 0.08em`, warna merek. Dua
aturan yang mengikatnya:

- **`<p>`, bukan heading.** Menyisipkan `<h3>` di atas `<h2>` mematahkan urutan
  tingkat heading yang justru dipakai pembaca layar untuk menavigasi.
- Ini salah satu dari sedikit tempat `--ant-font-size-sm` (12px) sah untuk teks
  yang bukan keterangan berulang — MASTER.md melarangnya untuk **data**. Di sini
  ia label struktural, dan huruf besar + `letter-spacing` menjaganya terbaca.

## Kaki halaman berkolom

Merek + tiga kolom bertajuk (Produk / Sumber / Ketentuan) + bilah bawah berisi
hak cipta dan sakelar tampilan. Kaki halaman adalah tempat orang **mencari**
yang tidak ditemukannya di atas; kolom bertajuk menjawab "di mana saya
melihatnya" tanpa membaca setiap tautan. Sakelar turun ke bilah bawah karena ia
bukan tautan — di dalam kolom bertajuk ia terbaca sebagai salah satu tujuan.

Tahun hak cipta **dihitung** (`new Date()`), aman justru karena halaman ini
`force-dynamic`. Tahun yang diketik salah setiap 1 Januari.

## Purwarupa produk di hero (bukan tangkapan layar)

Hero mengurung kalimatnya pada 42rem di dalam seksi 72rem — sehingga di layar
lebar ~40% sisi kanannya adalah bidang berwarna **kosong**, tata letak yang
berbentuk seolah sebuah gambar akan datang lalu tidak pernah datang. Dan sampai
perubahan ini halaman ini tidak memuat satu pun gambar produk: calon pelanggan
tidak bisa melihat satu layar pun sebelum membuat akun.

Yang mengisinya **dirender, bukan PNG** (`landing-hero-mock.tsx`) — ia mengikuti
tema, mengikuti bahasa, dan tidak bisa basi. Tangkapan layar menua diam-diam,
dan yang menua di halaman pemasaran memajang antarmuka yang sudah tidak ada.

### ⚠ Angkanya karangan — dan itu SAH, dengan tiga syarat

§KLAIM HARUS PUNYA SUMBER menyasar **klaim**: harga, kuota, lama uji coba,
jumlah pelanggan — hal yang dipercaya orang lalu ternyata berbeda saat ditagih.
Contoh tampilan bukan klaim tentang produk; ia gambar tentang BENTUK layarnya.
Batasnya dijaga tiga hal, dan ketiganya wajib:

1. **Label berteks yang selalu terlihat** — "contoh tampilan, angka di atas
   bukan data nyata", di dalam kartunya sendiri. Bukan `title`, bukan
   `aria-label`, bukan keterangan terpisah yang bisa terpotong di layar sempit.
2. **Nama perusahaannya jelas contoh** — "PT Contoh Satu". Bukan nama yang bisa
   dikira nyata, dan **bukan** nama PT pemasangan ini (§"Nama PT tidak pernah
   muncul di sini" tetap berlaku).
3. **`aria-hidden`** — isinya angka karangan; membacakannya kepada pengguna
   pembaca layar berarti membacakan data palsu seolah data.

Nominalnya lewat `formatMoney()` (fungsi server), **bukan** primitif `Money` —
yang sejak #186 komponen client. Satu `Money` di sini berarti hidrasi dibayar
setiap pengunjung yang mungkin tidak pernah mendaftar.

### Ilustrasi harus MENGATAKAN HAL YANG SAMA dengan kalimatnya

Judul hero berjanji *"satu PT — atau banyak"* — dan purwarupanya dulu
memperlihatkan SATU perusahaan. Gambar yang tidak mengatakan hal yang sama
dengan kalimat di sebelahnya adalah hiasan, bukan ilustrasi. Sejak #401 janji
itu digambar oleh **pengalih PT di bilah atas kerangka** (dua PT contoh, satu
aktif berisi nada, ikon tukar) — bentuk yang sama persis dengan penanda
perusahaan di app — di hero MAUPUN di ketiga layar galeri. "Tumpukan map"
versi sebelumnya (dua bilah menyembul di atas kartu) dibuang bersama kartunya:
kerangka aplikasi sudah punya tempat yang benar untuk mengatakan "PT ini bisa
diganti", dan itu tempat yang sama dengan di produknya.

### Kerangka aplikasi + kartu ponsel — hero sejak #401

Tinjauan visual terhadap tujuh kompetitor (2026-08-17): halaman kita bersih
tetapi terlalu editorial — banyak paragraf, sedikit produk; Kledo/Zoho/Wave
memenuhi setengah layar dengan kerangka aplikasi nyata. Hero kini komposisi
**"dasbor + ponsel"**, dirender:

- **`landing-app-frame.tsx`** — SATU komponen server untuk hero dan galeri:
  bilah atas (lambang `BrandMark`, nama layar, pengalih PT, lingkaran
  pengguna), **sidebar navy berikon** (enam modul dari `MODULE_META` +
  `MODULE_ICON` — registri yang sama dengan daftar modul, modul yang dihapus
  ditolak `tsc`), area kerja `colorBgLayout` berisi kartu `colorBgContainer`
  bertepi (jenjang yang sama dengan dasbor sungguhan), dan label "contoh
  tampilan" di kaki — dirender OLEH kerangka supaya tidak ada pemakai yang
  lupa. Bentuk `src/components/layout/*` DIRUJUK, tidak diimpor: semuanya
  client component.
- **Isinya**: tiga ubin angka (kas & bank / piutang / utang — angka contoh
  yang sama), satu grafik area (pola sparkline yang sama, 96px, tiga garis
  bantu 8% tanpa angka sumbu), baris "buku besar tersegel per periode".
  Selisih bersih tetap **dihitung** dari ketiganya.
- **Kartu ponsel** (`LANDING_PHONE_WIDTH` = 168px) bertumpuk di sudut
  kanan-bawah, menjorok 16px keluar kerangka ke kanan & bawah (masih di dalam
  gutter seksi — terukur tanpa gulungan mendatar), memperlihatkan layar yang
  sama versi ringkas. **Tanpa label contoh sendiri**: ia bagian komposisi
  yang labelnya di kaki kerangka, dan kaki itu **menyisakan ruang** selebar
  kartu ponsel (`padding-inline-end`) supaya kalimatnya tidak tertutup.
  Disembunyikan **<992px** — issue meminta <768px; diukur di 768px kerangka
  370px dan kartu ponsel menutupi 45%-nya (separuh grafik + ubin ketiga),
  kaki kerangka tinggal 170px untuk kalimat contoh. Di 992px kerangka 493px,
  kartu menutupi 34% — hanya ujung kanan grafik. Kartu "selisih bersih" karena
  itu menumpuk label/nilai/delta di KIRI, dan baris periode rapat kiri: yang
  boleh tertutup hanya ujung grafik, tidak pernah angka.
- **Sidebar navy = `--ant-color-brand-solid`**, bukan `SIDER_BG_DARK` (bukan
  variabel CSS; halaman ini hanya boleh menulis token). Glif putih di atasnya
  11,50 / 5,06:1 (angka `BrandMark`). Ia strip di dalam gambar produk, bukan
  pita, dan tidak memikul tombol — jadi tidak melanggar "satu pita pekat".
- **Ubin angka `flex-wrap` basis 120px, bukan kisi `auto-fit`**: di kerangka
  sempit tiga ubin tidak muat sebaris, dan dengan `flex-grow` ubin ketiga
  MELEBAR memenuhi barisnya alih-alih menyisakan kotak yatim setengah lebar
  (§Yang DICOBA lalu dibuang: kisi asimetris).

⚠ **Bentuk dalam kerangka mengikuti LEBAR KERANGKA (`@container`), bukan
viewport.** Kerangka yang sama berdiri di 55% kolom hero, ~60% kartu galeri
besar, dan ~40% kartu galeri kecil — tiga lebar pada satu viewport, jadi titik
patah viewport tidak bisa menjawabnya. Aturannya di `LANDING_STYLE`: <360px
sidebar disembunyikan (seperti app di ponsel), ≥520px PT kedua tampil di
pengalih dan sidebar yang MEMINTA label (`data-landing-frame-nav="wide"`,
hanya hero) menampilkannya. Peramban tanpa `@container` mendapat keadaan
bawaan: sidebar berikon tanpa label — kerangka yang lebih sederhana, bukan
yang rusak. Ini BUKAN titik patah keempat.

### Grafik area melebar penuh

Sparkline 132×34 yang terselip di samping nominal terbaca sebagai hiasan
kecil. Membentang selebar kartunya (96px tinggi di dasbor, 40px di ponsel) ia
menjadi bagian kartu itu.
⚠ `preserveAspectRatio="none"` meregangkan sumbu-x, jadi penanda periode
berjalan berupa **garis tegak**, bukan lingkaran — lingkaran akan menjadi elips.

### Daftar modul: satu ikon per baris, SATU warna

Sepuluh baris teks datar tidak bisa dipindai. Ikon per modul membuatnya bisa,
dan petanya `Record<BusinessModule, …>` sehingga modul baru tanpa ikon ditolak
`tsc` — bukan tampil sebagai baris tanpa lambang di halaman publik.

⚠ **Satu warna untuk kesepuluhnya.** Penolakan nada per-kategori di §Yang
DITOLAK berlaku sama untuk ikon: yang dibedakan **bentuk**, bukan warna.
Sepuluh hue berdampingan tetap konfeti.

Petanya hidup di komponen pendaratan, BUKAN di `business-modules.ts`: ikon
adalah keputusan tampilan, dan satu-satunya permukaan yang menampilkan
kesepuluh modul sekaligus adalah halaman ini.

### Yang membuatnya terbaca sebagai PEMBUKUAN, bukan tiga angka

Dua hal, dan keduanya konvensi akuntansi — bukan hiasan:

1. **Baris periode + segel.** Setiap nominal hanya berarti bersama periodenya,
   dan buku besar disegel per periode. Tanpa baris itu kartunya bisa saja
   ringkasan apa pun.
2. **Baris jumlah**, dipisah garis yang lebih tegas (`colorBorder`, bukan
   `colorBorderSecondary`) — konvensi yang sama dengan neraca & laba rugi di
   dalam aplikasi. Angkanya **dihitung** dari ketiga baris di atasnya, tidak
   diketik: kartu contoh yang jumlahnya tidak cocok dengan rinciannya akan
   terbaca sebagai kesalahan oleh pembaca yang paling mungkin memeriksanya —
   akuntan.

⚠ Jangan menambahkan keterangan yang MENGULANG baris periode. Dua kalimat yang
menyebut hal sama berjarak satu baris terbaca sebagai render yang keliru.

## Strip fakta: bilangan dan daftar tidak sama besar

Ketiga nilai dulu memakai satu gaya. Untuk "10" dan "3" itu benar; untuk
"USD · CNY · IDR" tidak — rangkai tiga kode mata uang di ukuran itu menjadi
elemen terlebar dan paling berteriak di strip, sehingga yang paling menarik mata
justru fakta yang paling tidak penting. Pembedanya **peran**: dua yang pertama
bilangan (`tabular-nums`, skala judul seksi), yang ketiga daftar (satu tingkat
di bawah, tanpa `tabular-nums` — angka bertabel untuk teks yang bukan angka
hanya merenggangkan hurufnya).

## Strip bukti pindah ke hero

Tiga angka (`BUSINESS_MODULES.length`, `LOCALES.length`, `CURRENCIES`) adalah
bukti terbaik halaman ini: semuanya DIHITUNG, jadi tak satu pun bisa berbohong.
Letaknya dulu di dalam pita modul — sekitar sepertiga halaman ke bawah, yaitu
sesudah orang memutuskan untuk terus menggulung atau tidak — dan berbentuk
**sama persis** dengan sepuluh kartu modul di bawahnya, sehingga terbaca sebagai
tiga modul lagi. Sekarang: tepat sesudah hero, angka di atas label, tanpa kotak.

### Strip fakta berpil: ikon + angka besar (#402)

Tiga angka teks polos adalah bobot visual paling lemah di halaman (tinjauan
visual 2026-08-17). Kini tiap fakta berdiri di dalam **pil `chip-brand`**
(28%): lingkaran ikon `surface` 40px di kiri (glif `colorPrimary`), angka
`fontSizeHeading2` `tabular-nums` + label 14px di kanan; ketiganya `flex-wrap`
basis 200px, tepat di atas garis bawah hero.

- **Nada di atas nada — DIUKUR, bukan dilarang mentah.** §"warnai pitanya ATAU
  kartunya" lahir dari `fill` (14%) di atas pita sehue: 1,03:1. Pil ini `chip`
  (28%), dan terhadap kedua ujung gradien hero terukur **1,22 / 1,31:1
  (terang) · 1,31 / 1,23:1 (gelap)** — di atas lantai 1,05 "nada ini
  benar-benar ada di layar", dan justru LEBIH terlihat daripada permukaan
  `surface` (1,01:1 terhadap `band-brand` di tema gelap). Teks 11,89 / 9,43:1,
  glif 7,82 / 4,16:1; pil tidak memikul tombol. Dikunci
  `tests/landing-colors.test.ts` §#402.
- **Baris, diukur:** 320px (288 tersedia) & 390px → tiga pil bertumpuk (71px
  tiap); 576px → 2 + 1 (pil ketiga melebar 528px); ≥768px satu baris (232 →
  360px per pil di 1440). Aturan bilangan vs daftar (§di atas) tetap: mata
  uang `fontSizeHeading4` tanpa `tabular-nums`.
- **Slot lencana PSE Komdigi**: barisnya `flex-wrap` + `flex: 1 1 200px`, jadi
  butir keempat tinggal ditambahkan ke daftar `facts` dan barisnya patah
  sendiri (4 × 200 + 3 × 12 = 836px < 1152px → tetap sebaris di 1440;
  2 + 2 di 768). Lencananya SENDIRI belum ada dan TIDAK boleh dipajang sebelum
  pendaftarannya nyata (§KLAIM HARUS PUNYA SUMBER).
- Tetap muncul SEKALI (#397): yang di harga tetap kalimat.

## Copy, harga, FAQ — hasil tinjauan terhadap sembilan kompetitor (#397)

Halaman ini dibandingkan dengan Jurnal, Accurate, Kledo, Zahir, Paper.id,
Majoo, Wave, FreshBooks, dan Zoho. Yang diambil dari mereka hanya yang **punya
sumber di kode kita**; yang tidak (jumlah pelanggan, "tanpa kartu kredit",
SLA) tetap ditolak — §KLAIM HARUS PUNYA SUMBER tidak melunak karena
kompetitor melakukannya.

### Ajakan hero menyebut lama uji coba

"Coba gratis {days} hari" (`heroTrialCta`), bukan "Buat akun". Yang dijual
tombol itu adalah **percobaan tanpa risiko**, dan itu baru tersampaikan bila
lamanya tertulis DI TOMBOLNYA — sebelumnya angka itu baru muncul di ajakan
penutup, tiga layar ke bawah. Sumbernya `TRIAL_DAYS`, konstanta yang sama yang
menghitung masa uji coba.

- **Kunci baru, bukan `heroPrimary` yang diubah bunyinya.** `heroPrimary`
  dipanggil TANPA `{days}` oleh kartu paket dan ajakan penutup; placeholder
  yang tidak diisi mendarat sebagai teks `{days}` di halaman publik. Kedua
  tempat itu tetap "Buat akun" — tujuannya sama (`/register`), jadi
  `tests/button-emphasis.test.ts` tetap membacanya sebagai satu ajakan yang
  diulang.
- ⚠ Tetap TANPA "tanpa kartu kredit". Tidak ada kode yang menjaminnya.

### Copy pembuka berorientasi hasil pembeli, kejujuran "dari kode" jadi kalimat KEDUA

Empat pembuka (hero, modul, harga, kepercayaan) sebelumnya **meta** — bicara
tentang halamannya (*"Daftar ini bukan brosur…"*, *"Harga di bawah diambil dari
katalog…"*, *"Empat hal di bawah bukan janji pemasaran…"*), bukan tentang
masalah pembeli. Kalimat pertama kini menyebut **pekerjaan yang selesai**
(catat transaksi, tutup periode, laporan & PPN; satu buku besar per PT; pilih
paket sesuai PT & pengguna; catatan yang bisa dipertanggungjawabkan kepada
pemilik, auditor, kantor pajak) — dan kalimat "datanya dari kode" **tetap
ada**, sebagai kalimat kedua. Ia bukan hiasan: itu satu-satunya hal yang
membedakan halaman ini dari halaman kompetitor yang mengatakan hal serupa.

Setiap klaim di kalimat pertama punya pelaksananya: penutupan periode
(`/periods`, `form-guards.ts`), laporan (`lib/reports.ts` — neraca saldo, laba
rugi, neraca, arus kas), PPN & e-Faktur (`lib/tax.ts`, modul `tax_id`), satu
buku besar per PT (#104; modul tidak pernah menggerbangi buku besar —
`business-modules.ts` aturan 1), naik paket mandiri (`lib/plan-change.ts`).

**Judul hero merangkul satu PT**: "Pembukuan satu atau beberapa PT, dalam satu
akun". Judul lama ("Pembukuan beberapa PT…") membuat pemilik satu PT — pasar
terbesar — merasa bukan sasaran, padahal paket terkecil memang satu PT.

### Judul hero ≤ 8 kata, kalimat tubuh dua kalimat (#401)

Judul #397 (9 kata ID / 10 EN) terukur **4 baris di 1440px** — hero yang
judulnya sendiri sudah memakan setengah kolom. Kini `heroHeading` ≤ 8 kata di
ketiga bahasa: *"Pembukuan rapi, satu PT atau banyak"* / *"Tidy books for one
company — or many"* / *"一家或多家公司，账簿井井有条"* — terukur 2 baris di
≥992px, ≤3 di 320–768px. Kandidat issue (*"Pembukuan rapi untuk satu PT — atau
banyak"*, 42 huruf) diukur dengan metrik Inter yang terpasang dan patah TIGA
baris di kolom 497px pada setiap ukuran ≥47,5px; yang dipilih (35 huruf) dua
baris sampai 49,4px, langit-langit hero yang baru. Janji "buku besar sendiri
per PT, satu akun" turun ke `heroBody`, yang dipendekkan menjadi **dua
kalimat** (di 390px kini 5 baris, dulu 7). Kedua kunci dipakai
`generateMetadata` (title/OG/description) dan tetap bermakna berdiri sendiri.
"Satu PT atau banyak" tetap merangkul pemilik satu PT (§di atas), dan
purwarupanya (pengalih PT di kerangka) mengatakan hal yang sama. `ctaBody`
kehilangan kalimat "Tidak ada yang perlu dipasang" — di pita penutup ia
berdiri satu baris di atas `ctaTrialNote` yang mengatakan hal yang sama.

**Kalimat KEDUA `heroBody` disembunyikan di bawah 576px (#402).** Dua kalimat
terukur 5 baris di 390px sebelum tombol. `landing-hero.tsx` memotong teks
pada tanda akhir kalimat pertama (`. ! ?` atau `。` ZH) dan membungkus sisanya
`[data-landing-hero-body-more]`, yang di bawah 576px **dikurung 1px** (teknik
nama merek di bilah — BUKAN `display:none`, supaya pembaca layar tetap
mendapat kalimat utuh) dan kembali `static` mulai 576px. Satu kunci kamus,
tetap dipakai `generateMetadata`. **Diukur:** 320px → 3 baris, 390px → 3
baris (dulu 5); ≥576px kalimat utuh (576: 3 baris, 992/1440: 4 baris; 768:
5 baris — kolom hero 45% di titik patah dua kolom, keadaan #401 yang tidak
berubah). Kamus yang kelak hanya satu kalimat dirender apa adanya.

### Hemat tahunan: DIHITUNG di kartu, hilang bila nol/negatif

Baris "Bayar tahunan hemat Rp X (≈ N bulan)" di bawah harga tahunan. Nominal
tahunan sendirian menuntut pembaca mengalikan 12 di kepalanya; Kledo & Zoho
menonjolkan selisihnya, dan itu memang informasi, bukan bujukan. Angkanya
`priceMonthly × 12 − priceYearly` dari **dua kolom katalog yang sama** yang
merender kedua harga di atasnya (`landing-pricing.tsx`) — tidak ada angka
diskon yang diketik.

- **Nol atau negatif → baris tidak dirender.** Katalog yang menghapus diskon
  tahunan, atau memasang tahunan lebih mahal, tidak boleh memajang "hemat
  Rp 0" / "hemat −Rp …" — benar secara aritmetika, terbaca sebagai halaman
  rusak.
- Bulan ditampilkan satu desimal format `id-ID` (2,0 → "2"; 1,5 tetap "1,5").
  `tabular-nums`, sesuai aturan angka MASTER.md.

### Kisi harga dipusatkan (≤2 kartu), Enterprise setinggi Pro (#402)

Katalog publik memuat DUA paket (Pro + rundingan) dan kisi 72rem memberi
masing-masing 568px — selebar dua kolom teks, separuh badan Enterprise kosong.
Kini `<ul>` paket ber-`maxWidth` **760px** + `marginInline: auto` selama
`plans.length ≤ 2`, dan melebar otomatis (tanpa `maxWidth`) bila katalog
punya ≥3 paket — bukan kolom mati yang menunggu. **Diukur keduanya:** dua
kartu di 760px = (760 − 16) / 2 = **372px** per kartu di ≥992px (`<ul>` di
x=116 pada 992, x=340 pada 1440); tiga kartu di kisi penuh = (1152 − 32) / 3 =
**373px** — kartu paket berlebar sama berapa pun jumlah paketnya. Di 768px
kisi 720px (kartu 352), di ≤576px satu kolom.

Kartu rundingan mendapat **tiga butir "termasuk"** (kuota dirundingkan,
dukungan langsung lewat kanal kontak, ketentuan & masa kontrak khusus —
`pricingContactQuota/Support/Terms`, tiga bahasa) supaya isinya setinggi Pro
(terukur 402px keduanya di 992/1440; badannya memang diregang kisi, yang
diisi butir adalah RUANGnya). Ketiganya jujur: kuota memang dirundingkan
(`plan-change-contact-only`), dukungan lewat kanal `contactChannels()` yang
sama — TANPA jam layanan/SLA (§KLAIM HARUS PUNYA SUMBER) — dan ketentuan
kontrak memang milik perundingan.

Kepala Pro `chip-brand` (28%) vs kepala Enterprise `fill-indigo` (14%): teks
di atas kepala Pro **11,89 / 9,43:1**, dan kedua kepala berbeda satu sama lain
**1,20 / 1,22:1** (kedua tema; lantai 1,05) — kini dikunci eksplisit di
`tests/landing-colors.test.ts` §#402. Pil "Direkomendasikan" tetap netral.

### Kisi harga EMPAT paket: 1 → 2×2 → 4 kolom (#404)

Katalog kini **empat** paket — Starter · Pro · Business · Enterprise
(`docs/PRICING.md` adalah sumber angkanya; kartu tetap membaca `plans`).
`landingGrid()` di kartu paket dibatasi tiga kolom, dan empat paket di
dalamnya berarti 3 + satu kartu yatim selebar sepertiga di baris kedua. Empat
kolom lewat `auto-fit` juga tidak bisa — **diukur** di 992px: seksi 944px →
kartu 224px, isi 176px (padding 24+24), sedangkan "Rp 1.199.000 /bln" pada
24px tebal butuh ~200px; dan `auto-fit` ber-minimum 276px jatuh kembali ke
3 + 1 di 992–1199px.

Maka saat `plans.length ≥ 4` `<ul>` melepas `landingGrid` dan memasang
`[data-landing-pricing-grid]` yang dipegang lembar gaya bertitik-patah:
**1 kolom** (<768), **2×2** (768–1199, kartu 340–560px), **4 kolom** (≥1200,
`LANDING_PRICING_FOUR_COLUMNS_BREAKPOINT` — seksi 1152px → kartu 276px, isi
228px, nominal muat satu baris). Kisi ≤3 paket tidak berubah (termasuk
pemusatan 760px di ≤2, #402): atribut dan `landingGrid` saling eksklusif,
jadi tidak ada aturan yang saling menimpa.

**Butir "termasuk" di luar kuota** hanya untuk paket yang punya sumber di luar
tabel `plans` (§KLAIM HARUS PUNYA SUMBER): Business memikul *"Dukungan
prioritas — dibalas hari kerja berikutnya"* (`plans.highlight.prioritySupport`,
tiga bahasa; keputusan pemilik di #404, dicatat di `docs/PRICING.md`) —
dipetakan di `lib/plan-copy.ts` §SOROTAN, dirender di kartu publik DAN halaman
paket di dalam aplikasi dari daftar yang sama. Paket lain tidak diberi butir
hiasan ("semua modul", "tiga bahasa"): itu sudah dinyatakan sekali untuk semua
paket (`pricingAllNote`), dan mengulanginya per kartu menyiratkan paket lain
tidak mendapatkannya. Butir kedua Enterprise kini *"Migrasi data, pelatihan
tim, dukungan langsung"* (`pricingContactSupport`) — jasa yang memang
membedakannya dari Business (`docs/PRICING.md` §2), tetap tanpa jam layanan.

Nama paket TIDAK diterjemahkan (nama produk, `lib/plan-copy.ts`), maka
"Starter"/"Business", bukan "Mulai"/"Bisnis": satu tangga dalam satu bahasa
di ketiga kamus. Deskripsi tiap paket tetap lewat `plans.description.*`.

### Enterprise dilebur ke kaki kartu Business — tiga kartu lagi (#408)

Sehari sesudah #404 pemilik memutuskan funel publik **tiga** anak tangga:
Starter → Pro → Business, dan rundingan hanya bagi yang melewati kuota
Business. `enterprise` menjadi `is_public = false` (tetap aktif &
`contact_only` — diberikan operator untuk kontrak; migration platform 0010),
sehingga kisi kembali ke tiga kolom `landingGrid` dengan sendirinya. Jalur
≥4 kartu (#404) **tidak dihapus**: katalog lain boleh memajang empat, dan
kartu `contactOnly` generik tetap dirender bila operator memublikasikan paket
rundingan lain.

Yang tersisa dari Enterprise di halaman harga adalah **satu paragraf catatan
di kaki kartu Business** (`[data-landing-negotiate]`,
`pricingNegotiateNote`): *"Butuh lebih dari 8 PT atau 40 pengguna? Kuota,
migrasi data, SLA, dan masa kontrak dirundingkan. Hubungi kami →"*. Angkanya
dari `maxCompanies`/`maxUsers` paket pemikulnya (`lib/plan-copy.ts`
`planCarriesNegotiation`, dipetakan — bukan `key === "business"` di
komponen). Tautannya **tautan teks** pola `faqMoreCta` (`data-landing-link`,
`colorLink`), BUKAN tombol kedua: kartu itu sudah memikul satu primer, dan
dua tombol bertumpuk adalah dua ajakan yang bersaing di kartu yang justru
ingin orang bayar sendiri. Tanpa `PLATFORM_CONTACT_EMAIL` kalimatnya tetap
dan `pricingContactMissing` menggantikan tautan (pola #397). Diuji
`public-landing.test.tsx` §#408.

### Kartu paket #413: sakelar siklus, nominal besar, ubin kuota, menara — dan `/pricing`

Permintaan pemilik 2026-08-18: *"perbaiki visualisasi plan dan pricing, buat
semenarik mungkin."* Yang ditambah adalah BENTUK; disiplinnya (badan `surface`
bertepi, kepala bernada, satu primer per kartu, klaim bersumber, tanpa JS)
tidak ditawar. Empat perubahan, semuanya di `landing-pricing.tsx` +
`landing-scale.ts`:

1. **Sakelar Bulanan / Tahunan — TANPA JavaScript.** Dua radio
   (`name="sai-billing"`) tersembunyi dari mata (dikurung 1px, bukan
   `display:none`, jadi tetap fokusabel) + dua label sebagai pil bersegmen
   (`[data-landing-billing-switch]`). Pil terpilih berisian
   `colorBrandSolid` + teks terang — token KETIGA warna merek (§Warna merek),
   11,50/5,06:1. Kartu merender KEDUA blok harga
   (`[data-landing-price="monthly"|"yearly"]`) dan lembar gaya memilih yang
   tampak: `[data-landing-pricing]:has(radio[value=yearly]:checked)
   [data-landing-price=monthly]{display:none}` + sebaliknya. Peramban tanpa
   `:has()` selalu melihat bulanan; sakelarnya diam, tidak rusak. Halaman
   tetap dokumen yang memuat kedua harga (mesin pencari, cetak, DOM pembaca
   layar). Pil "Tahunan" menyebut hemat dalam BULAN — angka **terkecil** di
   antara paket berbayar, dan hanya bila SEMUA punya harga tahunan
   (`hematTahunan`, dihitung) — supaya janji di pil berlaku untuk setiap kartu
   di bawahnya. Sakelar tidak dirender bila tak ada harga tahunan: dua pil
   yang menampilkan hal yang sama adalah kendali palsu. Blok tahunan memajang
   yang memang DITAGIH (harga tahunan) sebagai angka besar; padanan bulanan
   (`priceYearly / 12`, dibulatkan `formatMoney`) kalimat kecil di bawahnya
   (`pricingYearlyEquivalent`).
2. **Nominal `--sai-landing-font-size-section`** (24 → 30px di ≥576px), tebal,
   tracking `-0.02em`, tabular; satuan "/bulan" duduk di baseline dan boleh
   turun baris sendiri (`flexWrap`). Tetap di bawah hero: angka adalah bidang
   terbesar DI KARTUNYA, bukan di halamannya. Diukur: "Rp 1.199.000" 30px
   ≈ 215px, muat di isi kartu 228px (kisi empat kolom #404).
3. **Kuota = ubin angka** (`[data-landing-quota]`): dua ubin sebaris — angka
   `heading-3` tabular + label kata benda (`pricingQuotaCompaniesLabel` "PT
   (perusahaan)" / "Companies" / "公司", `…UsersLabel`) — nada `fill-indigo`
   (14%) di atas badan `surface`, nada yang sama dengan kepala kartu biasa;
   ubin tidak memikul tombol, jadi 14% sah. Alasannya §"Polos sekali":
   kekayaan visual datang dari ISI, dan kuota adalah satu-satunya isi yang
   membedakan paket — sampai kini ia dua baris centang sebentuk butir hiasan.
   Label kata benda (bukan kalimat berjumlah) menutup jalan lahirnya
   "1 companies" lagi (#404). Butir sorotan (`plan-copy.ts` §SOROTAN) tetap
   daftar centang di bawah ubin, dan daftarnya tidak dirender kosong.
4. **Kartu disarankan = MENARA.** `<li data-landing-plan-recommended>`
   bermargin blok **negatif** 16px di ≥992px: butir kisi yang `stretch`
   menjadi baris + 32px, dan kartu (`height:100%`) menjulur di atas DAN di
   bawah tetangganya. Kartunya bercincin merek + `boxShadow-secondary` tetap;
   hover bawaan `[data-landing-card]` menimpa `box-shadow`, jadi ada aturan
   yang mengembalikan cincin + bayangan hover bersama. Di bawah 992px (satu/
   dua kolom) menara menabrak kartu di atasnya, jadi di sana ia sejajar.
   Sorotan kini EMPAT penanda: lencana berteks, nada kepala, cincin, bentuk.

Urutan isi kartu: kepala → nominal (blok aktif) → deskripsi → "Termasuk" →
ubin kuota → butir sorotan → catatan rundingan (#408) → tombol
(`marginTop:auto`, sejajar antar-kartu — PR #411). Kartu Starter/Pro menyisakan
ruang kosong di atas tombolnya karena Business memikul butir sorotan +
catatan rundingan; **tidak diisi butir hiasan** ("semua modul", "3 bahasa"):
alasan §Kisi harga EMPAT paket tetap berlaku.

**`/harga` → `/pricing` (308 permanen, `next.config.ts` `redirects`).**
Alamat kanoniknya kini `/pricing` (`alternates.canonical`, `sitemap.ts`);
`/harga` adalah alamat LAMA (#399/#413) yang sudah dibagikan & terindeks, jadi
ia tidak boleh menjadi 404 — tetapi jawabannya redirect permanen, bukan halaman
kedua berisi sama. Redirect `next.config` dievaluasi sebelum sistem
berkas dan `proxy.ts`, jadi `/pricing` tidak masuk `isPublicPath`. Diuji
`public-landing.test.tsx` §#413.

### Strip fakta muncul SEKALI — di hero; di harga tinggal kalimatnya

Tiga angka (modul · bahasa · mata uang) dulu tampil **dua kali identik**: strip
bukti di bawah hero dan `<dl>` "Semua paket mendapat" di seksi harga. Yang
dipertahankan sebagai STRIP adalah yang di hero, dan yang di harga menjadi
**satu kalimat berangka** (`pricingAllNote`: *"Semua paket mendapat 10 modul,
3 bahasa antarmuka, dan mata uang USD · CNY · IDR. Yang dijatah per paket hanya
jumlah PT dan pengguna."*). Alasannya:

1. **Kedua tempat menjawab pertanyaan yang BERBEDA.** Di hero pertanyaannya
   *"seberapa banyak"* — itu bukti, dan bukti berbentuk angka besar. Di harga
   pertanyaannya *"apa yang saya dapat terlepas dari paket"* — itu jaminan, dan
   jaminan berbentuk kalimat. Tiga angka besar tidak menjawab "apakah modul
   dijatah"; kalimatnya menjawab, sekaligus menyebut apa yang MEMANG dijatah
   (`Plan` hanya punya `maxCompanies` & `maxUsers`).
2. **Seksi harga sudah memikul tiga kartu berisi nominal.** Tiga angka besar
   lagi di bawahnya bersaing dengan harga yang seharusnya paling dibaca di
   seksi itu.
3. Bukti yang diulang berhenti terbaca sebagai bukti dan mulai terbaca sebagai
   pengisi. Arah sebaliknya (strip di harga, kalimat di hero) ditolak karena
   strip di hero adalah keputusan §Strip bukti pindah ke hero, yang alasannya
   masih berlaku: bukti terbaik halaman harus tampil SEBELUM orang memutuskan
   menggulung.

Ketiga angka di kalimatnya tetap **dihitung** dari registri yang sama
(`BUSINESS_MODULES.length`, `LOCALES.length`, `CURRENCIES`). Kunci
`pricingAllTitle` dihapus dari ketiga kamus (penjaga kunci yatim).

### Lima FAQ pembeli — setiap jawaban diverifikasi ke kode SEBELUM ditulis

Enam pertanyaan lama seluruhnya soal tagihan & isolasi; yang ditanya orang
SEBELUM sampai ke tagihan tidak terjawab satu pun. Lima yang ditambahkan, dan
sumber tiap jawabannya (juga tercatat di kepala `landing-faq.tsx`):

| Pertanyaan | Sumber jawaban | Yang SENGAJA tidak diklaim |
|---|---|---|
| Cocok untuk usaha apa | `BUSINESS_CATEGORIES`/`CATEGORY_META` — daftar presetnya **dirakit dari registri** (tanpa `custom`) dan `BUSINESS_MODULES.length`; modul per PT, tidak menggerbangi buku besar | segmen/industri yang tidak punya preset |
| Impor dari sistem lama | `coa-import.ts` (akun, kolom Accurate), `import/master.ts` (pelanggan/pemasok/barang), `import/opening-ar-ap.ts`, `import/fixed-assets.ts`, templat `import/template.ts`, kolom dikenali dari judul (`import/spec.ts`), yang sudah ada dilewati bukan ditimpa; saldo awal akun di wizard penyiapan | **riwayat jurnal** — TIDAK diimpor, dan itu ditulis apa adanya |
| Akuntan/KAP eksternal | undangan surel + peran per PT (docs/MULTI-TENANT.md §7.2–7.3, kuota `maxUsers`), peran bawaan bisa disetel + peran kustom (docs/RBAC.md), jejak audit, pencabutan sesi (docs/RBAC.md §Sesi & pencabutan) | peran "hanya-baca" siap pakai (tidak ada; yang ada: bisa dibuat) |
| Kanal dukungan | dokumentasi publik `/docs`; alamat surel `contactChannels().email` bila disetel | **jam layanan / SLA / telepon / obrolan** — tidak ada kodenya |
| Tempat data & UU PDP | basis data per PT (#104), ekspor mandiri, permintaan hapus bertenggang 30 hari & bisa dibatalkan (docs/COMPLIANCE.md), tidak ada hapus otomatis, `/privacy` | **lokasi server** — data residency masih keputusan terbuka (COMPLIANCE.md §5.1) |

⚠ **Jawaban dukungan BERCABANG pada `PLATFORM_CONTACT_EMAIL`.** Sejak seksi
kontak dicabut (§Seksi kontak — DICABUT), jawabannya menyebut ALAMAT SURELNYA
langsung — dan hanya bila alamat itu disetel: menyuruh orang menulis ke alamat
yang tidak ada adalah penunjuk palsu. Tanpa alamat, jawabannya
`faqSupportADocsOnly` — dokumentasi saja.

Urutan lima pertanyaan mengikuti urutan orang menanyakannya: cocok untuk saya?
→ data lama saya? → akuntan saya? → kalau macet? → data saya di mana?
`FAQPage` JSON-LD ikut otomatis (dibangkitkan dari array yang sama).

### Catatan undangan disembunyikan di bawah 576px

"Sudah diundang rekan kerja? …" (`heroNote`) `display:none` di bawah 576px
lewat `[data-landing-hero-note]` di `LANDING_STYLE`, tampil kembali di blok
media ≥576px. Di ponsel hero SATU kolom dan setiap baris di atas purwarupa
mendorong sisa halaman ke bawah lipatan; kalimat ini menyasar orang yang
hampir pasti tidak sedang membaca hero — yang diundang datang lewat tautan di
surelnya. Alternatif "pindahkan ke bawah tombol Masuk" ditolak: di ponsel
tombol-tombol bertumpuk satu kolom, jadi "di bawah Masuk" persis tempatnya
sekarang — tidak menghemat satu baris pun. Kalimatnya tetap di HTML dan tetap
tampil di layar yang punya ruang.

## Gerak: CSS, tidak pernah JavaScript

Scroll-reveal halus lewat `animation-timeline: view()` — nol berkas skrip, jadi
`AMBANG_KLIEN` tidak bergerak. **GSAP/ScrollTrigger DITOLAK** di halaman ini:
ia JavaScript sisi klien yang dibayar hidrasi oleh pengunjung yang mungkin tidak
pernah mendaftar. Tiga pagar wajib, dan semuanya ada di `landing-scale.ts`:
`prefers-reduced-motion: no-preference` (izin, bukan larangan), `@supports`
(tanpa dukungan = tidak ada animasi), dan hanya `translateY`.

### ⚠ `opacity` DILARANG di keyframes ini

Versi pertama menganimasi `opacity: 0 → 1`. Ia benar saat orang **menggulung**,
dan gagal di setiap konteks yang **tidak** menggulung: seksi yang belum "masuk"
berhenti di keadaan awalnya, yaitu tak terlihat. Terukur di Chromium 131 dengan
viewport setinggi dokumen — bentuk yang dipakai perender halaman-penuh,
termasuk perayap yang merender — **tiga seksi terakhir (harga, FAQ, ajakan
penutup) diam di `opacity: 0`.**

Untuk halaman internal itu cacat kecil. Untuk halaman pemasaran yang baru saja
diberi metadata & data terstruktur **supaya ditemukan**, itu risiko bahwa mesin
pencari membaca bagian harganya sebagai isi tersembunyi. Dengan hanya
`transform`, kegagalan seburuk apa pun hanya menggeser teks 14px — isinya tidak
pernah bisa hilang. Ditambah `@media print` yang mematikan sisa gerak, sebab
mencetak juga tidak menggulung.

Atributnya dipasang pada **seksi**, bukan tiap kartu: sepuluh kartu yang muncul
satu per satu adalah koreografi, dan koreografi adalah animasi hias.

## Bagaimana bentuk itu ditulis (bukan lagi kelas)

- **Nol `className`.** Seluruh halaman memakai gaya sebaris + `var(--ant-…)`;
  keadaan yang tidak bisa ditulis sebaris (`@media`, `:hover`, `:focus`,
  `details[open]`, `prefers-reduced-motion`) hidup di satu blok `<style>` yang
  dipasang `LandingShell`, menyasar atribut `data-landing-*`.
- **Titik patah: 576px** (`screenSM` AntD), bukan 640px (`sm:` Tailwind) — untuk
  seluruh ISI halaman.
  ⚠ **Ada satu pengecualian, dan ia lahir dari pengukuran:** tautan seksi di
  bilah atas muncul mulai **768px** (`LANDING_NAV_LINKS_BREAKPOINT`). Bilah atas
  bukan kolom yang mengalir melainkan satu baris yang harus memuat merek + empat
  tautan + pemilih bahasa + dua tombol sekaligus, dan dengan tautan tampil ia
  menuntut **685px**. Menampilkannya mulai 576px membuat halaman **menggulung
  mendatar di seluruh rentang 576–685px** — cacat yang tidak terlihat di dua
  ukuran yang biasa ditangkap layar (1920 & 390), dan yang baru ketahuan setelah
  lebar disapu satu per satu. Jangan menambah titik patah baru tanpa mengukur
  lebih dulu.
  ⚠ **Sejak #401 hero juga berpatah di 768px, bukan 576px** — diukur: kerangka
  aplikasi (sidebar 40px + tiga ubin "Rp 184.500.000" ±118px + grafik) tidak
  muat di kolom purwarupa 206px yang tersedia di 576px. Di 576–767px hero satu
  kolom, kerangka selebar isi (528–720px); mulai 768px dua kolom **45:55**
  (kerangka 55% — yang menjual kini gambar produknya; judulnya ≤8 kata supaya
  muat di 45%), jarak `margin-xxl` (48px), bukan `rhythm` (96px) — dengan 96px
  kolom kalimat di 768px tinggal 281px.
  ⚠ **Titik patah KETIGA — 992px (`screenLG`, `LANDING_WIDE_BREAKPOINT`) —
  untuk galeri 1 besar + 2 kecil dan kemunculan kartu ponsel hero (#401)**,
  ditambahkan sesudah diukur:
  pada 3fr:2fr kolom kanan baru mencapai ~360px (lebar minimum agar kerangka
  di dalamnya masih memuat sidebar berikon) mulai 992px; di 768–991px kerangka
  faktur kehilangan sidebarnya sementara jurnal di sebelahnya masih punya, dan
  dua kerangka yang tidak sebentuk berdampingan terbaca sebagai bug.
- **Menu ponsel (#398): `<details><summary>`, tanpa JavaScript.** Di bawah
  768px tautan seksi + pemilih bahasa (<576px saja — di 576–768
  sakelar di bilah sudah tampil) hidup di panel `position:absolute` di bawah
  bilah, dibuka tombol 40px yang ikonnya bertukar (garis tiga ↔ X) lewat
  `[open]`. Bilah di bawah 768px berkisi **dua** kolom (`auto 1fr`), tiga
  kolom baru mulai 768px; **teks merek disembunyikan visual di bawah 576px**
  (lambang tetap, teks tetap di DOM untuk pembaca layar) — di 390px ia
  terukur patah dua baris begitu tombol menu ikut ke kolom aksi. Bukan titik
  patah 400px baru: 576px yang sudah ada cukup. Disapu 320–767px lewat CDP:
  `scrollWidth == innerWidth` di setiap lebar, tertutup maupun terbuka; panel
  tidak melampaui viewport.
  ⚠ Batas jujurnya: tanpa skrip, panel **tidak menutup sendiri** saat tautan
  seksi ditekan — ia tetap terbuka di bawah bilah menempel sampai tombol X
  ditekan. Menutup otomatis menuntut JavaScript; itu lebih mahal daripada satu
  ketukan.
- **Dua penumpang baru titik patah 576px (#402):** `[data-landing-fab]`
  (tombol WhatsApp melayang: `none` → `block`) dan
  `[data-landing-hero-body-more]` (kalimat kedua hero: dikurung 1px →
  `static`). Keduanya menumpang titik patah yang ADA, bukan titik patah baru.
  ⚠ Diukur di #402 pada `develop` SEBELUM perubahan apa pun: di **tepat
  768px** bilah atas menuntut **782px** (`[data-landing-nav-actions]` sampai
  x=782 dengan tautan seksi + sakelar bahasa + dua tombol) — 14px gulungan
  mendatar yang sudah ada sejak tautan bertambah di #398/#399, bukan dari
  #402, dan di luar lingkupnya; angkanya ditulis di sini supaya orang
  berikutnya tidak mengukurnya lagi dari nol.
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
   palet telanjang.** (Sejak #303 resepnya milik `src/lib/theme/tone-recipe.ts`,
   modul netral-permukaan yang juga dipakai `/platform` — lihat MASTER.md
   §Permukaan KETIGA. Yang dibagi hanya BENTUK `color-mix`-nya; kadar di bawah
   tetap milik halaman ini.) Tangga AntD (`--ant-blue-1` … `-10`) MEMBALIK di tema
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

### Nada `accent` dipakai TEPAT SEKALI — kini di sorotan radial hero (#401)

Sampai #401 `accent` (18%) adalah pita ajakan penutup, dan hero dilarang
memakainya sebagai ujung gradien supaya penutup tidak "sebobot hero". Sejak
#401 puncak halaman **bukan lagi tint** melainkan pita PEKAT (bagian
berikut), sehingga `accent` kehilangan pemakai lamanya. Tokennya **tetap
ada** karena masih dipakai tepat sekali — sorotan radial di kuadran hero
(`landing-hero.tsx`), yang memang harus lebih pekat daripada `band-brand` di
bawahnya agar hero punya satu sumber cahaya. Ia bukan lagi nilai `tone`
seksi (`LandingTone` tidak mengenal `accent`; dijaga
`tests/landing-colors.test.ts`): dua puncak = tidak ada puncak. Kadarnya tetap
dikunci ambang tombol primer (hero memikul tombol), jadi ia tidak boleh
dinaikkan hanya karena tidak lagi memikul ajakan penutup.

### Pita PEKAT — ajakan penutup sebagai PUNCAK (#401)

Tinjauan visual terhadap kompetitor (2026-08-17): halaman ini disiplin,
tetapi semua pitanya tint 14–18% pada SATU tingkat kecerahan — tidak ada
puncak, dan halaman berakhir datar. Kompetitor menutup dengan satu bidang
pekat. Sekarang: `LandingClosingCta` = `LandingSection tone="solid"`.

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
§"pita pekat"), dari token yang terpasang dan dari kadar yang **diurai** dari
`LANDING_STYLE` / `INVERSE_BUTTON_STYLE` — bukan diketik ulang di tes.

Empat keputusan yang lahir dari angka itu:

1. **Teks redup 92%, bukan 85%.** Issue meminta "putih 85%"; terukur 85% di
   atas navy tema gelap hanya **4,14:1**, 90% → 4,44. 92% adalah kadar
   terendah yang lolos, dan tesnya mengunci bahwa ia memang batas (90% masih
   gagal) — bukan angka bermargin yang tidak ada yang tahu. Konsekuensinya
   jujur: hierarki judul/kalimat di pita ini datang dari UKURAN, selisih
   warnanya tipis.
2. **Tombol `inverse`, bukan `primary`.** Isian primer = isian merek yang sama
   dengan pitanya (1,00:1): tombol lenyap sebagai bidang. `variant="inverse"`
   (`components/ui/button.tsx`) adalah varian BERNAMA — isian putih, label
   navy — bukan gaya sebaris ad-hoc, dan penjaga penekanan
   (`tests/button-emphasis.test.ts`) menghitungnya sebagai ajakan penuh: satu
   per wadah, di pendaratan wajib menuju `/register`. `primary`/`default`
   DILARANG di `landing-closing-cta.tsx` (dijaga).
3. **Hover/aktif tombol terbalik menggelap TIPIS (94% / 92% putih).** Yang
   mengikat adalah label navy di atas isian saat disentuh, di tema gelap:
   90% putih sudah 4,44. Selisih hover yang nyaris tak terlihat adalah harga
   yang benar; label yang tetap terbaca lebih penting daripada hover yang
   jelas.
4. **Ditulis lewat variabel CSS per-elemen AntD** (`--ant-btn-bg-color`,
   `-hover`, `-active`, `--ant-btn-text-color*`; `antd/es/button/style/
   variant.js`), sebaris — bukan kelas ber-hash yang disalin (berhenti
   berlaku diam-diam) dan bukan `ConfigProvider` bersarang (menuntut warna
   mentah, membangkitkan lembar gaya kedua).

⚠ **Satu pita pekat, dan hanya satu.** Sidebar navy 40px di dalam kerangka
aplikasi (hero & galeri) memakai token yang sama, tetapi ia strip di dalam
GAMBAR produk, bukan pita — dan tidak memikul tombol. Pita `solid` kedua di
halaman ini menghapus puncaknya.

**Tombol WhatsApp melayang (#402) juga BUKAN pita.** Ia bulatan 48px
`position:fixed` kanan-bawah (`bottom/right: margin-lg`), isian
`--ant-color-brand-solid` + glif putih (11,50 / 5,06:1 — angka `BrandMark`),
`landing-whatsapp.tsx`; yang dijaga aturan ini adalah bidang navy SELEBAR
LAYAR yang memikul ajakan, dan ini bidang kecil yang memikul satu ikon.
Angka & keputusannya:

| | TERANG | GELAP |
|---|---|---|
| glif putih di atas isian diam / hover / aktif (`brand-solid`, `-hover`, `-active` — token global baru = `PRIMARY_BUTTON_*`) | 11,50 / 13,38 / 16,59 | 5,06 / 6,24 / 8,64 |
| bidang navy vs latar halaman | 11,50 | 3,64 |
| bidang navy vs `band-brand` / `band-cyan` (hero yang dilintasinya) | 9,55 / 10,23 | 3,22 / 3,02 |
| bidang navy vs pita penutup (token yang SAMA) | **1,00** | **1,00** |
| cincin 2px `colorBgContainer` vs pita penutup | 11,50 | 3,64 |

- **Cincin `border` 2px `colorBgContainer`, bukan `box-shadow` tulisan tangan**:
  tanpa cincin bulatannya lenyap tepat saat melintasi pita penutup (1,00:1);
  di atas halaman cincin sewarna latar dan memang tak terlihat. Bayangan
  melayangnya token `--ant-box-shadow`.
- **BUKAN hijau WhatsApp**: hijau = uang masuk di app ini, dan
  `tests/landing-colors.test.ts` menolak warna mentah.
- **`Button href` `outline` + gaya varian bernama (`WHATSAPP_FAB_STYLE`),
  bukan `primary`**: tautan KELUAR (`https://wa.me/…`, tab baru, `rel`
  noopener), dan penjaga penekanan mengunci primer pendaratan ke `/register`
  — dijaga eksplisit di `tests/button-emphasis.test.ts`. Sumbernya
  `contactChannels()`, sakelar yang sama dengan seksi kontak: nomor kosong /
  salah bentuk = tidak dirender.
- **Hover/aktif lewat token GLOBAL baru `--ant-color-brand-solid-hover` /
  `-active`** (`antd-tokens.ts` `brandSolidHover/Active`, nilainya =
  `PRIMARY_BUTTON_*`): token komponen `Button` (`colorPrimaryHover`) TERUKUR
  tidak sampai ke dokumen sebagai variabel (`getComputedStyle` →
  `--ant-button-color-primary-hover` kosong), dan `var()` yang tak teratasi
  membuat isian hover jatuh ke `unset`.
- **Hanya ≥576px — DIUKUR** (issue: "kalau bertabrakan, ≥576px"). Di 320/390
  tombol hero bertumpuk selebar isi (x 16–304 / 16–374) dan bulatan 48px
  menempati x 248–296 / 318–366 — menutupi 48px = 17% / 13% lebar ajakan
  utama pada setiap posisi gulungan yang menaruhnya di 72px terbawah layar.
  Di 576px tombol hero berjajar dan berakhir di x=191, bulatan di x=504–552:
  tidak bersentuhan. Di bawah 576px WhatsApp hanya lewat jawaban FAQ
  dukungan (seksi kontak sudah dicabut).

### Hijau/merah/emas/jingga: TERMASUK glif dan lencana

Aturan "keempatnya sudah menjadi bahasa uang & status, jadi bukan nada hias"
sebelumnya hanya diterapkan pada **pita**. Ia berlaku sama untuk **glif ikon dan
lencana**, dan di sini lebih tajam:

- centang "modul ini ada" dan "kuota ini termasuk" bukan pernyataan tentang uang
  — lima belas centang hijau di halaman yang menjual PEMBUKUAN terbaca sebagai
  pernyataan tentang angka. Keduanya kini `colorPrimary`;
- lencana "Selalu aktif" dan "Direkomendasikan" bukan status *berhasil* —
  keduanya kini `Badge variant="default"` (netral berisi). Yang dijaga tes tetap
  bahwa lencananya **berteks**, bukan warnanya.

Satu-satunya tempat warna uang dipakai di halaman ini adalah purwarupa produk,
tempat ia memang menyatakan uang (hijau kas, merah utang) — dan di sana pun
label barisnya sudah menyebutnya, jadi warna bukan penanda tunggal.

### Yang DITOLAK karena melewati batas kepercayaan

> ⚠ **DIREVISI di #401.** Dua butir pertama di bawah dulu dibaca sebagai
> "pita penutup pekat ditolak". Yang ditolak adalah DUA BAHAN tertentu —
> tangga BIRU AntD dan `SIDER_BG_DARK` — dan alasannya tetap benar untuk
> keduanya. **Navy MEREK (`--ant-color-brand-solid`) adalah token ketiga
> dengan angkanya sendiri** (putih di atasnya 11,50:1 terang / 5,06:1 gelap;
> ia satu nilai per tema yang DIPILIH, bukan anak tangga yang membalik), dan
> dengan tombol TERBALIK — bukan `primary` — ia lolos semua ambang di kedua
> tema. Angkanya di §Pita pekat di atas. Butir di bawah ditulis ulang supaya
> menyebut yang ditolak dengan tepat.

- **Pita ajakan penutup dari TANGGA BIRU AntD dengan teks putih.** Terukur,
  dan ia gagal karena aritmetika, bukan selera: tangga biru membalik di tema
  gelap, jadi tidak ada SATU anak tangga BIRU yang bisa memikul teks putih di
  kedua tema (`blue-7` terang 6,16:1 tapi gelap 3,54:1; `blue-6` gelap 5,19:1
  tapi terang 4,10:1). Memaksanya berarti mencabang tema di dalam blok gaya
  pendaratan, yaitu mekanisme tema KEDUA di satu halaman. **Yang menggantikannya
  (#401) bukan anak tangga melainkan token `colorBrandSolid`** — sudah punya
  nilai per tema di `antd-tokens.ts`, jadi tidak ada cabang tema di halaman.
  ⚠ **Diukur ulang di #303: kalimat itu berlaku untuk BIRU, bukan untuk setiap
  hue.** `geekblue-6` memikul teks putih 5,85:1 (terang) / 7,13:1 (gelap) dan
  `purple-6` 6,94 / 8,27 — keduanya lolos 4,5:1 di kedua tema. Yang tetap
  menjatuhkan bidang pekat adalah elemen LAIN di atasnya (teks sekunder, tepi
  tombol garis, isian tombol, latar lencana); angkanya di `pages/platform.md`
  §Yang DITOLAK. Jangan mengutip kalimat di atas sebagai aturan umum.
- **Permukaan gelap permanen (`SIDER_BG_DARK`) sebagai pita penutup.** Bekerja
  untuk teksnya, tetapi isian tombol primer tema terang (`#0958d9`) di atasnya
  hanya 2,99:1 — angka yang sudah tercatat di `lib/theme/antd-tokens.ts` dan
  yang membuat `Menu` diberi tokennya sendiri. Tombol ajakan yang tidak bisa
  ditemukan sebagai bidang adalah harga yang terlalu mahal untuk sebuah pita.
  **Tetap ditolak** — dan pelajarannya justru yang dipakai #401: di atas bidang
  pekat, tombolnya harus TERBALIK, bukan primer.
- **Tombol `primary` di atas pita navy merek.** Isian primer = isian pitanya:
  1,00:1 di tema terang. Dijaga `tests/landing-colors.test.ts` (aturan
  terbalik) — `variant="inverse"` yang sah di sana.
- **Nada per kategori untuk kesepuluh kartu modul.** `BUSINESS_MODULES` tidak
  punya kategori; mengarangnya di halaman pemasaran adalah klaim tanpa sumber
  (§KLAIM HARUS PUNYA SUMBER), dan sepuluh hue berdampingan adalah konfeti,
  bukan hierarki.

### Penjaganya

`tests/landing-colors.test.ts` menghitung ulang setiap pasangan
teks-di-atas-warna (sejak #402 juga: kepala Pro vs kepala Enterprise, pil
strip fakta vs gradien hero, dan tombol WhatsApp melayang di setiap keadaan)
dari token yang benar-benar terpasang dan dari resep
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
  lebih besar dari janjinya menjual harga, bukan pekerjaan. (Sejak #413
  nominal memakai `--sai-landing-font-size-section` — sebesar judul seksi,
  tetap di bawah hero.)
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
- **Teks paket lewat KUNCI KAMUS, bukan kolom basis data.** `plans.description`
  disemai sebagai literal bahasa Indonesia (`scripts/seed-plans.ts`), dan sampai
  perubahan ini dirender apa adanya — sehingga kartu Pro berbahasa Inggris
  berbunyi *"Sampai tiga PT, lima belas pengguna."* tepat di atas baris kuota
  *"3 companies / 15 users"*: satu fakta, dua bahasa, tiga baris berjarak.
  Pemetaannya di `lib/plan-copy.ts`; paket buatan operator jatuh ke kolomnya.
  `name` sengaja TIDAK diterjemahkan — nama produk bukan teks antarmuka.
- **Paket rundingan tidak boleh menyortir ke depan.** Harganya `0.00` di
  katalog, jadi `orderBy: priceMonthly asc` telanjang menaruh kartu yang TIDAK
  bisa dibeli di posisi pertama. `contactOnly` menyortir lebih dulu
  (`plan-catalog.ts`) — kegagalan "Rp 0 terbaca sebagai gratis" yang sama,
  hanya di sumbu urutan.
- **`PLATFORM_CONTACT_EMAIL` wajib diisi bila katalog memuat paket rundingan.**
  Tanpa itu kartunya tidak punya tombol dan memajang kalimat untuk PEMASANG
  kepada calon pelanggan. Sudah didokumentasikan di kedua `.env*.example`.

## Halaman ini juga DIBAGIKAN, bukan hanya dibuka

Ia satu-satunya permukaan yang ditempel orang ke WhatsApp, LinkedIn, atau Slack
— kanal yang menjadi jalur penjualan sebenarnya di Indonesia. Karena itu:

- `generateMetadata` di `app/page.tsx`: judul, deskripsi (kalimat hero, bukan
  kalimat pemasaran kedua), kanonik, `openGraph`, `twitter`;
- `app/opengraph-image.tsx` — **dibangkitkan**, bukan PNG. Warnanya harfiah dan
  hidup di `lib/theme/antd-tokens.ts` (`OG_*`) beserta rasio kontrasnya, sebab
  Satori tidak punya dokumen dan `var(--ant-…)` di sana tidak pernah teratasi;
- `app/sitemap.ts` menurunkan pohonnya dari `DOC_INDEX`, tidak mengetiknya;
- `app/robots.ts` melarang seluruh app internal — bukan sebagai kontrol akses
  (itu tetap `proxy.ts`), melainkan agar perayap tidak memanggil ribuan render
  dinamis yang pasti dipantulkan;
- data terstruktur (`FAQPage`, `SoftwareApplication`) diterbitkan **di komponen
  tempat datanya hidup**, bukan sebagai satu blok terpisah — salinan kedua yang
  ditulis jauh dari aslinya akan menyimpang tanpa berbunyi. Paket rundingan
  tidak diterbitkan sebagai `Offer`: "IDR 0" yang dibaca mesin akan dipajang
  sebagai gratis.

⚠ **`hreflang` sengaja TIDAK dipasang.** Ia menuntut satu ALAMAT per bahasa;
aplikasi ini menyimpan bahasa di **cookie**, bukan segmen rute
(`lib/i18n/config.ts`). Ketiga bahasa berbagi satu alamat, jadi `alternates`
yang menunjuk alamat yang sama tiga kali bukan sekadar tak berguna — ia
memberi tahu mesin pencari sesuatu yang tidak benar. Baru dipasang bila bahasa
kelak pindah ke `/(id|en|zh)/…`.

## Tombol menuju rute internal: `ButtonLink`, bukan `Button href`

`/register` dan `/login` adalah rute di dalam app, jadi keduanya `ButtonLink`
(#289) — navigasi sisi-klien + prefetch. Sampai perubahan ini keenam ajakan di
halaman ini memuat ulang seluruh aplikasi: tombol yang menjadi satu-satunya
alasan halaman ini ada sekaligus tautan paling lambat di dalamnya. Yang tetap
`Button href` hanya `mailto:` paket rundingan — itu memang tautan keluar.

⚠ Penjaga penekanan (`tests/button-emphasis.test.ts`) kini mengenali **kedua**
tag. Sebelumnya ia hanya mencocokkan `<Button>`, sehingga seluruh aturan #267
bisa dilewati dengan menulis `<ButtonLink variant="primary">` — termasuk batas
"setiap primer pendaratan menuju `/register`". Diukur saat diperlebar: 0
`<ButtonLink>` tanpa `variant`, 0 wadah yang menjadi >1 primer karenanya.

## Layout akar pemasaran, `/pricing`, galeri layar (#399)

### Dua root layout — dan angka yang membenarkannya (diukur, bukan dikira)

Sampai #399 `/` berdiri di bawah root layout aplikasi, dan halaman yang
dokumen ini sebut "nol JavaScript sisi klien" **terukur di produksi
(2026-08-16)** mengirim 21 `<script src>` ≈ **350 KB gzip** JS, **130 KB gzip**
HTML, dan 333 KB skrip sebaris — bukan dari `components/landing/**`, melainkan
dari yang dibawa `app/layout.tsx` untuk SEMUA rute: `LocaleProvider` yang
menyerialkan kamus ±2.500 kunci ke payload RSC, dan `CompanyIdentityProvider`
yang memanggil `/api/company/identity` pada setiap muatan.

Next hanya punya satu cara memisahkan itu: dua root layout di dua route group
tanpa `app/layout.tsx` di atasnya. Maka seluruh app pindah apa adanya ke
`app/(app)/**` (`git mv`, riwayat terjaga), `/` dan `/pricing` ke
`app/(marketing)/**`, dan bagian yang SAMA (`<html>`, font, kelas pemikul
token, skrip tema, `AntdRegistry`, `AntdProvider`) hidup sekali di
`components/providers/root-document.tsx` supaya kedua akar tidak menyimpang.

**Sesudah** (build produksi lokal, `next start`, tanpa cache):

| | sebelum (produksi) | sesudah `/` | sesudah `/pricing` |
|---|---|---|---|
| `<script src>` | 21 | 20 | 20 |
| JS gzip yang dirujuk | ≈350 KB | ≈346 KB | ≈346 KB |
| HTML gzip | ≈130 KB | **≈70 KB** | ≈35 KB |
| skrip sebaris (RSC payload) | 333 KB | **192 KB** | 72 KB |
| `GET /api/company/identity` per muatan | 1 | **0** | 0 |

Yang turun adalah **payload dokumen** (kamus & identitas), bukan chunk JS:
±346 KB itu AntD (`ConfigProvider` + `Button`/`Card`/`Segmented` yang dipakai
dua daun client `LocaleToggle`/`ThemeToggle`) dan runtime Next/React —
`AntdProvider` tetap di akar pemasaran DENGAN SENGAJA, sebab ialah yang
menulis blok `.sai-tokens{--ant-…}` yang mewarnai seluruh pendaratan.
Menurunkan angka JS itu berarti pendaratan tanpa satu pun komponen AntD dan
lembar token yang dibangkitkan terpisah — pekerjaan lain, dan angkanya di
sini supaya orang berikutnya tidak mengulang pengukurannya.

⚠ Dua daun client pendaratan menerima `locale`/label sebagai **prop** dari
komponen server (`landing-nav.tsx`, `landing-footer.tsx`): akar pemasaran
tidak memasang `LocaleProvider`. Daun client baru yang memanggil `useT()` di
sini mendapat KUNCInya sebagai teks — pasang propnya, jangan providernya.

### `/pricing` — komponen yang sama, alamat sendiri

Semua situs pembukuan berbahasa Indonesia yang ditinjau di #397 punya
alamat harga sendiri; kita hanya jangkar. `/pricing` merender `LandingPricing` + `LandingFaq`
yang PERSIS sama (judul harga menjadi `<h1>` lewat `headingLevel`), metadata &
kanonik sendiri, masuk `sitemap.ts`, dilepaskan `isPublicPath` di `proxy.ts`,
dan pengunjung bersesi dipantulkan ke `/dashboard` seperti `/`. Ia pintu masuk
KEDUA ke `components/landing/**` (`PINTU_MASUK`, `tests/landing-boundary`).

Konsekuensi pada bilah & kaki: keduanya kini dipakai dua halaman, jadi
jangkar ditulis **berakar** (`/#modul`, bukan `#modul`) — di `/` peramban
tetap menggulung dalam-dokumen, di `/pricing` ia menuju seksi yang benar — dan
"Harga" adalah `<Link href="/pricing">` di kedua halaman, bukan jangkar. Satu
perilaku, bukan bercabang per halaman. Di kaki tautan berakar itu `<Link>`,
sebab `@next/next/no-html-link-for-pages` menolak `<a href="/#…">` harfiah.

### Galeri tiga layar — purwarupa dirender, di dalam pita modul

Kompetitor memperlihatkan beberapa layar produk; kita satu kartu ringkasan.
`landing-gallery.tsx` menambah tiga purwarupa dengan pola `landing-hero-mock`:
**jurnal umum** (debit = kredit, jumlahnya DIHITUNG dari barisnya), **faktur
penjualan** (PPN dari `computeTax`/`DEFAULT_TAX_RATE` — karena itu berkasnya
masuk `ALLOWED` di `tests/tax-rates.test.ts`), dan **pengalih PT** (dua PT
contoh). Ketiga syarat §"Angkanya karangan" berlaku penuh: label "contoh
tampilan" selalu terlihat, nama PT jelas contoh, `aria-hidden`; nominal lewat
`formatMoney()` server. Ia hidup DI DALAM pita "Apa saja yang ada di dalam"
(sesudah daftar modul), bukan seksi sendiri: gambar layar adalah jawaban
visual atas "apakah pekerjaan saya ada di dalamnya", pertanyaan yang seksi
itu jawab dengan daftar.

#### Galeri memakai kerangka aplikasi, satu kartu dominan (#401)

Tiga kartu "dokumen" sejajar tanpa chrome aplikasi terbaca sebagai tiga
kartu, bukan tiga LAYAR. Kini tiap layar dibungkus **`LandingAppFrame` yang
sama dengan hero** (bilah judul: nama layar + pengalih PT mini; sidebar 40px
berikon, modul layar itu aktif — jurnal → pembukuan inti, faktur → penjualan),
isinya di satu kartu area kerja (`FRAME_CARD`). Tata letak **1 besar + 2
kecil** di ≥992px (`[data-landing-gallery]`, 3fr:2fr; jurnal `grid-row: 1 /
span 2` di kiri), satu kolom di bawahnya — alasan titik patahnya di §Titik
patah. Karena kartu jurnal kini dua baris tingginya, jurnalnya **dua entri**
— penjualan kredit dan PELUNASAN faktur yang sama (kas & bank ← piutang) —
jumlah & keseimbangan tiap entri tetap dihitung; ketiga layar tetap satu
cerita: faktur → jurnal → pelunasan.

### Ikon menu ponsel: dua rule, spesifisitas (0,2,0)

Ditemukan pada build produksi (bukan `next dev`): `≡` dan `×` tampil
**bersamaan**. `[data-landing-menu-close]{display:none}` berspesifisitas
(0,1,0) — sama dengan `.anticon{display:inline-flex}` milik
`@ant-design/icons`, yang di produksi disisipkan SESUDAH blok pendaratan dan
karena itu menang. Ketiga rule ikon kini disarangkan di bawah
`[data-landing-menu-toggle]` (≥ (0,2,0)). Pelajarannya umum: rule pendaratan
yang menyasar elemen AntD tidak boleh mengandalkan URUTAN penyisipan.
