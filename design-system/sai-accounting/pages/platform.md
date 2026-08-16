# Panel Akun `/platform` — override MASTER.md

> Berlaku untuk `/platform` dan seluruh anak-rutenya (`src/app/(app)/(tenant)/platform/**`
> + `src/components/tenant/platform-*`). Untuk halaman lain, MASTER.md tetap
> berlaku apa adanya.

## Kenapa halaman ini punya aturan sendiri

`/platform` adalah permukaan **KETIGA**. Ia bukan pendaratan pemasaran (`/`)
dan bukan buku besar: ia panel tempat pelanggan **membeli dan mengelola
langganannya** — paket, tagihan, tim, membuat PT baru, privasi — dibaca oleh
orang yang kemarin membaca halaman pendaratan.

Permintaan pemilik (issue #303): *"`/platform` dibuat lebih berwarna seperti
halaman pendaratan, pakai beberapa warna solid juga, supaya pelanggan lebih
tertarik."* Sah — tetapi halaman ini memajang **uang sungguhan** (harga paket,
tagihan terbuka, sisa masa uji coba) dan **status langganan**. Halaman tagihan
yang terasa seperti brosur menurunkan kepercayaan, bukan menaikkannya.

Karena itu yang di-override MASTER.md §Jenjang permukaan **hanya latar bidang
di dalam kartu**, bukan disiplinnya: tak satu pun kelonggaran halaman pendaratan
(hero, irama 96px, CTA berulang, kolom baca di tengah) berlaku di sini.
`PageHeader` + breadcrumb tetap wajib, kerapatan tetap 6/10, dan langit-langit
huruf tetap `fontSizeHeading1`.

## Keputusan #303: **A — resepnya milik bersama, nadanya tidak**

Tiga jalan ditimbang; yang dipilih **A**.

