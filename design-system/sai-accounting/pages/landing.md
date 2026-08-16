# Halaman Pendaratan `/` — override MASTER.md

> Berlaku HANYA untuk `/` dan `/harga` (`src/app/(marketing)/**` +
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
| Tanpa hero / CTA | Hero + CTA **boleh** — itu memang tugas halaman ini. Ukurannya `--sai-landing-font-size-hero`, satu-satunya teks di aplikasi ini yang melampaui `fontSizeHeading1`. **FLUID sejak perubahan ini**: `clamp(1,1× … 4.5vw … 1,6×)` di atas `--ant-font-size-heading-1` (≈42px → ≈61px). Angka mati 1,4× sebelumnya berarti hero yang sama besarnya di 576px dan di 2560px |
| `PageHeader` wajib untuk judul | **Tidak berlaku**: `PageHeader` membawa breadcrumb & kerangka dasbor. Halaman ini menulis `<h1>` sendiri, satu buah, di hero |
| Density 6/10 (nyaman untuk data) | Lebih longgar — `--sai-landing-rhythm` (64px → 96px) antar-seksi. Tidak ada tabel data di sini |
| Lebar penuh area kerja | Kolom baca dikurung: 72rem per seksi, 42rem per kolom teks, keduanya di tengah |
| Permukaan netral: halaman `colorBgLayout`, kartu `colorBgContainer` | **Bidang berwarna** — pita seksi & kartu berisi nada pekat `--sai-landing-band-*` / `-fill-*` / `-chip-*`. Lihat §Nada pekat di bawah |
| Satu aksi utama per layar (#267) | **Tidak berlaku**: halaman ini merender empat tombol berisi penuh sekaligus — bilah atas, hero, tiap kartu paket, penutup — dan itu memang bentuknya. **Batasnya**: keempatnya harus menuju tempat yang SAMA (`/register`), sebab yang sah adalah satu ajakan yang diulang, bukan empat ajakan yang bersaing. Dijaga `tests/button-emphasis.test.ts`; alasan lengkapnya di MASTER.md §Aksi utama per layar |

## Susunan seksi, dan kenapa urutannya begitu

    hero (+ purwarupa produk + strip bukti)   gradien brand → cyan
      → "Yang Anda dapatkan"           polos, kartu bernada
      → "Apa saja yang ada di dalam"   pita cyan, DAFTAR (tanpa kartu)
          + galeri tiga layar          purwarupa dirender, di dalam pita  (#399)
      → "Untuk siapa"                  polos, kartu bernada + pil modul   (#398)
      → "Integrasi & jalan keluar data" pita brand, DAFTAR (tanpa kartu)  (#398)
      → "Yang menjaga pembukuan Anda"  polos, kartu bernada  ← sebelum harga
      → "Paket & harga"                pita indigo, kartu `surface` bertepi
      → FAQ                            polos, panel bernada
      → kontak                         polos, panel bernada + daftar kanal
      → ajakan penutup                 pita accent
      → kaki                           pita indigo

Perhatikan iramanya: **polos → pita → polos → pita**. Itu bukan kebetulan
melainkan hasil aturan tepi di bawah — seksi yang kartunya bernada wajib polos,
dan seksi yang pitanya bernada tidak boleh mewarnai kartunya.

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

## Formulir kontak — satu-satunya formulir di pendaratan

Sebelumnya satu-satunya cara menghubungi adalah tautan `mailto:` di kartu paket
rundingan — dan itu pun mati bila `PLATFORM_CONTACT_EMAIL` belum diisi (yaitu
bawaan setiap pemasangan).

### Server action, BUKAN komponen formulir klien

Konvensi formulir aplikasi ini `react-hook-form` + `zod` lewat `Form`, dan pola
itu **klien**. Di halaman ini ia salah: pendaratan sengaja nol JavaScript sisi
klien (`AMBANG_KLIEN`), sebab pengunjungnya belum tentu pernah mendaftar.

`<form action={serverAction}>` bekerja **tanpa JavaScript sama sekali**;
validasi tetap `zod`, hanya pindah ke server — satu-satunya sisi yang bisa
dipercaya untuk endpoint publik. Isiannya `<input>`/`<textarea>` telanjang yang
digayakan token yang sama, sebab `Input`/`Textarea` milik `components/ui`
adalah komponen AntD (klien).

Hasil kiriman disampaikan lewat **parameter kueri** (`?kontak=…#kontak`), bukan
`useActionState` — hook itu akan menyeret formulirnya menjadi komponen klien dan
membatalkan seluruh alasan di atas. Nilainya DISARING terhadap daftar sah:
`?kontak=` bisa diisi siapa saja.

### Tiga pagar, dan kenapa masing-masing ada

1. **Pembatas laju PERSISTEN per IP** (`contactIp`, 5/jam). Aturan di kepala
   `rate-limit.ts`: endpoint terbuka-ke-internet tidak boleh memakai penghitung
   memori. Formulir ini lebih terbuka daripada `/register` — ia tidak menuntut
   apa pun dari pengirim dan setiap kiriman **mengirim surel**.
2. **Perangkap madu.** Terisi = diperlakukan seolah BERHASIL, bukan ditolak:
   penolakan memberi tahu bot bahwa perangkapnya ada. Disembunyikan lewat
   pengurungan 1px, **bukan** `type="hidden"` — sebagian bot justru melewati
   isian tersembunyi karena mengenalinya sebagai perangkap.
3. **Alamat tujuan belum disetel = TANPA formulir.** Merender formulir yang
   kiriman­nya tidak menuju ke mana pun lebih buruk daripada tidak punya
   formulir: orang menulis pesan, menekan kirim, dan mengira ada yang membaca.

### ⚠ Tombol kirim `outline`, bukan `primary`

Ditemukan `tests/button-emphasis.test.ts`, dan penjaga itu benar secara desain:
pengecualian pendaratan sah karena ajakannya **satu yang diulang**, dan tombol
kirim berisi penuh akan menjadi ajakan KEDUA yang bersaing di halaman yang sama.

### Tautannya hanya di KAKI, tidak di bilah atas

Bilah atas terukur menuntut 685px dengan empat tautan; tautan kelima
mendorongnya melewati titik patah 768px dan menghidupkan lagi gulungan mendatar
yang baru saja diperbaiki. (Sejak #398 ia juga ada di **panel menu ponsel** —
di panel yang bertumpuk ke bawah, lebar bukan kendala.)

### Kanal dukungan: HANYA yang ada, dan tanpa janji waktu (#398)

Di bawah formulir ada daftar kanal — surel, WhatsApp, dokumentasi — dan
daftarnya dibangun dari `lib/contact-channels.ts`: surel bila
`PLATFORM_CONTACT_EMAIL` terisi, WhatsApp bila `PLATFORM_CONTACT_WHATSAPP`
terisi **dan sah** (nomor internasional tanpa `+`; yang salah bentuk ditolak
`scripts/check-env.mjs` saat mulai dan tidak dirender), dokumentasi selalu.
Kanal yang tidak disetel **tidak dirender**, bukan dirender kelabu.

- Tombol WhatsApp `outline` + `Button href` (tautan KELUAR, `target=_blank`
  `rel=noopener`), bukan `ButtonLink`, bukan `primary` — penjaga penekanan
  mengunci setiap primer pendaratan ke `/register`; WhatsApp jalan bertanya,
  bukan jalan mendaftar.
- ⚠ **Tanpa jam layanan, SLA, atau "dibalas dalam N jam".** Tak ada kode yang
  menjaminnya (§KLAIM HARUS PUNYA SUMBER), dan janji waktu balas adalah janji
  yang paling cepat ditagih.

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

Judul hero berjanji *"beberapa PT, satu akun"* — dan purwarupanya dulu
memperlihatkan SATU perusahaan. Gambar yang tidak mengatakan hal yang sama
dengan kalimat di sebelahnya adalah hiasan, bukan ilustrasi.

Dua bilah menyembul di atas kartu utama seperti tumpukan map: "beberapa PT"
menjadi sesuatu yang **terlihat**, bukan hanya terbaca.

- **Bilahnya lebih SEMPIT, bukan digeser mendatar.** Menggeser ke samping
  melebarkan kotak pembatas dan berisiko menggulung mendatar di layar sempit —
  kegagalan yang sudah pernah terjadi di bilah atas.
- **Tanpa nama PT di bilahnya.** Dicoba lebih dulu dan dibuang: teks di dalam
  pita setinggi 18px terpotong kartu di depannya dan terbaca sebagai render
  yang gagal. Perusahaan yang sedang dibuka sudah dinamai kepala kartu utama.

### Sparkline melebar penuh

132×34 yang terselip di samping nominal terbaca sebagai hiasan kecil.
Membentang di dasar kartu ia menjadi bagian kartu itu.
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
terbesar — merasa bukan sasaran, padahal paket terkecil memang satu PT. Kalimat
tubuhnya menutup: *"Mulai dari satu PT; PT berikutnya cukup ditambahkan."*
Purwarupa hero (tumpukan bilah PT) tetap benar: "beberapa" masih ada di
judulnya.

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
| Kanal dukungan | dokumentasi publik `/docs`; formulir kontak (`landing-contact.tsx`) | **jam layanan / SLA / telepon / obrolan** — tidak ada kodenya |
| Tempat data & UU PDP | basis data per PT (#104), ekspor mandiri, permintaan hapus bertenggang 30 hari & bisa dibatalkan (docs/COMPLIANCE.md), tidak ada hapus otomatis, `/privacy` | **lokasi server** — data residency masih keputusan terbuka (COMPLIANCE.md §5.1) |

⚠ **Jawaban dukungan BERCABANG pada sakelar yang sama dengan formulirnya.**
Formulir kontak hanya dirender bila `PLATFORM_CONTACT_EMAIL` terisi; jawaban
yang menyuruh "pakai formulir kontak di halaman ini" pada pemasangan tanpa
formulir adalah penunjuk palsu. Tanpa alamat, jawabannya
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
  lebar disapu satu per satu. Jangan menambah titik patah ketiga tanpa mengukur
  lebih dulu.
- **Menu ponsel (#398): `<details><summary>`, tanpa JavaScript.** Di bawah
  768px tautan seksi + `#kontak` + pemilih bahasa (<576px saja — di 576–768
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

### Nada `accent` dipakai TEPAT SEKALI — dan kini benar-benar sekali

Ajakan penutup. Nada terkuat halaman kehilangan artinya kalau ia muncul dua
kali.

⚠ **Dikoreksi.** Versi sebelumnya membolehkan hero ikut memakainya "sebagai
UJUNG gradien, bukan sebagai bidang rata". Di layar pengecualian itu tidak
bertahan: pita penutup terbaca sebobot hero, sehingga halaman berakhir datar
alih-alih memuncak — yaitu persis yang aturan ini dibuat untuk mencegah. Hero
kini mulai dari `band-brand` (10%), dan `accent` (16%) muncul di satu tempat
saja.

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

- **Pita ajakan penutup berisi biru pekat dengan teks putih.** Terukur, dan ia
  gagal karena aritmetika, bukan selera: tangga biru membalik di tema gelap,
  jadi tidak ada SATU anak tangga BIRU yang bisa memikul teks putih di kedua
  tema (`blue-7` terang 6,16:1 tapi gelap 3,54:1; `blue-6` gelap 5,19:1 tapi
  terang 4,10:1). Memaksanya berarti mencabang tema di dalam blok gaya
  pendaratan, yaitu mekanisme tema KEDUA di satu halaman.
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

## Layout akar pemasaran, `/harga`, galeri layar (#399)

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
`app/(app)/**` (`git mv`, riwayat terjaga), `/` dan `/harga` ke
`app/(marketing)/**`, dan bagian yang SAMA (`<html>`, font, kelas pemikul
token, skrip tema, `AntdRegistry`, `AntdProvider`) hidup sekali di
`components/providers/root-document.tsx` supaya kedua akar tidak menyimpang.

**Sesudah** (build produksi lokal, `next start`, tanpa cache):

| | sebelum (produksi) | sesudah `/` | sesudah `/harga` |
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

### `/harga` — komponen yang sama, alamat sendiri

Semua situs pembukuan berbahasa Indonesia yang ditinjau di #397 punya
`/harga`; kita hanya jangkar. `/harga` merender `LandingPricing` + `LandingFaq`
yang PERSIS sama (judul harga menjadi `<h1>` lewat `headingLevel`), metadata &
kanonik sendiri, masuk `sitemap.ts`, dilepaskan `isPublicPath` di `proxy.ts`,
dan pengunjung bersesi dipantulkan ke `/dashboard` seperti `/`. Ia pintu masuk
KEDUA ke `components/landing/**` (`PINTU_MASUK`, `tests/landing-boundary`).

Konsekuensi pada bilah & kaki: keduanya kini dipakai dua halaman, jadi
jangkar ditulis **berakar** (`/#modul`, bukan `#modul`) — di `/` peramban
tetap menggulung dalam-dokumen, di `/harga` ia menuju seksi yang benar — dan
"Harga" adalah `<Link href="/harga">` di kedua halaman, bukan jangkar. Satu
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

### Ikon menu ponsel: dua rule, spesifisitas (0,2,0)

Ditemukan pada build produksi (bukan `next dev`): `≡` dan `×` tampil
**bersamaan**. `[data-landing-menu-close]{display:none}` berspesifisitas
(0,1,0) — sama dengan `.anticon{display:inline-flex}` milik
`@ant-design/icons`, yang di produksi disisipkan SESUDAH blok pendaratan dan
karena itu menang. Ketiga rule ikon kini disarangkan di bawah
`[data-landing-menu-toggle]` (≥ (0,2,0)). Pelajarannya umum: rule pendaratan
yang menyasar elemen AntD tidak boleh mengandalkan URUTAN penyisipan.
