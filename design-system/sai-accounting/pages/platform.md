# Panel Akun `/platform` — override MASTER.md

> Berlaku untuk `/platform` dan seluruh anak-rutenya (`src/app/(app)/(tenant)/(panel)/platform/**`
> + `src/components/tenant/platform-*`). Untuk halaman lain, MASTER.md tetap
> berlaku apa adanya.

## Kenapa halaman ini punya aturan sendiri

`/platform` adalah permukaan ketiga, di samping pendaratan pemasaran (`/`) dan
buku besar. Di sini pelanggan membeli dan mengelola langganannya: paket,
tagihan, tim, membuat PT baru, privasi. Pembacanya orang yang kemarin membaca
halaman pendaratan.

Permintaan pemilik (issue #303): *"`/platform` dibuat lebih berwarna seperti
halaman pendaratan, pakai beberapa warna solid juga, supaya pelanggan lebih
tertarik."* Permintaan itu sah, tetapi halaman ini memajang uang sungguhan
(harga paket, tagihan terbuka, sisa masa uji coba) dan status langganan.
Halaman tagihan yang terasa seperti brosur menurunkan kepercayaan.

Karena itu yang di-override dari MASTER.md §Jenjang permukaan hanya latar bidang
di dalam kartu. Tak satu pun kelonggaran halaman pendaratan
(hero, irama 96px, CTA berulang, kolom baca di tengah) berlaku di sini.
`PageHeader` + breadcrumb tetap wajib, kerapatan tetap 6/10, dan langit-langit
huruf tetap `fontSizeHeading1`.

## Keputusan #303: **A — resepnya milik bersama, nadanya tidak**

Tiga jalan ditimbang; yang dipilih A.

| Jalan | Keputusan |
|---|---|
| **A. Angkat RESEP `color-mix` ke modul netral-permukaan.** Pendaratan & `/platform` sama-sama mendeklarasikan nadanya sendiri dari resep yang sama, masing-masing dengan lingkup `data-*` sendiri | **DIPILIH.** Guard #245 tetap utuh — tidak ada impor lintas batas, sebab resepnya tinggal di `@sai/ui/theme/tone-recipe` dan `components/landing/**` memang boleh mengimpor `@sai/ui/**` — dan aritmetikanya hanya ditulis sekali |
| B. `/platform` diberi nada sendiri, resep sendiri | Ditolak: dua salinan `color-mix` yang akan menyimpang pada hari salah satunya disetel, dan perbedaannya tidak berbunyi |
| C. Batas pemasaran/app digeser; `/platform` dinyatakan bagian dunia pemasaran | Ditolak: melonggarkan guard yang baru saja dibuat mekanis (#245), dan menyeret `/platform/team` — pekerjaan administratif yang butuh ketenangan — ikut ke dalam dunia pemasaran |

Rumahnya `packages/ui/src/theme/tone-recipe.ts`: ia tidak mendeklarasikan satu pun
variabel CSS dan tidak tahu apa-apa tentang halaman mana pun. Yang dibaginya
hanya bentuk `color-mix` + peta peran→keluarga palet.

Angkanya tidak ikut menjadi milik bersama. Kadar campuran dibatasi oleh tombol
dan latar yang dipikul tiap permukaan, dan keduanya berbeda.

| | pendaratan `/` | `/platform` |
|---|---|---|
| latar halaman | `colorBgContainer` — `#ffffff` / `#141414` | `colorBgLayout` — `#f5f5f5` / **`#000000`** |
| permukaan kartu | `colorBgElevated` — `#ffffff` / `#1f1f1f` | `colorBgContainer` — `#ffffff` / `#141414` |
| yang berdiri di atas nada | tombol **primer** | tombol **garis** (`variant="outline"`) |
| yang mengikat kadarnya | isian tombol primer ≥3:1, tema **gelap** | tepi `colorBorder` ≥3:1, tema **terang** |
| kadar | `LANDING_MIX` (`components/landing/landing-scale.ts`) | `PLATFORM_MIX` (`components/tenant/platform-tone.ts`) |

## Nada `/platform`: dua peran, tiga hue

Deklarasinya `src/components/tenant/platform-tone.ts`, terkurung di
`[data-platform]` yang dipasang `PlatformShell` (satu berkas, dikunci tes).

### Dua peran, dan kenapa angkanya segitu

Kadarnya `PLATFORM_MIX` di `platform-tone.ts`. Angka terukurnya ada di komentar
konstanta itu dan dihitung ulang `tests/platform-colors.test.ts`.

- **`head`**: nada kepala kartu. Angka terbesar yang masih menjaga tepi tombol
  garis ≥3:1 pada ketiga nada di kedua tema. Yang mengikatnya tema terang
  (violet paling dulu habis).
- **`chip`**: nada kotak ikon dan kepala kartu paket berjalan. Angka terkecil
  yang membuat isian tombol primer tema gelap turun di bawah 3:1 pada ketiga
  nada sekaligus, sehingga "tidak ada tombol di atas `chip`" dijaga tes. Bila
  isian tombol berubah (mis. warna merek), kadar ini diukur ulang.

Tombol primer karena itu hanya berdiri di badan kartu telanjang
(`colorBgContainer`). Tombol "Pilih paket ini" hidup di badan; kepala kartu
hanya berisi teks dan lencana.

Di setiap nada, kedua tema: teks `colorText`/`colorTextSecondary` ≥4,5:1, glif
ikon anak tangga `-8` di atas `chip` sehue ≥3:1, dan nadanya melewati lantai
1,05:1 "benar-benar terlihat" terhadap badan kartu.

### Tiga hue = tiga WILAYAH

| hue | wilayah | dipakai di |
|---|---|---|
| `brand` (blue) | akun & langganan berjalan | kepala kartu Akun, kotak ikon tenant, kepala kartu Langganan, pita masa coba tenang |
| `indigo` (geekblue) | perusahaan / buku | kepala kartu Perusahaan, kotak ikon tiap PT |
| `violet` (purple) | katalog paket & jalan menujunya | kepala tiap kartu paket, kartu "Butuh lebih?" di `/platform/billing` |

`cyan` sengaja tidak dideklarasikan meski resep bersamanya menyediakannya.
`/platform` tidak punya wilayah keempat, dan nada tanpa wilayah akan dipakai
sebagai hiasan.

**Hijau, merah, emas, jingga tidak pernah menjadi nada dekoratif di sini.**
Aturannya lebih keras daripada di pendaratan, sebab halaman ini menampilkan
angka yang ditagihkan. Keempatnya sudah menjadi bahasa uang & status
(`colorMoney*`, `colorSuccess`, `colorWarning`, `colorError`; #186/#187).

## Yang sengaja TIDAK bernada

- **Baris ringkasan `/platform`** (`StatCard`, `QuotaMeter`): isinya uang dan
  status langganan; warnanya sudah bahasa (`tone="warning"` saat hanya-baca).
- **Pita penangguhan** `READ_ONLY_NOTE` dan **pita masa coba mendesak**:
  `colorWarningBg` + `colorMoneyPending`. Keduanya pernyataan tentang uang.
  (Pita masa coba tenang bernada `head-brand`: nada ≠ status, jadi
  "amber = ada yang harus diurus" tidak kehilangan artinya.)
- **Kepala kartu Riwayat Tagihan**: satu-satunya kartu yang isinya nominal
  yang harus dibayar. Bidang berwarna di atas tabel uang menjadi penanda yang
  tidak dimaksudkan.
- **Angka mana pun.** Nominal tetap `Money`/`moneyColumn`, `tabular-nums`, rata
  kanan, format `id-ID`.

## Yang DITOLAK — beserta angkanya

### 1. Pita / wilayah bernada di BELAKANG kartu (dicampur ke `colorBgLayout`)

Bentuk pendaratan ini (satu bidang berwarna selebar isi yang menampung
kartu-kartu) ditolak karena gagal di kedua tema:

- **Tema terang**: `colorBorderSecondary` (`#8c8c8c`, tepi kartu sejak #208)
  berkontras 3,08:1 terhadap `colorBgLayout` `#f5f5f5`, hampir tanpa margin di
  atas ambang 3:1. Nada 10% menurunkannya ke 2,73:1 (brand) / 2,68 (indigo) /
  2,64 (violet), dan pada 16% ke 2,39–2,53:1. Setiap tint pada latar halaman
  mencabut jaminan #208 untuk tepi setiap kartu di atasnya.
- **Tema gelap**: arahnya terbalik. `colorBgLayout` gelap `#000000` sedangkan
  kartu `#141414`, jadi menerangkan latar mendekatkannya ke kartu: brand 10% →
  kartu tinggal 1,076:1 terhadap wilayahnya, 14% → 1,046:1, 16% → 1,030:1.
  Lantai "wilayahnya terlihat" baru tercapai pada 10–14% (violet butuh 14%
  untuk 1,059 terhadap halaman). Rentang antara "wilayahnya terlihat" dan
  "kartunya hilang" praktis nol.

Pendaratan tidak menghadapi ini karena pitanya berdiri di `colorBgContainer`
dan kartunya `colorBgElevated`. **Nada `/platform` karena itu hanya ada di
dalam kartu, tidak pernah di belakangnya.**

### 2. Bidang PEKAT (anak tangga -6 utuh) berteks putih

Ditolak, tetapi tidak karena alasan di `pages/landing.md` ("tidak ada satu anak
tangga yang bisa memikul teks putih di kedua tema"). Diukur ulang, kalimat itu
hanya benar untuk biru (`blue-7` terang 6,16 / gelap 3,54; `blue-6` gelap 5,19 / terang
4,10). Untuk dua hue lain ia tidak berlaku: `geekblue-6` memikul teks putih 5,85
(terang) / 7,13 (gelap) dan `purple-6` 6,94 / 8,27; keduanya lolos 4,5:1 di
kedua tema.

Yang menjatuhkannya di sini: seluruh kosakata `/platform` dibangun untuk
permukaan terang, dan bidang pekat menuntut kosakata kedua untuk setiap elemen
di atasnya. Terukur di atas `purple-6`:

| yang berdiri di atasnya | terang | gelap | ambang |
|---|---|---|---|
| `colorText` (judul & isi kartu) | **2,87** ✗ | 6,41 | 4,5:1 |
| `colorTextSecondary` (kalimat penjelas) | **2,40** ✗ | **4,40** ✗ | 4,5:1 |
| tepi tombol garis `colorBorder` | **1,76** ✗ | **1,95** ✗ | 3:1 |
| latar `Badge`/`Tag` (lencana "paket berjalan") | 6,75 | **1,98** ✗ | — |

Hampir semuanya gagal. Memaksanya berarti mengganti warna teks, tepi tombol,
dan latar lencana hanya di dalam bidang itu, yaitu tema kedua di dalam satu
halaman. Itu yang dihindari seluruh sistem nada ini.

### 3. Hue yang berputar per baris / per kartu paket

Ditolak. Sepuluh kartu perusahaan dengan sepuluh rona tidak membentuk
hierarki. Untuk kartu paket lebih buruk lagi, karena hue bukan urutan: tidak
ada pembaca yang bisa menyimpulkan "violet lebih tinggi dari cyan". Kartu paket
berjalan dibedakan oleh kadarnya (`chip` vs `head`), sebagai penanda ketiga
sesudah lencana berteks dan tepi merek.

### 4. Kartu paket yang badannya bernada

Ditolak. Tesnya sengaja berbentuk terbalik ("nada `chip` memang tidak layak
memikul tombol"). Badan kartu memikul tombol "Pilih paket
ini"; nada `chip` menjatuhkan isiannya di bawah 3:1 di tema gelap. Kalau
suatu hari nada ini cukup redup untuk memikul tombol, tes itu merah dan
pemisahan kepala/badan boleh dicabut secara sadar.

## Guard-nya

`tests/platform-colors.test.ts` menghitung ulang setiap pasangan warna dari
token yang benar-benar terpasang (`theme.getDesignToken` pada paket `antd` di
`node_modules`) dan dari resep `color-mix` yang diurai dari `PLATFORM_STYLE`
itu sendiri, bukan diketik ulang di tes. Ia mengunci:

- teks ≥4,5:1 di setiap nada, kedua tema;
- tepi tombol garis ≥3:1 di atas setiap `head-*`, kedua tema (inilah yang
  mengikat `head`);
- isian tombol primer ≥3:1 terhadap badan kartu (badan kartu tetap telanjang);
- batas terbalik: setiap `chip-*` di bawah 3:1 terhadap isian primer gelap;
- glif ikon `-8` ≥3:1 di atas `chip` sehue;
- lantai 1,05:1 "nada ini benar-benar ada di layar";
- nada dicampur ke `colorBgContainer`, bukan ke permukaan lain;
- batas: string nama variabelnya tidak muncul di berkas lain mana pun, akarnya
  (`data-platform`) dipasang tepat satu berkas, deklarasinya tidak pernah di
  selektor global, dan setiap variabel yang dipakai memang dideklarasikan.

`tests/landing-boundary.test.ts` tetap hijau tanpa disunting: `/platform`
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
- **Dua tema.** Setiap nada dicampur ke permukaan yang sedang berlaku, jadi
  tidak ada satu pun branch tema di halaman `/platform`.
- **Klaim harus punya sumber**: harga & kuota dari `activePlans()`, nominal
  lewat `platformInvoiceAmounts()` yang sama dengan yang menagih.
