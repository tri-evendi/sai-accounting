# Design System Master File — SAI Accounting

> **LOGIC:** Saat membangun halaman tertentu, cek dulu `design-system/sai-accounting/pages/[page-name].md`.
> Jika ada, aturannya **meng-override** file Master ini. Jika tidak, ikuti aturan di bawah.

> **Catatan kurasi:** Base dihasilkan oleh skill `ui-ux-pro-max` (kategori *Financial Dashboard*), lalu **dikurasikan manual** agar sesuai konteks: aplikasi **akuntansi internal untuk pengguna awam**, bukan landing page. Pilihan flashy (dark-default, exaggerated minimalism, pola landing/CTA) sengaja **ditolak**. Untuk deep-dive per-dimensi, jalankan:
> `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs`

**Project:** SAI Accounting — ERP/pembukuan internal (trading/ekspor komoditas)
**Prinsip:** *Simple surface, standard engine* — tampilan tenang & mudah untuk staff amatir; integritas akuntansi tetap baku.
**Stack:** Next.js 16 (App Router) · **Ant Design v6** (`ConfigProvider` + CSS-in-JS) di `src/components/ui` · form `react-hook-form` + `zod` · tabel **`StaticTable` (server, BAWAAN)** / `DataTable` (AntD, client, hanya bila butuh sortir-filter seketika) · ikon **`@ant-design/icons`** (issue #201) · chart `recharts`. **Tanpa Tailwind, tanpa lembar kelas apa pun sejak issue #203** - gaya ditulis SEBARIS (`style={{...}}`), warnanya `var(--ant-...)` atau `theme.useToken()`, dan nilai warna mentah (hex, `rgb()`, nama warna CSS) tidak ditulis di luar `src/lib/theme/antd-tokens.ts` — dijaga ESLint `sai/warna-token-antd` (issue #204). Rujukan shadcn/Tailwind/CVA di dokumen ini hanya muncul sebagai **catatan sejarah**; `radix-ui` tersisa untuk SATU hal, `Slot` di `FormControl`.
**Dials:** Variance 3/10 (minimal, profesional) · Motion 2/10 (halus) · Density 6/10 (nyaman untuk data, tidak sesak).

---

## Prinsip Inti (khusus app akuntansi ramah-amatir)

> Lima butir ini adalah aturan **akuntansi**, bukan aturan pustaka. Ia bertahan
> melewati shadcn/Tailwind (2024–2026) dan melewati Ant Design; kalau kelak
> pustakanya berganti lagi, bagian inilah yang ikut pindah tanpa satu kata pun
> berubah.

1. **Light-first**, tenang, kontras tinggi. Sidebar gelap sebagai aksen (sesuai app saat ini). Dark mode **sudah aktif** — pilihan Terang / Gelap / Ikut sistem di menu akun dan di layar pra-aplikasi — tetapi **bawaannya tetap terang**: `DEFAULT_THEME` di `src/lib/theme/config.ts` adalah `light`, dan menjadikannya `system` berarti setiap pengguna ber-OS gelap membuka aplikasi keuangan ini dalam mode yang belum ditinjau halaman demi halaman.
2. **Semantik warna uang** — hijau = uang masuk/lunas/positif; merah = uang keluar/jatuh tempo/negatif; biru = brand/aksi netral; amber = menunggu/peringatan. **Jangan pernah mengandalkan warna saja** — selalu sertakan tanda (+/−), label, atau ikon. Ini bukan kesopanan aksesibilitas: satu dari dua belas pembaca laki-laki tidak membedakan merah-hijau, dan yang ia lihat pada kolom "Saldo" adalah dua angka yang sama.
3. **Angka rapi & jujur** — `font-variant-numeric: tabular-nums`, **rata kanan** di tabel, format `id-ID` (mis. `Rp 1.234.567`), nilai negatif merah dengan `(...)` atau tanda minus. Tampilkan **mata uang** eksplisit (IDR/USD/CNY) — sebuah angka tanpa mata uang di aplikasi ekspor adalah angka yang bisa dibaca tujuh belas ribu kali lebih besar dari yang dimaksud.
4. **Nilai yang tidak diketahui ditulis KOSONG atau "—", tak pernah 0.** Dokumen valas tanpa kurs, barang tanpa dasar biaya, umur piutang tanpa tanggal jatuh tempo: nol menyatakan "tidak ada nilai", yang berbeda dari "nilainya belum diketahui" — dan menjumlahkannya sebagai nol menyusutkan total tanpa satu pun tanda di layar. Jumlah baris yang dikecualikan selalu disebutkan sebagai catatan di bawah tabelnya. Aturan ini lahir dari Piutang/Utang & Nilai Persediaan, dan dijaga `tests/money-unknown.test.tsx`.
5. **Ramah amatir** — label bahasa tugas (lihat issue #1), target sentuh ≥ 40px, teks dasar 16px, hindari jargon di permukaan (tooltip untuk istilah akuntansi).
6. **Reuse, jangan fork** — pakai & perluas komponen di `src/components/ui` (button, card, input, badge, dll). Jangan bikin varian baru tanpa alasan.

---

## Color Palette (light-first) - token **Ant Design**, satu lapisan saja

Sampai issue #203 aplikasi ini punya paletnya sendiri: 158 variabel bergaya
shadcn di `src/app/globals.css` (`--primary`, `--muted-foreground`,
`--success-soft`, ...) beserta utility Tailwind yang memakainya (`bg-primary`,
`text-muted-foreground`). **Lapisan itu sudah tidak ada.** Warna kini datang
dari SATU tempat: token `ConfigProvider` Ant Design, ditambah sedikit token
kustom yang lahir dari pengukuran kontras.

- **Sumber angkanya:** `src/lib/theme/antd-tokens.ts`. Di sanalah setiap hex
  ditulis, beserta rasio kontras terhitungnya - dan `tests/money-tokens.test.ts`
  serta `tests/antd-css-var-ssr.test.tsx` menghitung ulang angka itu dari paket
  `antd` yang benar-benar terpasang setiap kali suite berjalan. Tabel warna
  TIDAK disalin ke berkas ini lagi: dua salinan angka kontras adalah dua angka
  yang akan berselisih pada versi AntD berikutnya, dan yang salah adalah yang
  tidak diuji.
- **Cara memakainya:** `style={{ color: "var(--ant-color-text-secondary)" }}`,
  atau `theme.useToken()` bila nilainya memang perlu dihitung. Nama variabel =
  nama token dalam kebab-case berawalan `--ant-`.
- **Identitas mereknya bawaan AntD** (`colorPrimary` `#1677ff`), keputusan epik
  #206. `#1E40AF` lama tidak dikembalikan.

### Peta peran -> token

| Peran | Token |
|-------|-------|
| Latar halaman | `colorBgLayout` |
| Permukaan kartu / tabel | `colorBgContainer` |
| Permukaan melayang (modal, popover) | `colorBgElevated` |
| Teks utama | `colorText` |
| Teks penjelas / label kolom | `colorTextSecondary` |
| Kisi tabel & tepi kartu | `colorBorderSecondary` (#208) |
| Batas kendali (`Input`, `Select`) | `colorBorder` (#208) |
| Garis pemisah dekoratif (`Divider`) | `colorSplit` (#208) |
| Cincin fokus papan ketik | `colorPrimaryBorder` (#187) |
| Tautan & teks merek | `colorLink` / `colorBrandText` (#186) |
| Permukaan gelap permanen (sidebar, panel merek) | `Layout.Sider theme="dark"` (`#001529`) |

### Warna uang & status - token kustom, dan alasannya aritmetika

Anak tangga ke-6 palet AntD (`colorSuccess` `#52c41a`, `colorWarning` `#faad14`,
`colorError` `#ff4d4f`) dipilih AntD untuk **isian dan ikon**, bukan untuk teks
14px. Diukur: 2,27:1 - 1,90:1 - 3,27:1 di tema terang, semuanya gagal 4,5:1.
Karena itu peran TEKS memakai anak tangga yang lebih jauh dari latarnya, diambil
dari palet AntD sendiri (green-8 / red-8 / gold-9 / blue-7):

| Peran | Token |
|-------|-------|
| Uang masuk / saldo positif / lunas | `colorMoneyPositive` |
| Uang keluar / saldo negatif / jatuh tempo | `colorMoneyNegative` |
| Menunggu / sebagian | `colorMoneyPending` |
| Informasional | `colorMoneyInfo` |

Keempatnya juga menjadi warna teks `Tag` (issue #187) dan warna teks galat
formulir. **`colorSuccess`/`colorWarning`/`colorError` bawaan tetap dipakai apa
adanya** untuk isian pekat, ikon berlatar, dan `Progress` - di sana ambangnya
3:1 non-teks.

**Aturan yang tidak berubah sedikit pun:** warna **tidak pernah** penanda
tunggal (badge wajib berteks, angka negatif wajib bertanda minus), dan kolom
uang berwarna memakai token uang di atas - bukan `colorSuccess` bawaan.

### Ambang kontras per ukuran teks

Ambangnya bukan satu angka. WCAG membedakan "teks besar" — dan sebagian besar
teks aplikasi ini justru berada di sisi yang KETAT:

| Yang diwarnai | Ambang | Contoh di app ini |
|---|---|---|
| Teks < 18,66px, atau < 24px bila tidak tebal | **4,5:1** | seluruh isi tabel (`fontSize` 14px), label, teks bantuan, teks `Tag` |
| Teks >= 24px, atau >= 18,66px **bold** | **3:1** | angka besar kartu KPI (`fontSizeHeading*`) |
| Grafis non-teks: ikon, batas kendali, cincin fokus, bilah chart | **3:1** | `colorBorder`, `colorBorderSecondary`, `colorPrimaryBorder` |
| Teks nonaktif & batas kendali nonaktif | dikecualikan | `colorTextDisabled`, `colorBorderDisabled` — memang harus terlihat mati |

Karena baris pertama itulah anak tangga ke-6 palet AntD gagal: sebagai teks 14px
`colorSuccess` 2,27:1 · `colorWarning` 1,90:1 · `colorError` 3,27:1. Ketiganya
akan LOLOS kalau dipakai sebagai isian pekat berlatar putih atau sebagai ikon —
dan di sanalah mereka memang tetap dipakai.

**Ambang ini berlaku juga DI DALAM SVG.** Recharts menyalin warna seri ke label
irisan dan ke baris tooltip, jadi sebuah `fill` yang sah sebagai bilah 3:1
mendarat sebagai TEKS 12px di tempat lain pada grafik yang sama. Karena itu
`dashboard-charts.tsx` mengambil paletnya dari `moneyPalette()` — token teks —
bukan dari `colorSuccess`/`colorError`; dijaga `tests/chart-tokens.test.tsx`.

### Jenjang permukaan: kenapa latar halaman tidak bisa lebih gelap (issue #266)

Keluhan pemilik — aplikasi terbaca "dominan putih-hitam dengan **outline saja**"
— benar dan terukur: latar halaman dan kartu praktis sewarna, sehingga yang
memisahkan wilayah tinggal tepinya.

| Tema | halaman `colorBgLayout` | kartu `colorBgContainer` | melayang `colorBgElevated` | kartu vs halaman | ΔL\* |
|---|---|---|---|---|---|
| terang | `#f5f5f5` | `#ffffff` | `#ffffff` | 1,09:1 | 3,46 |
| gelap | `#000000` | `#141414` | `#1f1f1f` | 1,14:1 | 6,32 |

**Ketiganya tetap bawaan AntD — setelah diukur, bukan karena terlewat.** Sebabnya
dua dinding, dan keduanya dipasang oleh keputusan yang benar:

- **Terang: tepi kartu #208 memaku setiap bidang di atas `#f2f2f2`.**
  `colorBorderSecondary` (`#8c8c8c`) berdiri DI ANTARA kartu putih dan halaman,
  jadi ia harus lolos 3:1 di **kedua** sisinya — dan sisi halaman habis lebih
  dulu. Permukaan tergelap yang masih dilewati: `#f2f2f2` (tepi kartu) ·
  `#e7e7e7` (uang-positif) · `#e1e1e1` (batas kendali). `#f2f2f2` hanya menambah
  ΔL\* 1,05 sambil menghabiskan SELURUH margin ambang 3:1 — bukan tukaran yang
  layak. Anak tangga netral AntD berikutnya (`#f0f0f0` α 0,06 · `#d9d9d9` α 0,15)
  keduanya menabrak: 2,95:1 dan 2,38:1 pada tepi kartu, dan `#d9d9d9` menjatuhkan
  angka hijau ke 3,96:1.
- **Gelap: `colorMoneyInfo` #186 memaku permukaan melayang.** Permukaan gelap
  paling terang yang masih dilewatinya `#212121` — tiga satuan RGB dari
  `colorBgElevated` hari ini. Karena warna itu juga `colorLink`, yang jatuh bukan
  satu angka melainkan setiap tautan. Akibatnya temuan tirai #205 (panel dialog vs
  halaman bertirai, **1,27:1** terukur) **tidak bisa** diperbaiki dari lapisan
  token: menaikkan panel menjatuhkan tautan, dan menggelapkan `colorBgMask` tidak
  melakukan apa-apa karena halaman gelap sudah `#000000`.

**Temuannya, ditulis eksplisit karena berlawanan dengan dugaan:** ada satu susunan
yang melewati semua ambang — latar `#f0f0f0` **bersama** kisi naik ke grey-4 dan
kendali ke grey-5 (tak satu pun pasangan turun; kisi 3,08 → 3,47). Ia tetap
ditolak, karena ia **menggelapkan setiap garis** demi menambah ΔL\* 1,74 pada
bidangnya — arah yang berlawanan dengan keluhannya. #208 menaikkan kisi dari
1,05:1 (bawaan AntD) menjadi 3,08:1, hampir tiga kali lipat; itu SENGAJA dan
tidak boleh dibalik, tetapi konsekuensinya baru terbaca sekarang: **garis setegas
itulah yang paling menonjol di layar, dan garis itu juga yang mengurung setiap
bidang di dalam pita 3,5% antara `#ffffff` dan `#f2f2f2`.** #208 dan #266
terhubung lewat satu angka dan tidak bisa sama-sama berada di ujung "tenang"-nya.

### Jalan yang diambil: jenjangnya dikerjakan di PERENDER (issue #266)

Karena lapisan token buntu, jenjangnya dibuat di dalam bidang yang sudah ada —
**berongkos kontras NOL menurut konstruksi**, bukan menurut pengukuran ulang.

| Yang ditambahkan | Di mana | Nilai |
|---|---|---|
| Bayangan kartu | `ui/card.tsx` | `--ant-box-shadow-tertiary` |
| Nada kepala tabel | `ui/table.tsx` **dan** `components.Table.headerBg` | terang `#f5f5f5` · gelap `#1f1f1f` |

- **Nadanya bukan warna baru.** Terang `#f5f5f5` = `colorBgLayout`; gelap
  `#1f1f1f` = `colorBgElevated`. Keduanya anggota `SURFACES`, jadi setiap angka
  "min" di `antd-tokens.ts` memang sudah diambil di atasnya. Terukur di atas
  nada: judul kolom & tautan sortir **6,76 / 7,65** · hover **15,39 / 12,18** ·
  penanda urut **3,62 / 3,89** · kisi **3,08 / 3,05** (terang/gelap).
- **Arahnya dipatok #208, bukan dipilih dengan mata.** Terang tidak punya apa pun
  di atas `#ffffff` sehingga harus turun, dan turunnya berhenti di `#f2f2f2`.
  Gelap boleh naik, tetapi hanya sampai `#202020` — `#1f1f1f` satu satuan di
  bawah dinding itu, yaitu nada paling terang yang boleh dipakai sama sekali.
- **`Table.headerBg` sendirian TIDAK cukup**: ia hanya mengenai `DataTable` (20
  dari 66 tabel); `StaticTable` menggambar sel judulnya sendiri. Karena itu
  nadanya berdiri sebagai alias GLOBAL `colorTableHeadBg`
  (`var(--ant-color-table-head-bg)`) — variabel token KOMPONEN tidak ada di
  dokumen bila komponennya tidak dirender — dan `AntdProvider` mengoper nilai
  yang SAMA ke keduanya. `headerColor` ikut disamakan ke `colorTextSecondary`.
- **Sel judul lengket memakai latar yang sama** (#229). Nada di jalur biasa
  dengan bawaan lengket yang tertinggal = kepala yang berganti warna saat
  menempel, dan hanya terlihat oleh orang yang sedang menggulung matriks izin.
- **Penanda urut nonaktif (#265) naik dari `colorTextQuaternary` ke
  `colorBorder`.** Kuartener terukur 1,83:1 di atas putih — di bawah ambang 3:1
  untuk grafis non-teks, padahal ia satu-satunya isyarat "kolom ini bisa
  diurutkan".
- **Pita baris SENGAJA tidak diambil** (butir 3 issue #266): `rowStyle` sudah
  dipakai /approvals untuk menandai keputusan yang belum dibaca, dan pita bawaan
  akan mengubah "baris ini baru" menjadi "baris ini genap".
- **Tema gelap, jujur:** algoritma AntD membalik bayangan menjadi CAHAYA
  (`boxShadowTertiary` gelap = `rgba(255,255,255,0.01)`), jadi bayangan kartu
  adalah separuh TERANG dari jawaban ini. Di tema gelap yang memisahkan kartu
  dari halaman tetap tepinya (3,05:1 sejak #208) plus nada kepala di dalamnya.

Semua angka di atas dihitung ulang setiap kali suite berjalan —
`tests/antd-tokens.test.ts` → "jenjang perender (#266)".

### Token AntD di server component: `var(--ant-…)`, di mana pun (issue #227)

**Server component boleh memakai warna token, dan tidak perlu menyeberang jadi client untuk itu.** `AntdProvider` memberi `cssVar` sebuah kunci tetap (`ANTD_CSS_VAR_KEY` di `src/lib/theme/antd-tokens.ts`) dan root layout memasang kunci itu sebagai kelas di `<html>`, jadi blok `.sai-tokens{--ant-…}` berdiri di `<head>` pada HTML pertama dan diwarisi seluruh dokumen — juga oleh pohon yang tidak punya satu pun komponen AntD di atasnya.

- **Bentuknya:** `style={{ color: "var(--ant-color-text-secondary)" }}`. Nama variabel = nama token dalam kebab-case, berawalan `--ant-` (`colorMoneyPositive` → `--ant-color-money-positive`) — termasuk token kustom #186/#207/#208. Nilai berjarak sudah membawa satuannya (`--ant-padding` = `16px`).
- **`theme.useToken()` hanya untuk yang memang butuh NILAINYA** (menghitung, membandingkan, meneruskan ke pustaka chart). Memanggilnya demi warna saja berarti menaikkan sebuah berkas ke `"use client"` tanpa imbalan — dan `tests/rsc-boundary.test.ts` mengunci angkanya.
- **Pergantian tema tetap hidup:** kedua tema memakai selektor yang sama, jadi toggle menimpa isi bloknya alih-alih menumpuk blok kedua. Server component ikut berganti warna tanpa dirender ulang.
- Aturan lama tetap berlaku di atasnya: warna **tidak pernah** penanda tunggal, dan ambang kontrasnya tidak berubah. Buktinya SSR ada di `tests/antd-css-var-ssr.test.tsx`.

*Dark mode:* algoritma gelap AntD, dipilih `AntdProvider` dari cookie yang dibaca root layout, jadi blok token yang benar sudah ikut pada HTML pertama tanpa kedipan sebelum hydrate. Semantik warna dan ambang kontrasnya tidak berubah antar-tema; nilai gelapnya berdiri di sebelah nilai terangnya di `antd-tokens.ts`.

Satu pengecualian yang tersisa: pilihan **"ikut sistem"**. Preferensi OS tak terlihat dari server, jadi HTML pertamanya selalu membawa token terang; yang memperbaikinya sebelum cat pertama adalah skrip sinkron di `<head>` yang memasang kelas `.dark`, dan dua variabel di `globals.css` yang menempel pada kelas itu (latar halaman + warna teks). Sisa tokennya baru benar setelah hydrate - dicatat sebagai kekurangan yang diketahui, bukan sebagai desain.

**Jebakan "dua bidang sewarna" TETAP berlaku, dan diukur ulang di #205 ia lebih buruk dari yang tertulis di sini sebelumnya:** di tema gelap sidebar `#001529` dan `colorBgContainer` `#141414` berkontras **1,00:1** — bukan "~1,4:1" — yaitu dua bidang yang secara luminansi tidak bisa dibedakan sama sekali; `colorBgLayout` gelap `#000000` berada di 1,14:1 dari sider. Karena itu **batas antar-bidang yang sewarna wajib punya `border`, dan border itu wajib `colorBorderSecondary`** (3:1, dinaikkan di #208) — **bukan `colorSplit`**, yang #208 sengaja tahan di bawah 3:1 sebagai pemisah dekoratif dan yang terukur hanya 2,67:1 di atas sider. Ketiga shell gelap (`sidebar.tsx`, `auth-shell.tsx`, `platform-shell.tsx`) dikunci pada token yang benar oleh `tests/antd-tokens.test.ts`. Kartu berdiri di atas `colorBgLayout`, bukan di atas isian abu-abu lain. Tinjau UI baru di KEDUA tema sebelum menyerahkannya.

**Permukaan gelap permanen memakai anak tangga GELAP di kedua tema.** Sider, panel merek layar masuk, dan menu konsol penyewa tidak ikut berganti warna, jadi apa pun yang menempel padanya harus diambil dari tabel gelap (`SIDER_BG_DARK`, `BORDER_TOKENS_DARK`, `PRIMARY_BUTTON_DARK`) — bukan dari `…Tokens(resolved)`. Kegagalan yang lahir dari melanggar ini terukur di #205: token `Menu.darkItemSelectedBg` AntD, meski namanya berawalan "dark", mengambil `colorPrimary` dari tema yang SEDANG berlaku, sehingga di tema terang label butir menu terpilih berdiri putih di atas `#1677ff` = **4,10:1** — kegagalan yang sama persis yang membuat `Button` diberi token sendiri di #187, kali ini pada label navigasi utama aplikasi, di tema bawaan.

---

## Typography

- **UI / Heading & Body:** **Inter** lewat `next/font`, dipasang sebagai variabel di `<html>`. Bukan monospace untuk heading.
- **Angka/nominal:** `font-variant-numeric: tabular-nums` (Inter mendukung) agar digit sejajar di tabel & laporan. `Money`/`MoneyCell` sudah membawanya; jangan format angka sendiri.
- **Skala dasar 16px**, dan itu **aturan app ini, bukan bawaan AntD** — `fontSize` AntD adalah 14px. Yang menjaganya adalah `globals.css`, dan yang mengancamnya adalah elemen `.ant-app`: `<App>` di `AntdProvider` karena itu dipasang `component={false}` supaya ia merender `Fragment` alih-alih `<div>` bergaya. Menukarnya dengan `component="div"` demi menghilangkan satu peringatan dev akan menurunkan teks dasar SELURUH aplikasi ke 14px dan mengganti Inter dengan tumpukan font sistem AntD — tanpa satu pun berkas halaman berubah.
- Hierarki lewat token, bukan angka yang diketik: `--ant-font-size-heading-1` … `-5` = 38 · 30 · 24 · 20 · 16px, isi 14px (`--ant-font-size`), keterangan 12px (`--ant-font-size-sm`). **Langit-langit app internal adalah `fontSizeHeading1`** dan hanya `PageHeader` yang boleh mencapainya — lihat §Pemasaran vs App.
- Teks < 14px dilarang untuk data. 12px hanya untuk keterangan yang mengulang informasi yang sudah ada di tempat lain.

---

## Jarak, radius, bayangan — token AntD, tidak ada lapisan kedua

Sampai #203 ada tabel `--space-*` dan `--shadow-*` di berkas ini beserta
utility Tailwind yang memakainya. **Lapisan itu sudah tidak ada**, dan tidak
digantikan oleh tabel baru: skala AntD sudah persis skala yang dipakai, dan dua
skala berdampingan hanya melahirkan dua jawaban untuk "berapa jarak antar-kartu".

Nilainya berjarak 4px (`sizeUnit`/`sizeStep`) dan **variabelnya sudah membawa
satuannya** (`--ant-padding` = `16px`, jadi ditulis apa adanya, bukan `${}px`):

| Peran | Token | Nilai |
|---|---|---|
| Celah rapat (ikon–teks) | `--ant-margin-xxs` / `--ant-padding-xxs` | 4px |
| Inline, antar-aksi ikon | `--ant-margin-xs` | 8px |
| Padding kendali & sel tabel (vertikal) | `--ant-padding-sm` | 12px |
| Padding standar, gap grid | `--ant-padding` / `--ant-margin` | 16px |
| Padding kartu, jarak antar-bagian (Density 6/10) | `--ant-padding-lg` / `--ant-margin-lg` | 24px |
| Gap besar | `--ant-margin-xl` | 32px |
| Jarak antar-seksi besar | `--ant-margin-xxl` | 48px |

Radius: `--ant-border-radius` 6px (kendali & kartu) · `--ant-border-radius-lg`
8px (permukaan besar) · `--ant-border-radius-sm` 4px (balok kerangka, tag).
Angka 8/12/16px yang dulu tertulis di sini adalah skala shadcn dan **sudah
tidak berlaku**.

Bayangan: `--ant-box-shadow-tertiary` (lift halus) · `--ant-box-shadow-card` ·
`--ant-box-shadow` (melayang: modal, dropdown, popover). Jangan menulis
`box-shadow` sendiri — nilainya berlapis tiga dan disetel per algoritma tema.

**Tinggi kendali datang dari SATU token:** `controlHeight: 40` di
`AntdProvider` (target sentuh minimum, naik dari 32px bawaan AntD). Seluruh
keluarga kendali — Button, Input, Select, DatePicker — naik bersamanya, dan
itu juga berarti `size="sm"` adalah TURUNAN (`controlHeight × 0,75` = 30px),
sehingga ia tetap bukan target sentuh utama.

---

## Kepala Halaman & Breadcrumb (wajib)

Semua halaman dashboard memakai **`PageHeader`** (`src/components/ui/page-header.tsx`) — jangan menulis `<h1>` atau memanggil `<Breadcrumb>` sendiri (dijaga `tests/page-header.test.ts`).

- **Halaman tingkat-1** (item menu samping): tanpa `breadcrumbs`; `title` = label menunya persis (boleh membawa jumlah, mis. "Pelanggan (12)"); tombol utama lewat `actions`.
- **Halaman di bawahnya** (baru / ubah / rincian): `breadcrumbs` dimulai dari **label menu induk** — kata yang sama dengan menu samping (mis. "Tagihan Penjualan", bukan "Invoices") — dan item terakhir (tanpa `href`) = halaman ini.
- Badge status di samping judul lewat `badge`; kalimat penjelas lewat `description`.

## Orientasi Perusahaan (chrome, wajib — issue #104)

Sejak buku besar tiap PT hidup di basis datanya sendiri, satu pertanyaan berdiri di atas semua pertanyaan tampilan lain: **buku siapa yang sedang saya tulis?** Mencatat ke PT yang salah tidak berbunyi saat terjadi — ia muncul berbulan-bulan kemudian sebagai neraca yang tidak cocok.

- **Nama perusahaan aktif selalu terlihat di top bar** (`CompanyIndicator`), di semua ukuran layar, tanpa perlu membuka menu apa pun. Namanya dibawa **sesi** (`session.user.companyName`), bukan diambil lewat permintaan — supaya ia hadir pada render pertama, bukan berkedip masuk setelah orang mulai mengetik.
- Penanda itu **orientasi, bukan kendali**. Berganti perusahaan tinggal di menu avatar, dan hanya muncul bila pengguna memang memegang lebih dari satu PT.
- Di layar sempit yang boleh menyempit adalah **namanya** (truncate + `title`), bukan target sentuh aksi di sebelah kanan.
- **Identitas yang dicetak** (kop faktur/kontrak/surat jalan) diambil berurutan: setting perusahaan → nama di registry kendali → konstanta. Jangan pernah memundurkannya ke konstanta lebih awal: isinya nama pemasang pertama, dan mencetaknya di dokumen PT lain menghasilkan surat yang terlihat sah padahal salah badan hukum.
- Layar pra-aplikasi (`/select-company`, `/setup-required`, `/feature-inactive`) **wajib punya jalan keluar** — tombol keluar atau tautan kembali. Layar tanpa kendali apa pun adalah jalan buntu bagi orang yang aksesnya baru dicabut.

## Pola Komponen (khusus domain)
- **Kartu KPI dashboard**: judul bahasa awam + angka besar tabular + delta berwarna (hijau/merah) dengan tanda +/−; sub-teks periode.
- **Tabel transaksi**: kolom nominal rata-kanan + tabular-nums; kolom status pakai **badge** (Lunas=hijau, Sebagian=amber, Belum/Jatuh Tempo=merah) — badge selalu berteks, bukan warna saja.
- **Form**: label terlihat (bukan placeholder), validasi inline dekat field, helper text, progressive disclosure ("Detail lengkap"). Tombol primer = aksi simpan; destruktif = merah + konfirmasi. **Implementasi:** `react-hook-form` + `zodResolver` dengan pola `Form` di `src/components/ui/form.tsx` (RHF sebagai mesin, `Form.Item` AntD sebagai kulit - lihat "Konvensi Form" di bawah), bukan `useState` manual.
- **Empty state**: 1 kalimat + tombol aksi ("Belum ada faktur. Buat tagihan pertama →").
- **Uang/mata uang**: selalu tampilkan kode mata uang; konversi/kurs ditampilkan bila valas (konteks ekspor CNY/USD).

## Pusat Laporan: dialog parameter

Laporan **tidak dibuka langsung dari kartunya**. Menekan kartu membuka dialog parameter (`components/reports/report-launch-dialog.tsx`) yang menanyakan periode/saringan/kolom lebih dulu, lalu menawarkan tiga jalan keluar: **Pratinjau** (halaman laporan), **Unduh PDF**, **Unduh Excel**. Alasannya bukan gaya: membuka dulu dengan periode bawaan berarti menghitung dan merender laporan yang salah, lalu menghitungnya lagi setelah penyaring di atas tabel diubah.

- **Kendali dirender dari katalog, bukan ditulis per laporan.** `paramKind`, `filters`, `columns`, dan `payloadKind` di `lib/report-catalog.ts` adalah satu-satunya sumber bagi dialog, halaman, dan berkas ekspornya.
- **`paramKind` menyatakan parameter yang BENAR-BENAR dibaca halaman tujuan** — bukan bentuk periode yang secara konsep cocok. Kendali yang isian­nya diabaikan diam-diam adalah kendali yang berbohong (tiga entri katalog pernah begitu).
- **Tombol unduh hanya muncul bila laporannya punya `payloadKind`.** Entri yang menunjuk halaman modul interaktif menawarkan "Buka" saja, dengan kalimat yang mengatakan kenapa.
- **Pemilihan kolom hanya untuk laporan bertipe daftar.** Susunan Laba/Rugi, Neraca, dan Arus Kas ditentukan standar akuntansi; centang kolom di sana adalah kendali yang tak mengubah apa pun. Kolom identitas baris selalu ikut (`fixed`), dan pilihan pengguna hanya boleh MENGURANGI kolom — tak pernah memunculkan kolom yang laporannya memang tak punya isinya.
- **Satu penentu kolom untuk tiga permukaan** (`stockMovementColumns`, `partyRecapColumns`, `agingColumns`, `stockValueColumns`, `cashBankColumns` di `lib/statement-layout.ts`): layar, PDF, dan lembar sebar. Pratinjau yang memperlihatkan kolom berbeda dari berkasnya adalah laporan yang tidak dipercaya dua kali.
- **Kartu mendarat di LAPORANNYA, bukan di halaman kerja atau persimpangan.** Halaman modul (`/inventory`, `/finance`) terpaginasi dan disaring untuk bekerja; sepuluh baris pertama bukan laporan, dan totalnya akan salah. Hub (`/budget`) menunda laporannya satu klik lagi. Laporan yang tidak punya view sendiri mendapat halamannya di bawah `/reports`, dengan izin mengikuti DATANYA (`inventory.read`, `cash.read`) — sebuah laporan tidak melonggarkan siapa yang boleh melihat isinya.
- **Nilai yang tidak diketahui ditulis kosong atau "—", tak pernah 0** — Prinsip Inti #4, dan di Pusat Laporan ia yang paling sering diuji: dokumen valas tanpa kurs dan barang tanpa dasar biaya masuk ke hampir setiap laporan nilai persediaan.

---

## Konvensi Form (issue #53)

Form ditulis dengan **`react-hook-form` + `zodResolver`** memakai pola **`Form`** (`src/components/ui/form.tsx`). Contoh acuan: `src/app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/new/customer-form.tsx` (master sederhana) dan `src/components/shared/payment-form.tsx` (transaksi valas).

1. **Satu skema zod, dua sisi.** Skema yang divalidasi form **wajib** skema yang sama dipakai route handler — **diimpor, bukan disalin**. Bila server menambah field (mis. `invoiceId` dari URL), pisahkan field bersama sebagai objek yang dipakai ulang (contoh: `paymentFormFields` di `lib/validations/payment.ts`, dipakai `paymentFormSchema` client dan `invoicePaymentSchema`/`contractPaymentSchema` server). Client & server tidak boleh bisa menyimpang diam-diam.
2. **Pesan error lewat KUNCI kamus, ramah awam.** Skema tidak menulis kalimat, melainkan kunci bertipe: `z.string().min(1, vmsg("validation.dateRequired"))` (`@/lib/i18n/validation`). Alasannya: pesan zod dipanggang saat modul dimuat sehingga tidak bisa ikut berganti bahasa — sedangkan mengubahnya menjadi pabrik `make…Schema(t)` melanggar aturan 1, dan `z.setErrorMap()` global membocorkan bahasa antar-permintaan yang berjalan bersamaan. Kalimatnya karena itu disusun di **batas tampilan**: `FormMessage` di client, `translateFieldErrors()` di route handler, `humanizeFieldMessage()` di jalur pesan API. Kunci salah ketik ditolak `tsc` (tipe `ValidationKey`); `tests/i18n-validation.test.tsx` menolak kalimat yang tertinggal di dalam skema. Pesan yang membawa nominal memakai `vissue("…", { … })` — kunci + nilainya ikut sebagai `params` zod, bukan sandi yang diselundupkan ke dalam teks pesan.

   Pola baku jawaban 400 di route handler (acuan: `src/app/api/invoices/route.ts`, `src/app/api/{invoices,contracts}/[id]/payments/route.ts`):

   ```ts
   if (!parsed.success) {
     const { dictionary, t } = await getRequestI18n();               // @/lib/i18n/server
     return NextResponse.json(
       {
         error: t("validation.invalidInput"),
         details: translateFieldErrors(parsed.error, dictionary),    // @/lib/i18n/validation
       },
       { status: 400 }
     );
   }
   ```
3. **Struktur field:** `FormField` → `FormItem` → `FormLabel` + `FormControl` + `FormDescription?` + `FormMessage`. Pautan label–input–deskripsi–error (`aria-invalid`/`aria-describedby`/`role="alert"`) terpasang otomatis. Jangan pasang `aria-*` manual.

   **Keempatnya harus berada di dalam `FormItem` yang sama, dan `FormItem` di dalam `FormField` — bukan sebaliknya (issue #262).** `aria-describedby` hanya boleh menyebut id yang simpulnya benar-benar dirender, dan yang memutuskannya adalah `FormItem`, saat render, dari anak yang dilihatnya (fragment, array, dan elemen HTML biasa ikut ditelusuri karena ketiganya pasti merender isinya). Yang tersembunyi di balik prop `render` sebuah `FormField` **di dalam** `FormItem` tidak terlihat dari sana — bentuk itu diam-diam kehilangan pautan deskripsinya. Menambal dengan `FormDescription` kosong ditolak: ia menambah simpul yang dibacakan tanpa isi. Kalau sebuah panel memang tidak punya isian (mis. "kata sandi sudah tersimpan"), tulis dua bentuk `FormItem` yang berbeda, jangan satu bentuk yang setengah ada.
4. **Isian di dalam `FormControl` harus telanjang** — `TextInput`/`SelectField`/`MoneyInput`, bukan `Input`/`Select` komposit (yang membawa label/error sendiri). `FormControl` (Radix `Slot`) meneruskan atribut ke anak tunggal, jadi anaknya harus satu elemen kontrol.

   **`{...field}` tidak berlaku sama untuk ketiga isian pilihan.** `SelectField` menerimanya utuh (`name` ikut, dan nilainya ikut `new FormData(form)`); `SearchableSelect`/`ServerSearchableSelect` **menolak `name` di tipe** — nilainya dibaca lewat `value`/`onChange`, dan tidak pernah ikut `FormData`. Tabel lengkapnya beserta alasannya: §Primitif Wajib, "Keluarga isian pilihan".
5. **Nominal pakai `MoneyInput`** — tampil `1.234.567`, payload menerima angka bersih (`1234567`). Desimal 0 untuk IDR, 2 untuk valas.
6. **Progressive disclosure di tempat yang tepat:** field yang bersyarat (mis. kurs untuk valas) hanya dirender saat relevan, dan skema hanya menuntutnya di kondisi itu (`superRefine`).
7. **Server tetap penjaga terakhir.** Kegagalan validasi server dipetakan ke `form.setError` (field bila ada `fieldErrors`, atau `root`). Field yang TIDAK punya isian di layar (mis. `invoiceId` yang disuntik server) naik menjadi galat formulir, bukan ditanam di field yang tak pernah dilihat siapa pun — acuan `applyPaymentServerErrors` di `payment-form.tsx`.

### Ant Design sebagai KULIT (keputusan issue #192)

`FormItem` berdiri di atas **`Form.Item` AntD, yang dipakai TANPA `Form` AntD** — tanpa `name`, tanpa `rules`, tanpa `validateMessages`. Mesin formulirnya tetap react-hook-form + zod; AntD hanya memberi tata letak label, jarak, dan keadaan error. **`Form` AntD dan `Form.useForm` tidak boleh dipakai di halaman mana pun** — memakainya berarti aturan validasi hidup di dua tempat dan aturan 1 di atas batal. Dijaga `tests/ui-form-antd.test.tsx`.

Tiga akibat nyata yang perlu diketahui sebelum menulis form baru:

- **Label ditulis tetap sebagai anak** (`<FormLabel required>`), lalu **diangkat** `FormItem` menjadi prop `label` `Form.Item` — karena di AntD label adalah prop, bukan komponen. Pengangkatan hanya menjangkau **anak langsung**; label yang ditulis di dalam `FormField` tetap dirender sebagai `<label htmlFor>` biasa di slot kendali. Keduanya benar; yang berbeda hanya letaknya.
- **Slot `help` AntD sengaja tidak dipakai.** Tanpa `name`, `Form.Item` baru merender daftar galatnya setelah sebuah `useLayoutEffect` — di render server ia hilang sama sekali. Pesan validasi karena itu tetap `FormMessage` (`role="alert"`, `text-destructive` yang lolos AA; `colorError` AntD hanya 3,27:1 sebagai teks 14px).
- **Pautan ARIA tetap milik `FormControl`.** AntD hanya menyuntikkan `aria-*` di cabang ber-`name`, yang tidak kita tempuh. Sejak #192 `FormControl` juga memasang **`aria-required`**, jadi isian wajib tidak lagi hanya bertanda `*`.

Tanda wajib `*` tetap digambar aplikasi ini (di BELAKANG teks label, sama seperti `Input`/`Select` komposit), bukan tanda bintang AntD yang digambar `::before` di depan label — dua konvensi di layar yang sama terbaca sebagai cacat.

---

## Motion (Subtle)
- Transisi state 150–250ms `ease`. Hover halus (tanpa menggeser layout). Hormati `prefers-reduced-motion`.
- Hindari animasi dekoratif; animasi hanya untuk memberi makna (loading, perpindahan, feedback).

---

## Ikon (issue #201)

**Satu paket, satu bahasa bentuk: `@ant-design/icons`.** Dua set ikon berdampingan
di satu layar terbaca sebagai cacat sebelum terbaca sebagai gaya — lucide bergaris
2px seragam, AntD campuran outlined/filled/two-tone. `lucide-react` diganti
seluruhnya di issue #201; **jangan memasangnya kembali**, dan jangan menambah set
ikon ketiga (emoji tetap terlarang).

Varian yang dipakai adalah **`…Outlined`**. `…Filled` dan `…TwoTone` hanya boleh
dipakai kalau memang ada alasan yang ditulis: isian pekat di antara ikon bergaris
akan menarik mata ke tempat yang tidak penting.

### Ukuran = `font-size`. Selalu. Tidak pernah kelas kotak.

SVG di dalam ikon AntD berukuran `1em`, dan pembungkusnya `<span>` — jadi:

| | |
|---|---|
| **Bawaan (mayoritas)** | **Jangan sebut ukuran.** Ikonnya mengikuti ukuran teks di sebelahnya: di dalam `Button`, `Menu`, `Tag`, atau paragraf, ia otomatis benar. |
| **Harus beda dari teksnya** (ikon empty state 48px, ikon kepala callout 20px) | `style={{ fontSize: 20 }}` — sekali, di tempat itu. |
| **JANGAN** | prop `size={16}`, atau `width`/`height` sebaris. |

Dua alasan larangan itu, dan keduanya diam:
- Ukuran KOTAK (dulu `h-4 w-4`, kini `width`/`height` sebaris) mengenai **span**-nya,
  bukan `<svg width="1em">` di dalamnya: ukurannya terpasang, ikonnya tidak berubah -
  perubahan yang terlihat berhasil di diff dan tidak berpengaruh apa pun di layar.
- `size={16}` **lolos `tsc`**: props ikon AntD turun dari `React.HTMLProps<HTMLSpanElement>`,
  yang memang punya `size` (atribut HTML `<input>`/`<select>`). Ia mendarat sebagai
  atribut `size="16"` di `<span>` dan tidak mengatur apa pun.

Warna ikut jalur yang sama: `style={{ color: "var(--ant-color-text-secondary)" }}`,
bukan prop `color` - dan ambangnya tetap 3:1 (ikon = grafis non-teks), dengan aturan
**warna tak pernah penanda tunggal**.

### Impor ikon SELALU bernama — `import { XOutlined } from "@ant-design/icons"`

Bukan gaya, melainkan syarat supaya aplikasi ini bisa di-build. Barrel paket itu
memanggil `createContext` di tingkat modul tanpa `"use client"`, dan build React
untuk server component tidak punya `createContext` — satu server component yang
menyentuh barrel-nya menjatuhkan seluruh `next build` dengan galat yang menunjuk
halaman acak (`Failed to collect page data for /setup-required`). `next.config.ts`
karena itu menulis ulang setiap impor **bernama** menjadi jalur dalam paket,
sehingga barrel-nya tak pernah dimuat; ikonnya sendiri tetap aman sebagai daun
client. Penulisan ulang itu hanya mengenali `{ … }`:

- ✅ `import { PlusOutlined, SaveOutlined } from "@ant-design/icons";`
- ❌ `import Icon from "@ant-design/icons";` · ❌ `import * as Icons from "@ant-design/icons";`
- ❌ `IconProvider` / `getTwoToneColor` / `createFromIconfontCN` — bukan ikon, tidak
  punya berkasnya sendiri, dan lolos `tsc` sebelum menggagalkan build.

`tests/icon-rsc-boundary.test.ts` menolak ketiga bentuk itu; alasan lengkapnya di
komentar `modularizeImports` pada `next.config.ts`.

### Ikon dekoratif tetap `aria-hidden`

Ikon AntD merender `<span role="img" aria-label="…">` — **ia dibacakan pembaca layar
secara bawaan**, berbeda dari `<svg>` lucide yang bisu. Setiap ikon yang hanya
mengulang teks di sebelahnya karena itu **wajib** `aria-hidden="true"`; `aria-hidden`
diteruskan ke span dan menang atas `aria-label` bawaan. Ikon yang berdiri SENDIRI
sebagai satu-satunya isi tombol tidak diberi `aria-hidden` melainkan tombolnya yang
diberi `aria-label`. Tidak ada tes yang gagal kalau ini terlewat — yang terjadi hanya
menu yang dibacakan dua kali.

---

## Pemasaran vs App: batas dua dunia (issue #245)

Aplikasi ini punya **dua permukaan yang tidak boleh saling meniru**: halaman pendaratan publik `/` (dibaca orang yang belum punya akun) dan app internal (dikerjakan orang yang sudah masuk delapan jam sehari). Sampai epik #206, batas itu dijaga sebuah **kebetulan mekanis** - dua dunia memakai kelas Tailwind yang kelihatan berbeda, jadi menyalin gaya pemasaran ke halaman internal sudah terasa janggal saat menulisnya. Kebetulan itu ikut hilang bersama Tailwind di #203. Setelah keduanya berdiri di atas token AntD yang sama, kejanggalan itu hilang: `fontSize: "var(--ant-font-size-heading-1)"` di halaman piutang dan di hero pendaratan terlihat persis sama.

Karena itu batasnya kini dinyatakan **dalam token, dan dijaga tes** (`tests/landing-boundary.test.ts`) — bukan sebagai satu butir larangan.

### Yang membuat sebuah halaman "pemasaran" — empat dimensi

| Dimensi | Pendaratan `/` | App internal |
|---|---|---|
| **Skala hero** | satu `<h1>` `--sai-landing-font-size-hero`: 30px → **≈53px** di ≥576px, yaitu `fontSizeHeading1 × 1,4` | langit-langitnya `fontSizeHeading1` (38px) lewat `PageHeader`; tidak ada teks yang melampauinya |
| **Bobot CTA** | aksi yang SAMA diulang tiga kali (hero, tiap kartu paket, penutup), `Button size="lg"`, primer + garis berpasangan, melebar penuh di layar sempit | aksi utama muncul **sekali**, di `PageHeader.actions` |
| **Irama antar-seksi** | `--sai-landing-rhythm` 64px → 96px | Density 6/10: 24px (`--ant-margin-lg`) antar-bagian |
| **Lebar maksimum** | kolom baca 42rem, seksi 72rem, **di tengah** | lebar penuh area kerja — tabel 12 kolom tidak dipotong demi ukuran baca |

### Pendaratan BOLEH punya token sendiri — sebagai turunan, dan berpagar

Keputusannya **ya**, karena alternatifnya lebih buruk: tanpa token, satu-satunya jalan menuju hero 53px adalah angka yang diketik langsung di sebuah `style`, dan angka seperti itu bisa disalin ke mana saja tanpa meninggalkan jejak yang bisa dicari siapa pun. Dua syarat yang membuat izin ini tidak berkembang menjadi paletnya sendiri:

1. **Setiap nilai turunan token AntD** — `calc()` di atas `--ant-font-size-*`, `--ant-margin-*`, `--ant-padding-*`. Skala tipografi app bergeser ⇒ skala pemasaran ikut bergeser; ia tidak bisa menyimpang menjadi tipografi kedua. Yang bukan turunan hanya **tiga lebar baca** (72/48/42rem) dan bobot/tracking display, karena app internal memang tidak punya token untuk "kolom baca" — ia tidak pernah membutuhkannya.
2. **Deklarasinya terkurung di `[data-landing]`**, bukan `:root`. Blok itu (`src/components/landing/landing-scale.ts`, dipasang `LandingShell`) hanya ikut ke dokumen yang merender komponen pendaratan. Menyalin `var(--sai-landing-font-size-hero)` ke halaman internal karena itu **tidak menghasilkan hero** — ia menghasilkan properti yang tidak pernah teratasi, dan teksnya diam-diam mewarisi ukuran induknya.

### Penjaganya (`tests/landing-boundary.test.ts`)

- **App internal tidak mengimpor apa pun dari `components/landing/**`.** Pintu masuknya satu: `src/app/page.tsx`. Menambah pintu kedua = satu baris di `PINTU_MASUK` yang terlihat di diff.
- **Sebaliknya juga:** berkas pendaratan hanya boleh mengimpor `@/components/ui`, `@/lib`, dan sesama berkas pendaratan. Halaman ini dibaca tanpa sesi; setiap impor ke app internal adalah jalan bagi kode ber-`auth()`/ber-Prisma ikut ke permukaan publik.
- **`--sai-landing-` dan `data-landing` tidak boleh muncul di satu berkas pun di luar direktori itu**, dan akarnya dipasang tepat satu berkas (`landing-shell.tsx`).
- **Blok skalanya tidak boleh dideklarasikan pada selektor global** (`:root`/`html`/`body`/`*`) — justru pengurungan itulah yang membuat batas ini mekanisme, bukan imbauan.

Akibatnya, menyalin bentuk pemasaran ke halaman internal berhenti menjadi "kelas yang tak ada yang memeriksa" dan menjadi **impor yang ditolak penjaga**. Acuan halaman internal yang paling dekat dengan godaan itu: `app/(tenant)/platform/billing/plans/page.tsx` — satu-satunya layar internal yang memajang daftar harga, dan yang sengaja tidak punya hero, tidak punya kartu "paling populer", serta ber-CTA menyebut tindakannya ("Pilih paket ini"), bukan "Mulai sekarang".

---

## Anti-Patterns (JANGAN)
- ❌ Emoji sebagai ikon → pakai `@ant-design/icons`.
- ❌ Dua paket ikon di satu layar; ❌ prop `size`/`width`/`height` pada ikon → ukurannya `style={{ fontSize }}`, lihat §Ikon. Dijaga `tests/design-system-primitives.test.ts`.
- ❌ `className` di mana pun (satu pengecualian: `<html>` di `app/layout.tsx`) → tidak ada lembar gaya yang memaknainya sejak #203, jadi kelasnya tidak GAGAL — ia hanya berhenti berlaku.
- ❌ Nilai warna mentah (hex, `rgb()`, nama warna CSS) di luar `lib/theme/antd-tokens.ts` → ditolak ESLint `sai/warna-token-antd`.
- ❌ Warna sebagai satu-satunya penanda status/nominal → selalu ada tanda/teks/ikon.
- ❌ Angka rata-kiri / tanpa tabular-nums di tabel keuangan; ❌ **0 untuk nilai yang tidak diketahui** → kosong atau "—", lihat Prinsip Inti #4.
- ❌ Placeholder sebagai pengganti label.
- ❌ Lebih dari satu tombol berisi penuh terlihat sekaligus di satu layar (**kecuali pendaratan `/`**, yang memang mengulang SATU ajakan — §Aksi utama per layar → "Pendaratan `/` DIKECUALIKAN"); ❌ menyeragamkannya dengan menurunkan SEMUA tombol jadi sekunder — itu menukar satu hierarki rata dengan hierarki rata yang lain. Lihat §Aksi utama per layar.
- ❌ Teks < 14px untuk data penting; kontras di bawah ambang §Ambang kontras per ukuran teks.
- ❌ Fokus keyboard tak terlihat; hover yang menggeser layout.
- ❌ Dark mode dipaksakan sebagai default; gaya "landing/marketing" (hero raksasa, CTA berulang, irama 96px, kolom baca di tengah) di app internal — **butir ini bukan lagi imbauan**, lihat §Pemasaran vs App di atas dan penjaganya `tests/landing-boundary.test.ts`.
- ❌ Jargon akuntansi mentah di permukaan tanpa tooltip/penjelasan.
- ❌ Nilai enum DB tampil mentah di UI (`purchase`, `bl`, `coo`, …) — selalu lewat peta label bahasa tugas (`Record<Type, string>` seperti `CONTRACT_STATUS_LABELS`/`DOCUMENT_TYPE_LABELS` di `src/lib/constants.ts`); `Record` bertipe penuh membuat nilai baru tanpa label ditolak `tsc` (issue #68).

---

## Primitif Wajib: Tabel & Tombol

Markup mentah yang "kelihatan sama" adalah cara paling sering aturan di dokumen ini bocor — yang hilang justru bagian tak terlihat: pembungkus geser, cincin fokus keyboard, target sentuh. Karena itu dua keluarga ini **wajib** lewat primitif, dan dijaga oleh `tests/design-system-primitives.test.ts` (lingkup `src/app/(dashboard)` + `src/app/(setup)` + `src/components`, kecuali `src/components/ui` tempat primitifnya sendiri tinggal).

- **Tabel → `StaticTable` atau `DataTable`** (sejak issue #189 primitifnya dipecah dua, dengan **satu kontrak kolom** di `src/components/ui/table-columns.tsx`):
  - **`StaticTable`** (`src/components/ui/static-table.tsx`) — **BAWAAN.** Untuk laporan & daftar yang dipaginasi server: dirender di server, tanpa satu baris JavaScript pun. Dipakai 46 dari 66 tabel app ini.
  - **`DataTable`** (`src/components/ui/data-table.tsx`) — di atas AntD `Table`, komponen client. Dipakai **hanya** bila datanya memang sudah di client dan pengguna diuntungkan sortir/filter/paginasi seketika. Ongkosnya **terukur: +80 KB gzip per rute** (rc-table + hidrasinya), di atas penyalinan seluruh `dataSource` ke peramban. Untuk tabel yang cuma menampilkan, itu biaya tanpa imbalan — dan halaman neraca saldo dengan 2.000 akun berhenti menjadi HTML.
  - Kolomnya sama untuk keduanya: `textColumn`/`qtyColumn` (`table-columns.tsx`), `moneyColumn` (`money-column.tsx`), `statusColumn` (`status-column.tsx`). **Pembantu yang membawa komponen client tinggal di modulnya sendiri**, supaya halaman tanpa kolom uang tidak ikut menyeret `money.tsx` ke sisi client.
  - **Sortir BUKAN alasan memilih `DataTable` (issue #265).** `StaticTable` mengurutkan lewat URL: judul kolom menjadi tautan `?sort=…&dir=…` dan `orderBy` Prisma yang mengurutkan SELURUH data — bukan hanya baris yang sedang tampil. Halamannya menulis satu `SortSpec` (`src/lib/table-sort.ts`), memakainya sebagai daftar putih `parseSort` sekaligus pembangun `orderBy`, lalu mengoper `sort={{ basePath, params, keys, active }}`. **`sorter` sekarang berarti hal yang sama di kedua perender**, bawaannya MATI di semua pembantu kolom (menyalakannya keputusan HALAMAN, karena hanya halaman yang tahu apakah kolomnya punya `orderBy`), dan `StaticTable` **MELEMPAR** bila sebuah kolom menyatakan `sorter` tanpa konteks `sort` — sampai #265 ia diam, dan 30 berkas karena itu memasang kendali yang tidak pernah ada di layar.
  - **Kunci yang bisa diurutkan hanya boleh kolom NOT NULL.** MySQL tidak punya `NULLS LAST`, dan opsi `nulls` Prisma hanya ada di query compiler PostgreSQL/CockroachDB (terukur dari paket yang terpasang) — jadi penempatan NULL tidak bisa dipilih di sini. Kolom yang nilainya bisa belum diketahui karena itu tidak ditawarkan sortirnya sama sekali; menawarkannya berarti membalik arah menaikkan blok baris "—" ke puncak, tepat yang dilarang butir 4 Prinsip Inti. Kolom yang nilainya DIHITUNG DI MEMORI (total faktur dari baris barangnya) juga tidak: "terbesar"-nya akan berubah-ubah per halaman.
  - Keduanya membawa geser-sendiri: `StaticTable` lewat pembungkus ber-`overflow-x: auto`, `DataTable` lewat `scroll={{ x: "max-content" }}` yang dipasang primitif sebagai **bawaan**. AntD `Table` **tanpa** `scroll.x` tidak menggulung sendiri — yang menggulung halamannya, dan itu tidak terlihat di layar 1440px tempat kodenya ditulis. Jangan mengosongkan bawaan itu.
  - **Header lengket butuh `sticky` DAN `maxHeight`, selalu berpasangan.** `position: sticky` dihitung terhadap kotak bergulir TERDEKAT; tanpa `maxHeight`, pembungkusnya tidak pernah menggulung vertikal dan properti itu tidak melakukan apa pun — kode yang terbaca benar dan tak berpengaruh. Salah satu tanpa yang lain adalah bug; lihat komentar kepala `components/ui/table.tsx` dan `tests/permission-matrix-sticky.test.tsx`.
  - Baris total lewat prop `summary` (peta kunci kolom → isi sel) pada kedua varian; keadaan kosong lewat `empty` berisi `EmptyState`, tak pernah "No Data" bawaan AntD.
- **Primitif JSX `Table`** (`src/components/ui/table.tsx`: `TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableFooter`) kini **lapisan gaya di bawah kedua perender di atas**, bukan API yang dipanggil halaman. Ia masih dipakai langsung oleh berkas yang belum dikonversi (fase C, #193–#200); untuk tabel BARU pakai `StaticTable`/`DataTable`. Yang tetap terlarang: `<table>`/`<thead>`/`<tbody>`/`<tfoot>` mentah.
- **Nominal di tabel → `MoneyCell`** (satu sel penuh) atau **`Money`** (di dalam sel/teks). Jangan format angka sendiri: tabular-nums, rata kanan, format `id-ID`, dan mata uang eksplisit sudah di dalamnya.
- **Tombol → `Button`** (`src/components/ui/button.tsx`), termasuk pemicu `ConfirmDialog` (dipasang lewat prop `trigger`). Sejak issue #187 isinya AntD `Button`; **nama propnya tidak berubah** (`variant`/`size`/`type`). Perhatikan satu perangkap yang sengaja ditahan primitif: di AntD `type` berarti VARIAN VISUAL, di sini ia tetap berarti `submit`/`button`/`reset` seperti di HTML. Jangan "membetulkannya" dengan meneruskan `type` langsung ke AntD — 60 tombol kirim akan berhenti mengirim formulirnya tanpa satu galat pun. **Bawaan `variant` adalah `secondary`** (#267 potongan 5): tombol berisi penuh harus DIMINTA (`variant="primary"`), satu per layar — §Aksi utama per layar.
- **Tombol yang menuju ke suatu tempat → `<Button href>`. `asChild` sudah TIDAK ADA (#250).** Bentuk itu membaca prop anaknya, dan dari server component anak itu bisa tiba sebagai simpul `react.lazy` yang belum punya `.props`: `React.Children.only()` melempar dan prerender-nya mati — dengan gejala yang BERPINDAH-PINDAH menurut urutan chunk, sehingga halaman yang jatuh hari ini bukan halaman yang jatuh besok. Ke-37 pemanggilnya pindah ke `href` dan propnya dicabut dari primitifnya; `tests/button-no-aschild.test.ts` menolak yang ke-38. Atribut yang dulu menempel di `<a>` anaknya (`download`/`target`/`rel`) kini ditulis di `<Button>`-nya.
- **Tombol ikon → `variant="ghost" size="icon"`** = 40px, memenuhi target sentuh minimum. Jangan merakit tombol ikon sendiri dari padding kecil (≈28px). Antar aksi ikon yang berdampingan beri jarak **minimal 8px** (`--ant-margin-xs`) — 4px membuat dua aksi bersebelahan mudah salah tekan di layar sentuh.
- **Tingginya datang dari token `controlHeight: 40`** di `AntdProvider`, bukan dari gaya di primitif — lihat §Jarak, radius, bayangan.
- **Badge status → `Badge`** (`src/components/ui/badge.tsx`), yang sejak #187 merender AntD **`Tag`** — bukan `Badge` AntD, yang itu titik notifikasi tanpa kata. Warna teksnya dari token `components.Tag` (lihat `lib/theme/antd-tokens.ts`); bawaan AntD menaruh "Lunas" pada 2,21:1. Badge tetap **wajib berteks**.
- **Pengecualian yang disahkan** (tetap `<button>` mentah, alasannya ditulis di komentar kepala file dan didaftar di `RAW_BUTTON_ALLOWLIST` penjaga): penanda langkah `wizard`. Grup chip `aria-pressed` (`glossary-browser`) **keluar dari daftar ini di issue #198**: saringan kategorinya adalah pilihan SALING MENIADAKAN, dan itu `Segmented` AntD — `role="radiogroup"` berisi `<input type="radio">` sungguhan (panah kiri/kanan berpindah pilihan, `checked` diumumkan pembaca layar), lebih ketat daripada tujuh `aria-pressed` yang berdiri sendiri padahal hanya satu boleh aktif. Tur berpandu (`guided-tour`) **keluar dari daftar ini di issue #224**: overlay tulis tangannya kini `Tour` AntD (penyorotan, panah penunjuk, penempatan, Escape lewat `onEsc` rc-portal), sehingga satu-satunya tombolnya — "Lewati" di `actionsRender` — tidak lagi punya alasan melewati primitif. Chrome aplikasi (`sidebar`, `navbar`, `accountant-mode-toggle`, `user-menu`, `help-menu`) **keluar dari daftar ini di issue #193**: baris menu kini `Menu`, kedua dropdown kini `Dropdown` (fokus, Escape, klik-di-luar milik komponennya), dan setiap pemicunya `Button` primitif.
- **Bukan tombol, jadi di luar aturan ini:** `<input type="radio">` native dan `<input type="file">` tersembunyi — belum ada primitifnya dan penggunaannya tetap sah.
- **Pesan di dalam halaman → `Alert` AntD, dan `role`-nya TIDAK bisa dipilih.** Terukur: `Alert` selalu merender `role="alert"` — wilayah live **asertif**, yang memotong bacaan pembaca layar yang sedang berjalan — dan **membuang** `role` yang dioper. `<Alert role="status">` karena itu adalah kode yang terbaca sopan dan berperilaku sebaliknya; `tsc` tidak menyebutkannya, dan di layar tidak ada bedanya sama sekali. Untuk pesan yang TIDAK mendesak (ringkasan yang berubah, hitungan yang diperbarui) bungkus isinya dengan elemen ber-`role="status"` sendiri dan jangan pakai `Alert` — pola `components/shared/wizard.tsx`. Dijaga `tests/design-system-primitives.test.ts`.
- **Notifikasi melayang → `useToast()`** (`components/ui/toast.tsx`), bukan `import { message } from "antd"`. Jalur statis AntD membuat akar React-nya sendiri di luar `ConfigProvider` dan muncul dengan token BAWAAN — kotak putih di halaman gelap. `useToast` juga yang memasang wilayah live-nya: `message` AntD tidak punya `aria-live` sama sekali.
- **Isian pilihan telanjang → `SelectField`** (`components/ui/select.tsx`), pasangan dari `Select` komposit persis seperti `PasswordField` dari `PasswordInput`. Ia `Select` AntD sejak #188 — dulu bernama `NativeSelect`, diganti di #264 karena "native" adalah janji yang sudah tidak ditepatinya sejak #188 dan yang menagih sekali lewat #259. Empat akibat yang harus diketahui sebelum memakainya:
  - **`name` tetap terkirim** — primitifnya menitipkan `<input type="hidden">` di dalam kontrolnya sendiri, jadi `new FormData(form)` dan `<form method="get">` tetap bekerja.
  - **`[name=…]` karena itu TIDAK menunjuk kendali yang bisa difokuskan** (issue #259). Pencarian `document.querySelector('[name=…]')` pada isian pilihan berujung di hidden companion itu, dan `focus()` di sana tidak melempar galat — ia diam-diam membuang fokusnya. Kendali sungguhannya adalah `<input role="combobox">` di dalam akar yang sama; `id` yang dioper mendarat di sana. Kode yang memindahkan fokus lewat NAMA field wajib menyelesaikan hasil pencariannya dulu menjadi kendali fokusabel — `focusFormField` (`components/ui/disclosure-section.tsx`) sudah melakukannya untuk semua pemanggil.
  - **`required` TIDAK lagi divalidasi peramban.** Yang tersisa `aria-required` + tanda `*`; penjaganya validasi server (dan zod setelah #192). Isian pilihan yang wajib harus punya validasi selain `required`.
  - **Pencarian menyala sendiri di atas 12 opsi** (`SEARCH_THRESHOLD`), bisa ditimpa lewat prop `searchable`.
- **Keluarga isian pilihan: tiga primitif, satu perbedaan** (issue #263). Ketiganya isian pilihan, ketiganya hidup di dalam pola `Form`, dan dari sisi pemanggil ketiganya terlihat setara. Yang membedakan hanya satu hal — dan hal itu tidak terlihat di layar:

| Primitif | Dipakai saat | Nilainya ikut `new FormData(form)` |
| --- | --- | --- |
| `SelectField` (`ui/select.tsx`) | bawaan; pencarian menyala sendiri di atas 12 opsi | **ya** — primitifnya menitipkan `<input type="hidden">` bernama |
| `SearchableSelect` (`ui/searchable-select.tsx`) | opsinya butuh **baris kedua** (negara / kontak) — sesuatu yang `SelectField` tidak punya | **tidak** |
| `ServerSearchableSelect` (`ui/server-searchable-select.tsx`) | daftarnya terlalu besar untuk dikirim ke klien; tiap ketikan mencari ke server | **tidak** |

  - **Kedua yang berpencarian TIDAK menerima `name`, dan itu dinyatakan di TIPE.** `Select` AntD bukan kontrol form — tidak ada apa pun di dalamnya yang bisa dititipi nama. Menerima `name` lalu mengabaikannya adalah bentuk kegagalan terburuk yang tersedia: formulir yang membaca `new FormData(form)` kehilangan satu field **tanpa satu galat pun** — bukan nol, bukan kosong, melainkan tidak ada di muatan, dan server menerima objek yang tampak sah. Karena itu `name` ADA di tipe kedua isian itu hanya untuk **ditolak**, dan tipenya berupa kalimat sehingga pesan `tsc`-nya menyebut sendiri apa yang harus dipakai sebagai gantinya.
  - **Yang benar-benar ditutup adalah bentuk SEBARAN.** `name="…"` yang ditulis langsung memang sudah ditolak sebagai properti berlebih jauh sebelum #263; `{...field}` dari `react-hook-form` **tidak** — pemeriksaan properti berlebih JSX tidak berlaku untuk sebaran, hanya pemeriksaan kecocokan tipe atas properti yang **dideklarasikan**. Terukur di #263: sebelum penutupan ini, `{...field}` pada kedua isian berpencarian lolos `tsc` dengan nol galat. Penjaganya `tests/ui-fields.test.tsx` (bentuk markup-nya di vitest, penutupan tipenya lewat `@ts-expect-error` yang dinilai `bun run typecheck`).
  - **Kalau nilainya harus terkirim bersama form, pilihannya dua:** pakai `SelectField`, atau baca nilainya lewat `value`/`onChange`. Ke-15 pemakaian hari ini (8 `SearchableSelect` + 7 `ServerSearchableSelect`, dihitung dengan mengurai JSX-nya, bukan `grep`) semuanya memakai jalan kedua.
  - **`searchPlaceholder` sudah tidak ada** (dicabut #263). Ia inert sejak #188 — pada AntD yang diketik adalah pemicunya sendiri, jadi placeholder-nya `placeholder` — dan dua belas pemanggil tetap mengopernya selama fase B–C. Itu penyakit yang sama dengan `name`: prop yang menerima nilai lalu tidak melakukan apa pun dengannya.

---

## Aksi utama per layar (issue #267)

Penekanan visual adalah **informasi**: tombol berisi penuh memberi tahu pengguna
aksi mana yang dimaksudkan layar ini. Ketika mayoritas tombol berisi penuh,
penekanan berhenti membedakan apa pun — layar dengan enam tombol primer memberi
enam ajakan setara, dan pengguna harus membaca semuanya untuk menemukan yang
dimaksud. Di layar akuntansi aksi yang salah tekan berbiaya nyata (memposting,
membatalkan, menyetujui), jadi ini bukan soal estetika.

**Aturannya: satu aksi utama per layar. Nol juga sah.**

### Yang dihitung "satu layar"

Yang **terender bersamaan** pada satu URL dalam **satu keadaan** — bukan satu
berkas, dan bukan satu komponen.

- Cabang yang **saling meniadakan** bukan dua. `/verify-email` menulis tiga
  tombol primer di satu berkas (sudah terverifikasi · sudah terdaftar ·
  verifikasi sekarang); yang tampil selalu satu. Sama untuk kaki wisaya
  ("Lanjut" pada langkah tengah, "Selesai" pada langkah terakhir).
- **Overlay adalah layarnya sendiri.** Tombol utama sebuah `ConfirmDialog`/
  `Modal` tidak bersaing dengan tombol di halaman di belakangnya.
- **Sebaliknya**, primer yang datang dari komponen BERBEDA tetap satu layar.
  `/platform/billing` memikul tiga tautan "Lihat paket" dari tiga berkas
  (kepala halaman, pita masa coba, kartu naik-paket) — tidak ada penjaga yang
  melihatnya, hanya mata.

### Yang memenuhi syarat menjadi aksi utama

Aksi yang **mengikat atau memajukan**: mengirim formulir yang menyimpan sesuatu,
memposting, menyetujui, melangkah maju di wisaya, "mulai bekerja".

Yang **tidak** memenuhi syarat:

- **Navigasi ke layar baca lain** — kecuali ia satu-satunya jalan maju. Karena
  itu "Tambah Perusahaan" primer di layar nol-perusahaan `/select-company` dan
  `outline` di kaki kartu daftar, tempat ia jalan samping di sebelah pilihan
  perusahaan. Tombol yang sama, dua peran.
- **Jalan keluar dari layar buntu** (`/feature-inactive`, `/setup-required`:
  "Kembali ke dasbor"). Layarnya tidak punya tugas; ia punya pintu.
- **Kirim formulir yang MENYARING**, bukan mengikat. "Saring" di
  `/operator` `outline`, dan itu benar: ia membaca ulang, tidak menulis apa pun.
  Sejak potongan 4 ini berlaku pada **seluruh** kotak cari/saring app ini:
  `/contracts`, `/delivery-orders`, `/documents`, `/invoices`, `/finance`,
  `/accounts` (potongan 4 — variannya sudah tertulis `secondary`, jadi ia tidak
  muncul di sapuan tombol implisit dan baru ketahuan saat dibandingkan),
  `shared/ledger-filter.tsx`, `shared/stock-period-filter.tsx`,
  `ledger/ledger-filter.tsx`, dan **kedua penyaring laporan**
  (`reports/report-filters.tsx` → delapan halaman laporan, yang karena itu kini
  sengaja **nol** aksi utama: layar baca dengan ekspor `secondary`).
- **Chip/tab saringan, termasuk yang sedang AKTIF.** Chip aktif menyatakan
  KEADAAN ("inilah irisan yang sedang Anda lihat"), bukan ajakan — jadi ia
  `secondary` (berbingkai) dan saudaranya `ghost` (tanpa bingkai), tidak pernah
  berisi penuh. Bedanya ada pada bingkai, bukan pada warna saja.
  Sejak potongan 4 aturan ini juga menjangkau **tombol pemilih baris**:
  "Tinjau" di `/periods` (`periods/period-manager.tsx`) menentukan periode mana
  yang dibaca kartu ringkasan di sebelahnya — bentuk chip, bukan aksi — dan
  baris terpilihnya sudah bertanda lewat latar `colorPrimaryBg` serta judul
  kartu kanan, jadi penurunannya tidak menghapus isyarat apa pun.
  ⚠ Chip granularitas `shared/stock-period-filter.tsx` **tetap** berisi penuh,
  dan itu bukan inkonsistensi: potongan 2 mempertahankannya dengan syarat yang
  ditulis di sana — *ia satu-satunya penekanan penuh di layarnya* (`/inventory/movement`
  dan `/inventory/opname/history` sengaja nol primer). Enam halaman daftar di
  potongan 3 gagal syarat itu: masing-masing memikul CTA kepala halaman yang
  memang aksi utamanya. Syaratnya yang menentukan, bukan bentuk widgetnya.
- **Pemicu yang membuka panel.** Ia tata letak, bukan aksi: `secondary`, dan
  yang primer adalah submit DI DALAM panelnya (`shared/payment-form.tsx`,
  `users/users-client.tsx`, `inventory/update/stock-form.tsx`,
  `suppliers/[id]/advance-panel.tsx` sejak potongan 4). Akibatnya layar
  memikul nol primer saat panel tertutup dan tepat satu saat terbuka — bentuk
  yang paling sering benar untuk halaman detail.
  ⚠ **Pemicu `ConfirmDialog` BUKAN pemicu panel**, dan perbedaannya bukan
  teknis: pemicu panel membuka pekerjaan yang belum dikerjakan (isian yang masih
  kosong), sedangkan dialog konfirmasi muncul SETELAH pekerjaannya selesai —
  penggunanya sudah mengisi formulir atau memilih barisnya, dan yang tersisa
  hanya membenarkan. Karena itu pemicunya BOLEH primer: `/periods` "Tutup
  periode" dan `/inventory/opname` "Simpan hasil opname" keduanya pemicu dialog
  dan keduanya aksi utama layarnya. Yang menurunkan pemicu "Setujui" di
  `/approvals` karena itu bukan bentuk dialognya, melainkan pengulangan barisnya
  (di bawah).
- **Aksi baris yang berulang** — lihat pengecualian 1 di bawah. `/approvals`
  adalah kasus paling terang di app ini: "Setujui" dan "Ajukan ulang" hidup di
  dalam `.map()`, jadi antrean berisi sepuluh dokumen memberi sepuluh blok biru.
  Keduanya `secondary` sejak potongan 4, dan tidak ada yang hilang: aksi yang
  mengikat tetap berisi penuh di layarnya sendiri, yaitu di dalam dialognya.
  Layar itu kini **nol** primer — benar untuk permukaan yang tugasnya menimbang,
  bukan menjalankan.
- **Aksi destruktif.** `variant="destructive"` tidak pernah dihitung sebagai
  aksi utama layar — ia menonjol karena bahayanya, bukan karena dimaksudkan.
  ⚠ **Angka kontrasnya bukan urusan bagian ini: tombol `danger` gagal 4,5:1 di
  kedua tema dan sedang dikerjakan di #219.** Jangan memutuskannya dua kali.

### CTA kepala halaman vs CTA keadaan-kosong — kepala yang menang

Pada halaman daftar yang **kosong**, dua ajakan terender bersamaan dan keduanya
menunjuk `href` yang sama, sering dengan label yang sama persis: tombol di kanan
atas `PageHeader`, dan tombol di dalam `EmptyState`. Menurut aturan di atas itu
dua primer. **Yang menang CTA kepala; `EmptyState` merender aksinya `secondary`**
(keputusannya di primitifnya, `components/ui/empty-state.tsx`, berikut alasan
panjangnya).

Dua hal yang memutuskannya, dan keduanya terukur — bukan selera:

1. **Kosong ≠ modul kosong.** Halaman-halaman itu merender keadaan-kosong juga
   ketika SARINGAN tidak menemukan apa-apa. `/contracts?search=zzz` pada
   perusahaan dengan 400 kontrak menampilkan "Belum ada kontrak" berikut
   tombolnya; CTA primer di situ menjawab "pencarian Anda nihil" dengan "buat
   yang baru", jawaban yang salah. CTA kepala tidak mengklaim apa pun.
2. **Alternatifnya harus BERKONDISI, dan ongkosnya dua.** Kalau yang mengalah
   CTA kepala, ia hanya boleh mengalah saat daftarnya berisi — artinya tombol
   yang berpindah penekanan tepat saat baris pertama masuk, **dan** modul yang
   dalam keadaan normalnya (berisi) tidak punya satu pun aksi utama. Rambu #267
   menyebut persis itu: menyeragamkan dengan menurunkan semuanya hanya menukar
   satu hierarki rata dengan yang lain.

Ini **tidak** bertentangan dengan "Tambah Perusahaan" di `/select-company` di
atas. Di sana layar nol-perusahaan tidak punya tombol lain sama sekali — CTA-nya
memang **satu-satunya jalan maju**. Di halaman daftar, CTA kepala selalu ikut
terender di sebelahnya.

⚠ Konsekuensinya berlaku ke seluruh app: **32 blok keadaan-kosong di 30 berkas**
mewarisi keputusan ini (dihitung dengan parser TS; sapuan `grep` atas nama prop
yang salah pernah melaporkan angka **2** untuk hal yang sama — koreksi ketiga
atas pengukuran di issue ini). Kalau kelak ada keadaan-kosong yang sungguh
satu-satunya jalan maju layarnya, yang benar adalah menambah prop eskalasi di
primitifnya, bukan menaikkan bawaannya kembali.

### Dua pengecualian — ditemukan dengan mengujinya ke layar nyata

**1. Pilihan setara yang berulang.** Aksi baris di dalam `.map()` **tidak pernah
primer**, karena jumlahnya tak terbatas dan sepuluh blok biru bukan sepuluh kali
penekanan melainkan nol. **Kecuali** ketiga syarat ini benar sekaligus:

  a. label dan akibatnya **identik** di setiap baris;
  b. memilih salah satunya adalah **satu-satunya jalan maju** layar itu;
  c. **tidak ada tombol primer lain** di layar itu.

Satu layar memenuhinya: `/select-company` — sebuah kartu berisi daftar PT dan
tidak ada apa pun lagi; kaki kartunya seluruhnya `outline`. Kisi yang bentuknya
SAMA di `/platform` dan `/platform/team` **tidak** memenuhi syarat (b): kedua
halaman itu juga memikul meteran kuota, status langganan, dan jalan lain — di
sana barisnya `outline`. Menurunkan `/select-company` juga akan meratakan
hierarki dari arah sebaliknya: layarnya jadi tanpa satu pun titik masuk.

**2. Eskalasi berkondisi.** Sebuah tombol boleh **naik** menjadi primer hanya
dalam keadaan tertentu — `variant={trial.urgent ? "primary" : "outline"}`
(`platform/subscription-section.tsx`), `variant={isUpgrade ? "default" :
"outline"}` (`billing/plans/plan-actions.tsx`). Bentuk ini disukai: ia membuat
penekanan menjadi **jawaban atas keadaan**, bukan properti tetap tata letak.
Yang harus dijaga: dalam keadaan yang menaikkannya, tombol itu **satu-satunya**
primer di layar.

Contoh terbaiknya lahir di potongan 4, karena syarat itu terpenuhi oleh
halamannya sendiri, bukan oleh janji: `/tax/efaktur` memikul dua aksi mengikat
dari dua berkas — "Simpan identitas penjual" dan "Unduh CSV". Tetapi selama NPWP
penjual kosong, halaman itu **tidak merender tombol unduhnya sama sekali**
(diganti catatan "NPWP diperlukan"), jadi menyimpan identitas benar-benar
satu-satunya jalan maju. `variant={identityIncomplete ? "primary" : "secondary"}`
karena itu bukan penyetelan selera: penekanan pindah mengikuti apa yang bisa
dilakukan. Bandingkan dengan eskalasi yang **dicabut** di potongan 3
(`reconciliation-workspace` menaikkan "Kunci" saat pekerjaannya justru belum
selesai) — bentuknya sama, syaratnya yang membedakan.

### Pendaratan `/` DIKECUALIKAN — dan pengecualiannya berbatas

Aturan di atas **tidak berlaku** untuk `/` dan `src/components/landing/**`.
Halaman itu merender **empat** tombol berisi penuh sekaligus, dari empat
komponen: bilah atas (`LandingNav`), hero (`LandingHero`), setiap kartu paket
(`LandingPricing`, di dalam `.map()`), dan ajakan penutup (`LandingClosingCta`).
Dihitung dengan aturan app internal itu pelanggaran empat kali.

Keputusannya **mengecualikan**, bukan merapikan, karena §Pemasaran vs App sudah
menyebut pengulangan itu sebagai salah satu dari **empat dimensi yang membuat
sebuah halaman pemasaran**: *"aksi yang SAMA diulang tiga kali (hero, tiap kartu
paket, penutup)"*. Menegakkan satu-primer di sana berarti mencabut dimensi yang
dokumen ini sengaja pasang, dan menyuruh orang yang membaca sampai ujung
menggulung balik untuk menemukan tombolnya. `pages/landing.md` melonggarkan hero
& CTA dengan kalimat yang sama sejak #245; bagian ini hanya membuat konsekuensi
tombolnya tertulis, bukan tersirat.

**Batasnya ada pada kata "SAMA".** Pengulangan sah karena ajakannya **satu**:
keempat tombol itu menuju `/register`. Tombol primer kedua yang menuju tempat
lain berarti halaman ini berhenti mengulang satu ajakan dan mulai menawarkan
dua — hierarki rata yang sama, hanya di permukaan yang berbeda. Karena itu
batasnya **dijaga**: `tests/button-emphasis.test.ts` menolak tombol primer di
`components/landing/**` yang `href`-nya bukan `/register`. Yang tidak dijaga:
berapa **kali** ia muncul di layar, dan apakah label berbeda untuk tujuan yang
sama masih terbaca sebagai satu ajakan.

Yang **tetap berlaku penuh** di pendaratan: `variant` ditulis eksplisit (kalau
tidak, pembalikan bawaan kelak diam-diam mencabut hero halaman pemasaran) dan
seluruh isi `pages/landing.md` §Yang TETAP BERLAKU PENUH.

### Bawaan `variant` = `secondary` — penekanan tinggi harus DIMINTA

**`<Button>` tanpa atribut adalah tombol SEKUNDER** (sejak #267 potongan 5).
Bawaan yang aman adalah bawaan yang **paling sering benar**; dengan aturan
"satu aksi utama per layar, nol juga sah", tombol yang paling sering benar
adalah yang sekunder. Penekanan tinggi karena itu ditulis: `variant="primary"`,
sekali per layar, terlihat di diff.

Sampai potongan 4 bawaannya `primary`, dan itulah bagaimana **120 dari 310**
tombol jadi berisi penuh tanpa seorang pun memutuskannya. Membalik bawaannya
lebih dulu akan menurunkan ratusan tombol sekaligus dan membuat **setiap layar
kehilangan aksi utamanya** sampai masing-masing ditandai ulang. Karena itu
urutannya dibalik: **audit dulu** (tulis `variant` eksplisit di mana-mana, satu
potongan per PR, potongan 1–4), **baru** bawaannya (potongan 5). Keadaan
akhirnya identik, risikonya jauh berbeda.

Potongan 4 menuntaskan auditnya: **nol** `<Button>` implisit di `src/app` dan
`src/components`. Ia menyentuh **53 tombol implisit di 51 berkas** — **43 tetap
primer** (hampir seluruhnya submit formulir dan CTA kepala halaman) dan **10
turun**, semuanya karena tabrakan yang hanya terlihat dengan membuka halamannya.

**Potongan 5 karena itu tidak mengubah apa pun, dan itu DIUKUR** — bukan
disimpulkan dari suite yang hijau, sebab tesnya tidak merender setiap layar:

- Parser TS yang sama dengan penjaganya, dijalankan pada **seluruh `src/`**
  (lebih luas dari lingkup penjaganya): **nol** `<Button>` tanpa `variant` dari
  305 pemanggil, **nol** `<Button {...spread}>`, dan satu-satunya alias impor
  `Button` adalah milik AntD di dalam primitifnya sendiri.
- Kelas kebocoran yang parser **tidak** bisa lihat — komponen yang meneruskan
  `variant` opsional ke primitifnya — ada tepat **dua** (`pdf-document-button`,
  `confirm-dialog`), dan keduanya punya bawaannya sendiri (`"secondary"` /
  `"danger"`), jadi `undefined` tidak pernah sampai ke primitif.
- Sisi render: markup `renderToStaticMarkup` dari ke-305 pemanggil, dirender
  dengan varian yang benar-benar tertulis di masing-masing, **identik** sebelum
  & sesudah — sementara `<Button>` polos sebagai kalibrasi memang berubah
  (`ant-btn-variant-solid` → `outlined`), yang membuktikan instrumennya tidak
  buta.
- Dua halaman yang benar-benar diprerender `next build` (`/privacy`, `/terms`)
  menghasilkan HTML **byte-identik**.

⚠ **Yang bukti itu TIDAK cakup:** manifes render merender tiap tombol
sendirian, bukan di dalam pohon halamannya, dan hanya **2** halaman app ini yang
statis — sisanya dirender sesuai permintaan, jadi tidak ada HTML sebelum/sesudah
untuk dibandingkan. Yang dijamin adalah *markup tiap pemanggil*, bukan *tiap
layar*. Sapuan mata #205 tetap terutang.

⚠ **Jangan membaliknya kembali** "supaya tombol tidak perlu ditulis variannya".
Yang hilang bukan pengetikan melainkan keputusan.

### Penjaganya — dan batasnya, yang harus dibaca

`tests/button-emphasis.test.ts` menjaga **dua** hal, dan sengaja tidak berpura-
pura menjaga yang ketiga:

1. **Keeksplisitan**: setiap `<Button>` menyebut `variant`-nya. Inilah yang
   membuat pembalikan bawaan potongan 5 menjadi jaring pengaman, bukan
   perubahan. Sejak potongan 4 lingkupnya **seluruh `src/app` +
   `src/components`, tanpa satu pun pengecualian** — `BERKAS_TERAUDIT` melebur
   ke direktorinya.

   **Ia TETAP diperlukan sesudah bawaannya dibalik, dan alasannya berubah
   alih-alih hilang.** Dulu tombol implisit gagal dengan KERAS — satu blok biru
   liar yang bisa ditemukan mata di sapuan visual. Sekarang ia gagal DIAM:
   sekunder di antara sekunder. Layar yang aksi utamanya kebetulan ditulis
   `<Button>` polos tidak akan tampak salah, ia hanya kehilangan arah — tanpa
   galat, tanpa merah, tanpa apa pun yang mengundang pertanyaan. Kegagalan yang
   lebih aman justru lebih sulit ditemukan. Dan pekerjaan penjaga ini yang
   sebenarnya bukan menyeragamkan gaya penulisan melainkan memaksa
   **pertanyaannya** dijawab satu kali, di tempat yang terlihat di diff.
2. **Satu primer per wadah JSX** yang bisa terender bersamaan. Cabang ternary
   dihitung sebagai alternatif (`Math.max`), bukan dijumlahkan — tanpa itu
   penjaganya merah pada kaki wisaya dan `/verify-email`, yaitu pada contoh
   paling bersih dari aturannya, dan penjaga yang merah pada yang benar akan
   dilonggarkan sampai tidak menjaga apa pun. Pada jalan pertamanya ia **merah
   di 13 berkas**; potongan 2 & 3 mengosongkan daftar sisanya, dan sejak
   potongan 4 daftar itu **tidak ada lagi**.

   Sejak potongan 5 penjaga ini **tidak lagi menghitung `<Button>` implisit
   sebagai primer**, sebab primitifnya tidak lagi merendernya begitu. Ia
   menjawab pertanyaan "berapa tombol yang render-nya berisi penuh", dan
   jawabannya harus datang dari apa yang primitifnya benar-benar lakukan —
   penjaga yang memakai model usang tentang primitif yang dijaganya adalah
   persis kelas penjaga yang §Penjaga di bawah daftar sebagai "terbaca benar,
   tidak menjaga apa pun". Yang menutup lubangnya: penjaga #1 melarang bentuk
   itu sama sekali, jadi yang diabaikan penjaga #2 tidak boleh ada sejak awal.

Sejak potongan 2 ada penjaga **ketiga**, dan ia menjaga BATAS sebuah
pengecualian, bukan aturannya: setiap tombol primer di `components/landing/**`
harus menuju `/register` (lihat §Pendaratan `/` DIKECUALIKAN di atas).

**Daftar pengecualiannya DIHAPUS, bukan dikosongkan (potongan 4).** Potongan 3
mengosongkan `SISA_AUDIT` dan `SISA_KEEKSPLISITAN` lalu menulis sendiri
kelemahan yang ia ciptakan: kedua tes "tidak memuat entri basi" lulus pada
daftar kosong, yaitu **tanpa memeriksa apa pun**, sementara jumlah tes hijau
terbaca lebih kuat daripada kenyataannya. Potongan 4 menutupnya dengan mencabut
kedua daftar berikut kedua tes hampa itu (dan `BERKAS_TERAUDIT` berikut tes
"berkasnya ada"). Yang menggantikannya memeriksa sesuatu yang tidak bisa hampa:
**penjaga keeksplisitan harus menyentuh SETIAP berkas `.tsx`** di kedua akar —
merah kalau ada yang mempersempit lingkupnya kembali ke subdirektori atau
memasang saringan pengecualian baru. Siapa pun yang kelak butuh pengecualian
harus menulis ulang mekanismenya di PR-nya sendiri, terlihat di diff.

**Yang TIDAK dijaga, dan hanya bisa dilihat mata:** pengulangan lewat `.map()`
(satu simpul di sumber, sepuluh tombol di layar), primer yang tersebar antar
komponen pada satu halaman, dan apakah keadaan yang menaikkan sebuah primer
berkondisi bisa bertemu primer lain — plus **antar-lingkup dalam SATU berkas**:
kolom `StaticTable`/`DataTable` dirakit di sebuah variabel **di luar `return`**,
jadi tombol barisnya dan tombol halamannya hidup di dua akar JSX yang berbeda
dan `hitungPrimer` tidak pernah bertemu keduanya. **Setiap tabel di app ini
berbentuk begitu** (66 tabel), jadi siapa pun yang menaruh primer di kolom
render tidak akan ditegur. Hijau di berkas itu **bukan** bukti aturan ini
ditegakkan.

Dua contoh yang lolos penjaga dan ditemukan hanya dengan membaca pemanggilnya,
keduanya diselesaikan di potongan 2 — keduanya di `src/components/shared`:

- **`advance-compensation.tsx`** selalu terbuka (tanpa pemicu), jadi submitnya
  yang dulu berisi penuh menyala di setiap `/invoices/[id]` dan
  `/suppliers/[id]` yang kebetulan punya uang muka — bertabrakan langsung
  dengan "Catat pembayaran" (`payment-form.tsx`) dan "Catat uang muka"
  (`advance-panel.tsx`). Ia **turun** ke `secondary`: tetap aksi yang
  memposting, tetapi aksi SAMPINGAN pada layar yang tugas utamanya lain.
- **`stock-period-filter.tsx`** memasang dua penekanan penuh berdampingan:
  tombol "Tampilkan" rentang khusus dan chip granularitas yang sedang aktif.
  Tombolnya **turun** ke `outline` (ia menyaring); chipnya tetap penuh karena
  artinya bukan "tekan saya" melainkan "inilah periode yang sedang Anda lihat".

Dua lagi di potongan 3, ditemukan dengan cara yang sama:

- **`contracts/[id]/page.tsx` × `shared/payment-form.tsx`** — utang yang
  potongan 2 catat alih-alih rapikan diam-diam. "Buat Faktur" di kepala halaman
  kontrak bertemu submit pembayaran begitu formulirnya dibuka: dua blok biru
  dari dua berkas. **"Buat Faktur" yang turun** (`secondary`), sebab ia
  NAVIGASI ke formulir lain dan bukan satu-satunya jalan maju — mencatat
  pembayaran, menyunting, dan mencetak PDF sama-sama tersedia. Hasilnya sama
  dengan `/invoices/[id]`: nol primer dalam keadaan bawaan, tepat satu saat
  formulir pembayaran dibuka.
- **`fixed-assets/page.tsx` × `fixed-assets/run-depreciation.tsx`** — utang yang
  potongan 3 catat, **dibayar di potongan 4**. Kartu "Jalankan penyusutan"
  memposting, jadi ia memenuhi syarat aksi utama; ia tetap yang **turun**
  (`secondary`). Yang memutuskan adalah keadaan kosongnya: hanya `hasCategories`
  yang menyalakan kartu itu, jadi perusahaan yang sudah punya kategori tapi
  belum punya satu aset pun akan melihat satu-satunya blok biru di layarnya
  menjalankan penyusutan atas nol aset — sementara "Tambah Aset", satu-satunya
  hal yang masuk akal di sana, berdiri redup. Preseden yang dipakai:
  `advance-compensation` (potongan 2) dan "Simpan barang-baru" (potongan 3) —
  aksi yang memposting tetapi SAMPINGAN di layar yang tugas utamanya lain.

Empat lagi di potongan 4, semuanya kelas yang sama (dua primer dari dua berkas,
atau dari dua ruang lingkup dalam satu berkas). Dua di antaranya **dibuktikan**
tak terlihat penjaga: menaikkannya kembali tidak membuat satu tes pun merah.

- **`fixed-assets` × `run-depreciation`** di atas.
- **`periods/period-manager.tsx` dengan dirinya sendiri** — tombol baris
  "Tinjau" yang terpilih berisi penuh, bertemu "Tutup periode" di kartu
  sebelahnya. Penjaga #2 buta di sini bukan karena bentuk JSX-nya melainkan
  karena **kolomnya dirakit di luar `return`**: tak ada satu wadah JSX pun yang
  memuat keduanya. Yang turun barisnya (chip keadaan), sebab menutup periode
  ADALAH pekerjaan halaman itu.
- **`permissions-client.tsx` × `role-manager.tsx`** — "Simpan perubahan" matriks
  bertemu "Tambah peran" di kartu bawah. Yang turun formulir perannya: ia
  menyimpan, tetapi sampingan.
- **`inventory/opname/page.tsx` × `opname-form.tsx`** — CTA kepala "Tambah/
  Kurangi Stok" bertemu submit hasil opname. Yang turun CTA kepalanya: ia
  NAVIGASI ke modul lain, persis bentuk "Buat Faktur" di `/contracts/[id]`.
- **`tax/efaktur/page.tsx` × `seller-identity-form.tsx`** — diselesaikan dengan
  eskalasi berkondisi, bukan dengan memilih pemenang tetap; lihat pengecualian 2
  di atas.

---

## Penjaga: aturan mana dijaga apa (issue #204)

Aturan yang tidak dijaga bocor pada PR berikutnya — itu bukan dugaan melainkan
pengalaman repo ini. Penjaga `RAW_PALETTE` lama tidak mengenal `border-l-`, dan
satu kelas palet mentah karena itu bertahan berbulan-bulan di beranda, tetap
`#3B82F6` saat tema gelap menyala. Yang membuatnya bertahan bukan ketiadaan
penjaga, melainkan penjaga yang mengenal SEBAGIAN kosakata: orang berikutnya
membaca hijau dan menyimpulkan aman.

| Aturan | Penjaga |
|---|---|
| Warna hanya dari token AntD (bukan hex/`rgb()`/nama warna) | ESLint `sai/warna-token-antd` (`eslint-rules/warna-token-antd.mjs`) |
| Nol `className`; ikon tanpa prop `size`; `Alert` tanpa `role`; tanpa `<table>`/`<button>` mentah | `tests/design-system-primitives.test.ts` |
| Judul & breadcrumb hanya lewat `PageHeader` (termasuk `Typography.Title level={1}`) | `tests/page-header.test.ts` |
| Halaman tetap server component; batas client berhenti di primitif | `tests/rsc-boundary.test.ts` (ambang 158) |
| Barrel `@ant-design/icons` tak menyentuh lapisan RSC | `tests/icon-rsc-boundary.test.ts` + `modularizeImports` di `next.config.ts` |
| Angka kontras token, dihitung ulang dari paket `antd` yang terpasang | `tests/antd-tokens.test.ts`, `tests/ui-controls-antd.test.tsx`, `tests/chart-tokens.test.tsx` |
| Permukaan (`colorBgLayout`/`Container`/`Elevated`) tidak bergeser tanpa menurunkan ulang seluruh tabel kontras | `tests/antd-tokens.test.ts` → "jenjang permukaan (#266)" |
| Nada kepala tabel tetap permukaan terukur, KEDUA perender memakai satu angka, kartu berbayang dari token, tanpa pita baris | `tests/antd-tokens.test.ts` → "jenjang perender (#266)" |
| Kepala tabel tidak berganti warna saat menempel | `tests/permission-matrix-sticky.test.tsx` |
| Tirai/fokus/Escape overlay; `styles` Modal memakai nama bagian yang sungguh ada | `tests/ui-overlay-antd.test.tsx` |
| Batas dunia pemasaran ↔ app internal | `tests/landing-boundary.test.ts` |
| `Button asChild` tidak kembali (bentuk yang mematikan prerender dari server component) | `tests/button-no-aschild.test.ts` |
| Tak ada `<a>` yang membungkus `<button>`: jumlah sarang anchor–tombol per berkas hanya boleh MENGECIL, modul yang sudah dibersihkan tetap nol, `legacyBehavior` tidak dipakai (⚠ sarang yang dirakit antar-berkas dan alias impor baru TIDAK terlihat penjaga) | `tests/anchor-button-nesting.test.ts` |
| `<ButtonLink>` benar-benar menavigasi di sisi klien: satu `<a class="ant-btn">`, `href` ter-scope tenant, `router.push` pada klik biasa, dan Ctrl/klik-tengah/`download`/alamat luar tetap milik peramban | `tests/button-link-navigation.test.tsx` |
| Satu aksi utama per layar: `variant` eksplisit di **seluruh** `src/app` + `src/components` (tanpa daftar pengecualian sejak potongan 4, dan lingkup itu sendiri dijaga), tak ada dua primer yang bisa terender bersamaan dalam satu wadah JSX, dan setiap primer pendaratan menuju `/register` (⚠ `.map()`, primer antar-komponen, primer antar-lingkup dalam satu berkas — **yaitu setiap kolom tabel** — dan primer berkondisi TIDAK terlihat penjaga; lihat §Aksi utama per layar) | `tests/button-emphasis.test.ts` |
| Bawaan `variant` primitif `Button` = `secondary`, di kedua bentuknya (tombol & anchor), dikunci di sumber **dan** di markup hasil render | `tests/button-emphasis.test.ts` · `tests/ui-controls-antd.test.tsx` |
| Nilai tak diketahui tidak pernah tampil 0 | `tests/money-unknown.test.tsx` |
| `StaticTable` tidak mengabaikan `sorter`; kolom yang menyatakannya merender kendali sortir, `aria-sort`, dan tautan yang mempertahankan query | `tests/table-sort.test.tsx` |
| Form: satu skema zod dua sisi; `Form` AntD tidak dipakai | `tests/form-schema-parity.test.ts`, `tests/ui-form-antd.test.tsx` |
| Fokus galat validasi mendarat di kendali yang bisa difokuskan (bukan hidden companion isian pilihan) | `tests/focus-form-field.test.tsx` |
| Keluarga isian pilihan: hanya `SelectField` yang ikut `FormData`; `name` pada kedua isian berpencarian ditolak `tsc` bahkan lewat `{...field}` | `tests/ui-fields.test.tsx` (markup di vitest, penutupan tipenya lewat `@ts-expect-error` yang dinilai `bun run typecheck`) |
| Tidak ada kunci kamus yang menganggur: setiap kunci di `id/en/zh.json` punya rujukan di `src/` — literal, rantai properti berakar kamus, atau bentuk dinamis yang **terdaftar** (daftarnya dijaga dua arah: entri basi merah, bentuk dinamis baru yang belum diputuskan juga merah) (⚠ subpohon yang diambil utuh, dan kunci yang hanya dirujuk dari `tests/`, TIDAK terlihat penjaga) | `tests/i18n-orphan-keys.test.ts` |

**Menambah penjaga: langgar sengaja SEKALI, pastikan ia merah karena alasan
yang benar, lalu kembalikan.** Ini bukan seremoni. Sepanjang epik #206 sudah
muncul empat hal yang terbaca benar di kode dan tidak melakukan apa pun:
`position: sticky` tanpa kotak bergulir, pembungkus `role="status"` di sekeliling
`Alert` yang selalu asertif, `styles.content` pada `Modal` yang bukan bagian
semantik v6 sama sekali (sehingga prop `size` dialog inert berbulan-bulan) — dan
penjaga `Alert` di atas, yang pada percobaan pertama HIJAU pada pelanggaran yang
sengaja disuntikkan untuk mengujinya. Penjaga yang tak pernah merah adalah
kandidat berikutnya untuk daftar itu.

**`bun run verify` hijau TIDAK membuktikan aplikasinya bisa dibangun.** Sebuah
bug pernah lolos typecheck + lint + 2.232 tes lalu mematikan `next build`
produksi (barrel `@ant-design/icons` yang menyentuh lapisan RSC; galatnya
menunjuk halaman acak). `bun run build` adalah gerbang tersendiri, dan ia wajib
`EXIT=0` sebelum UI diserahkan.

---

## Pre-Delivery Checklist (UI apa pun)
- [ ] Ikon SVG konsisten (`@ant-design/icons`), tanpa emoji; ukurannya `style={{ fontSize }}` — bukan prop `size`/`width`/`height`; dekoratif tetap `aria-hidden`.
- [ ] `cursor: pointer` di semua elemen klik; hover transisi 150–250ms.
- [ ] Kontras memenuhi ambang **per ukuran teks** (§Ambang kontras); fokus keyboard terlihat; `prefers-reduced-motion` dihormati.
- [ ] Nominal: tabular-nums, rata kanan, format id-ID, mata uang eksplisit, negatif jelas (merah **dan** tanda/kurung).
- [ ] **Nilai tak diketahui kosong atau "—", tak pernah 0**; baris yang dikecualikan dari total disebutkan sebagai catatan.
- [ ] Status pakai badge berteks (bukan warna saja).
- [ ] Form: label terlihat, validasi inline, helper text, progressive disclosure.
- [ ] Responsive: 375 / 768 / 1024 / 1440px; tidak ada horizontal scroll di mobile (tabel menggeser DIRINYA).
- [ ] Judul & breadcrumb lewat `PageHeader` (bukan `<h1>` atau `Typography.Title level={1}` sendiri); label breadcrumb = label menu samping.
- [ ] Reuse komponen `src/components/ui`; warna & jarak dari token AntD (`var(--ant-...)` atau `theme.useToken()`), bukan nilai mentah.
- [ ] **Dilihat di tema TERANG dan GELAP** - lihat jebakan "dua bidang sewarna" di bagian Color Palette; melebur-nya sidebar `SIDER_BG_DARK` dengan permukaan gelap tidak terlihat dari kode.
- [ ] Nama produk & versi lewat `APP_NAME` / `APP_VERSION` (`src/lib/constants.ts`), lambang lewat `BrandMark` — bukan literal.
- [ ] Tabel lewat `StaticTable` (bawaan) / `DataTable` (hanya bila butuh sortir-filter seketika) + `MoneyCell`; tombol lewat `Button` (ikon = `size="icon"`). **Tombol-tautan: `<ButtonLink href>` untuk rute di dalam app** (satu `<a>`, navigasi sisi-klien + prefetch, #289), `<Button href>` untuk tautan keluar / `download` / pemuatan penuh yang disengaja — **tidak pernah `<Link><Button/></Link>`** (dua elemen interaktif bersarang: HTML tak sah, pembaca layar mengumumkannya dua kali), dan `asChild` sudah dicabut (#250).
- [ ] **Hitung tombol berisi penuh di layar jadi — termasuk yang lahir dari `.map()`, dari komponen lain, dan dari kolom tabel. Satu, atau nol.** `variant` ditulis eksplisit di SETIAP `<Button>`; bawaannya `secondary`, jadi penekanan tinggi harus diminta (`variant="primary"`) — dan tombol yang variannya lupa ditulis tidak akan tampak salah, ia hanya diam-diam kehilangan penekanannya. §Aksi utama per layar.
- [ ] **Nol `className`.** Tidak ada lembar gaya yang memaknainya sejak #203; sebuah kelas tidak gagal, ia hanya berhenti berlaku. Gaya ditulis sebaris, dan yang tak punya bentuk sebaris (`:hover`, `::after`, `@media`) hidup di satu `<style href precedence>` di komponennya - pola `landing-scale.ts` / `ui/table.tsx`.
- [ ] Empty state bermakna + aksi.
- [ ] **`bun run verify` hijau DAN `bun run build` `EXIT=0`** — yang pertama tidak membuktikan yang kedua, lihat §Penjaga.