| Jalan | Keputusan |
|---|---|
| **A. Angkat RESEP `color-mix` ke modul netral-permukaan.** Pendaratan & `/platform` sama-sama mendeklarasikan nadanya sendiri dari resep yang sama, masing-masing dengan lingkup `data-*` sendiri | **DIPILIH.** Penjaga #245 tetap utuh — tidak ada impor lintas batas, sebab `components/landing/**` memang sudah boleh mengimpor `@/lib/**` — dan aritmetikanya hanya ditulis sekali |
| B. `/platform` diberi nada sendiri, resep sendiri | Ditolak: dua salinan `color-mix` yang akan menyimpang pada hari salah satunya disetel, dan perbedaannya tidak berbunyi |
| C. Batas pemasaran/app digeser; `/platform` dinyatakan bagian dunia pemasaran | Ditolak: melonggarkan penjaga yang baru saja dibuat mekanis (#245), dan menyeret `/platform/team` — pekerjaan administratif yang butuh ketenangan — ikut ke dalam dunia pemasaran |

Rumahnya `src/lib/theme/tone-recipe.ts`: ia tidak mendeklarasikan satu pun
variabel CSS dan tidak tahu apa-apa tentang halaman mana pun. Yang dibaginya
hanya bentuk `color-mix` + peta peran→keluarga palet.

**Yang TIDAK ikut jadi milik bersama adalah ANGKANYA**, dan itu inti
keputusannya: kadar campuran dibatasi oleh tombol dan latar yang dipikul
permukaannya, dan keduanya berbeda.

| | pendaratan `/` | `/platform` |
|---|---|---|
| latar halaman | `colorBgContainer` — `#ffffff` / `#141414` | `colorBgLayout` — `#f5f5f5` / **`#000000`** |
| permukaan kartu | `colorBgElevated` — `#ffffff` / `#1f1f1f` | `colorBgContainer` — `#ffffff` / `#141414` |
| yang berdiri di atas nada | tombol **primer** | tombol **garis** (`variant="outline"`) |
| yang mengikat kadarnya | isian `#1668dc` ≥3:1, tema **gelap** | tepi `colorBorder` ≥3:1, tema **terang** |
| kadar | pita 10 · ajakan 16 · isi 14 · chip 28 | **kepala 16 · chip 32** |

## Nada `/platform`: dua peran, tiga hue

Deklarasinya `src/components/tenant/platform-tone.ts`, terkurung di
`[data-platform]` yang dipasang `PlatformShell` — satu berkas, dikunci tes.

### Dua peran, dan kenapa angkanya segitu

**`head` = 16%** — nada **kepala kartu**. Angka TERBESAR yang masih menjaga
tepi tombol garis ≥3:1 pada ketiga nada di kedua tema. Yang mengikatnya violet
di tema **terang**:

| nada | tepi tombol garis @16% (terang) | @18% (terang) | @16% (gelap) |
|---|---|---|---|
| brand | 3,22 | 3,13 | 3,81 |
| indigo | 3,11 | 3,02 | 3,95 |
| violet | **3,05** | **2,94** ✗ | 4,03 |

**`chip` = 32%** — nada **kotak ikon** dan **kepala kartu paket berjalan**.
Angka TERKECIL yang membuat isian tombol primer tema gelap (`#1668dc`) turun di
bawah 3:1 pada ketiga nada sekaligus — **2,59 / 2,84 / 2,97**. Pada 30% violet
masih 3,01:1, dan aturan "tidak ada tombol di atas `chip`" kembali menjadi
janji yang harus diingat orang alih-alih kalimat yang dijaga tes.

Yang MEMIKUL tombol primer karena itu tetap **badan kartu telanjang**
(`colorBgContainer`, 6,16:1 terang / 3,55:1 gelap). Tombol "Pilih paket ini"
hidup di badan; kepala kartu hanya berisi teks dan lencana.

Terukur di seluruh nada: teks `colorText` 10,70–14,55:1 dan `colorTextSecondary`
5,57–7,92:1 (kedua tema, ambang 4,5:1); glif ikon anak tangga `-8` di atas
`chip` sehue 4,83–7,69:1 (ambang 3:1); lantai "nada ini benar-benar terlihat"
1,079–1,721:1 terhadap badan kartu (lantai 1,05).

### Tiga hue = tiga WILAYAH

| hue | wilayah | dipakai di |
|---|---|---|
| `brand` (blue) | akun & langganan berjalan | kepala kartu Akun, kotak ikon tenant, kepala kartu Langganan, pita masa coba tenang |
| `indigo` (geekblue) | perusahaan / buku | kepala kartu Perusahaan, kotak ikon tiap PT |
| `violet` (purple) | katalog paket & jalan menujunya | kepala tiap kartu paket, kartu "Butuh lebih?" di `/platform/billing` |

`cyan` **sengaja tidak dideklarasikan** meski resep bersamanya menyediakannya:
`/platform` tidak punya wilayah keempat yang membutuhkannya, dan nada yang
tersedia tanpa wilayah yang memerlukannya adalah undangan untuk memakainya
sebagai hiasan.

**Hijau, merah, emas, jingga tidak pernah menjadi nada dekoratif di sini — dan
aturannya lebih keras daripada di pendaratan**, sebab halaman ini menampilkan
angka yang ditagihkan. Keempatnya sudah menjadi bahasa uang & status
(`colorMoney*`, `colorSuccess`, `colorWarning`, `colorError`; #186/#187).

## Yang sengaja TIDAK bernada

- **Baris ringkasan `/platform`** (`StatCard`, `QuotaMeter`) — isinya uang dan
  status langganan; warnanya sudah bahasa (`tone="warning"` saat hanya-baca).
- **Pita penangguhan** `READ_ONLY_NOTE` dan **pita masa coba MENDESAK** —
  `colorWarningBg` + `colorMoneyPending`. Keduanya pernyataan tentang uang.
  (Pita masa coba **tenang** justru sebaliknya: latarnya dulu
  `colorFillQuaternary`, translusen 2–4% dan praktis tidak ada di layar; kini
  `head-brand` yang opak. Nada ≠ status, jadi "amber = ada yang harus diurus"
  tidak kehilangan artinya.)
- **Kepala kartu Riwayat Tagihan** — satu-satunya kartu yang isinya nominal
  yang harus dibayar. Bidang berwarna di atas tabel uang adalah bentuk paling
  murni "warna sebagai penanda yang tidak dimaksudkan".
- **Angka mana pun.** Nominal tetap `Money`/`moneyColumn`, `tabular-nums`, rata
  kanan, format `id-ID`.

## Yang DITOLAK — beserta angkanya

### 1. Pita / wilayah bernada di BELAKANG kartu (dicampur ke `colorBgLayout`)

Bentuk pendaratan yang paling menggoda disalin: satu bidang berwarna selebar
isi yang menampung kartu-kartu. **Ditolak, dan ia gagal karena aritmetika di
KEDUA tema sekaligus:**

- **Tema terang** — `colorBorderSecondary` (`#8c8c8c`, tepi kartu sejak #208)
  berkontras **3,08:1** terhadap `colorBgLayout` `#f5f5f5`. Itu **nol
  kelonggaran** di atas ambang 3:1. Menambahkan nada 10% saja menurunkannya ke
  **2,73:1** (brand) / 2,68 (indigo) / 2,64 (violet), dan pada 16% ke
  **2,39–2,53:1**. Yaitu: setiap tint pada latar halaman mencabut jaminan #208
  untuk tepi SETIAP kartu di atasnya.
- **Tema gelap** — arah kegagalannya terbalik. `colorBgLayout` gelap `#000000`
  sedangkan kartu `#141414`, jadi menerangkan latar menariknya NAIK menuju
  kartu: brand 10% → kartu tinggal **1,076:1** terhadap wilayahnya, 14% →
  **1,046:1**, 16% → **1,030:1**. Sementara lantai "wilayahnya terlihat" baru
  tercapai pada 10–14% (violet butuh 14% untuk 1,059 terhadap halaman). Jendela
  antara "wilayahnya terlihat" dan "kartunya lenyap" praktis nol.

Pendaratan tidak menghadapi ini karena pitanya berdiri di `colorBgContainer`
dan kartunya `colorBgElevated` — dua permukaan yang lain. **Karena itu nada
`/platform` hidup DI DALAM kartu, tidak pernah di belakangnya.**

### 2. Bidang PEKAT (anak tangga -6 utuh) berteks putih

Ditolak — tetapi **bukan** karena alasan yang tercatat di
`pages/landing.md`. Catatan itu berbunyi "tidak ada SATU anak tangga yang bisa
memikul teks putih di kedua tema"; diukur ulang, kalimat itu benar **hanya
untuk biru** (`blue-7` terang 6,16 / gelap 3,54; `blue-6` gelap 5,19 / terang
4,10). Untuk dua hue lain ia **tidak** berlaku: `geekblue-6` memikul teks putih
**5,85 (terang) / 7,13 (gelap)** dan `purple-6` **6,94 / 8,27** — keduanya
lolos 4,5:1 di kedua tema.

Yang menjatuhkannya di sini adalah hal lain: **seluruh kosakata `/platform`
dibangun untuk permukaan terang**, dan sebuah bidang pekat menuntut kosakata
KEDUA untuk setiap elemen di atasnya. Terukur di atas `purple-6`:

| yang berdiri di atasnya | terang | gelap | ambang |
|---|---|---|---|
| `colorText` (judul & isi kartu) | **2,87** ✗ | 6,41 | 4,5:1 |
| `colorTextSecondary` (kalimat penjelas) | **2,40** ✗ | **4,40** ✗ | 4,5:1 |
| tepi tombol garis `colorBorder` | **1,76** ✗ | **1,95** ✗ | 3:1 |
| isian tombol primer | **1,13** ✗ | **1,59** ✗ | 3:1 |
| latar `Badge`/`Tag` (lencana "paket berjalan") | 6,75 | **1,98** ✗ | — |

Sembilan dari sepuluh gagal. Memaksanya berarti mengganti warna teks, warna
tepi tombol, dan latar lencana **hanya di dalam bidang itu** — yaitu tema kedua
di dalam satu halaman, persis mekanisme yang dihindari seluruh sistem nada ini.

### 3. Hue yang berputar per baris / per kartu paket

Ditolak. Sepuluh kartu perusahaan dengan sepuluh rona adalah konfeti, bukan
hierarki — dan untuk kartu paket lebih buruk lagi: **hue bukan urutan.** Tidak
ada pembaca yang bisa menyimpulkan "violet lebih tinggi dari cyan", jadi rona
per tier menjanjikan peringkat yang tidak pernah bisa dibaca. Yang membedakan
kartu paket **berjalan** dari sisanya adalah KADAR-nya (32% vs 16%), dan itu
pun penanda ketiga sesudah lencana berteks dan tepi merek.

### 4. Kartu paket yang badannya bernada

Ditolak, dan tes yang menegaskannya sengaja berbentuk terbalik ("nada `chip`
memang TIDAK layak memikul tombol"). Badan kartu memikul tombol "Pilih paket
ini"; nada 32% menjatuhkan isiannya ke **2,59–2,97:1** di tema gelap. Kalau
suatu hari nada ini cukup redup untuk memikul tombol, tes itu merah dan
pemisahan kepala/badan boleh dicabut **dengan sengaja**.

## Penjaganya

`tests/platform-colors.test.ts` menghitung ulang setiap pasangan warna dari
token yang benar-benar terpasang (`theme.getDesignToken` pada paket `antd` di
`node_modules`) dan dari resep `color-mix` yang **diurai dari `PLATFORM_STYLE`
itu sendiri** — bukan diketik ulang di tes. Ia mengunci:

- teks ≥4,5:1 di setiap nada, kedua tema;
- tepi tombol garis ≥3:1 di atas setiap `head-*`, kedua tema (**inilah yang
  mengikat 16%**);
- isian tombol primer ≥3:1 terhadap badan kartu — yaitu badan kartu tetap
  telanjang;
- batas terbalik: setiap `chip-*` **di bawah** 3:1 terhadap isian primer gelap;
- glif ikon `-8` ≥3:1 di atas `chip` sehue;
- lantai 1,05:1 "nada ini benar-benar ada di layar";
- nada dicampur ke `colorBgContainer`, bukan ke permukaan lain;
- batas: string nama variabelnya tidak muncul di berkas lain mana pun, akarnya
  (`data-platform`) dipasang tepat satu berkas, deklarasinya tidak pernah di
  selektor global, dan setiap variabel yang dipakai memang dideklarasikan.

⚠ Penjaga ini sudah dilihat MERAH pada tujuh pelanggaran yang disengaja
sebelum dianggap selesai (dicatat di badan PR #303).

`tests/landing-boundary.test.ts` **tetap hijau tanpa disunting**: `/platform`
tidak mengimpor apa pun dari `components/landing/**`, dan sebaliknya.

## Yang TETAP BERLAKU PENUH (jangan tawar)

- **`PageHeader` + breadcrumb** untuk setiap judul; tidak ada hero.
- **Kerapatan 6/10**, lebar isi 1152px (`PlatformShell`), tanpa kolom baca di tengah.
- **`variant` eksplisit di setiap `<Button>`**; satu aksi utama per layar (#267).
- **Warna tidak pernah penanda tunggal**: paket berjalan tetap berlencana
  berteks, status langganan tetap berupa kata.
- **Nol `className`, nol hex mentah** (ESLint `sai/warna-token-antd`), gaya
  sebaris, dan yang tak punya bentuk sebaris hidup di satu `<style href
  precedence>` bertarget `data-*`.
- **Dua tema.** Setiap nada dicampur ke permukaan yang SEDANG berlaku, jadi
  tidak ada satu pun cabang tema di halaman `/platform`.
- **Klaim harus punya sumber**: harga & kuota dari `activePlans()`, nominal
  lewat `platformInvoiceAmounts()` yang sama dengan yang menagih.
