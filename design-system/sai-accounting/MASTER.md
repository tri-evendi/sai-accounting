# Design System Master File — SAI Accounting

> **LOGIC:** Saat membangun halaman tertentu, cek dulu `design-system/sai-accounting/pages/[page-name].md`.
> Jika ada, aturannya meng-override berkas ini. Jika tidak, ikuti aturan di bawah.

> **Catatan kurasi:** Dasarnya dihasilkan skill `ui-ux-pro-max` (kategori *Financial Dashboard*), lalu dikurasi manual untuk konteks aplikasi akuntansi internal bagi pengguna awam, bukan landing page. Pilihan flashy (dark-default, exaggerated minimalism, pola landing/CTA) sengaja ditolak. Untuk pendalaman per dimensi, jalankan:
> `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs`

**Project:** SAI Accounting — ERP/pembukuan internal (trading/ekspor komoditas)
**Prinsip:** *Simple surface, standard engine*: tampilan tenang dan mudah untuk staf amatir; integritas akuntansi tetap baku.
**Stack:** Next.js 16 (App Router) · **Ant Design v6** (`ConfigProvider` + CSS-in-JS) di `@sai/ui` (`packages/ui/src/components`; lima pembungkus yang bergantung pada aplikasi tetap di `src/components/ui`) · form `react-hook-form` + `zod` · tabel `StaticTable` (server, bawaan) / `DataTable` (AntD, client, hanya bila butuh sortir-filter seketika) · ikon `@ant-design/icons` (issue #201) · chart `recharts`. Tanpa Tailwind dan tanpa lembar kelas sejak issue #203: gaya ditulis sebaris (`style={{...}}`), warnanya `var(--ant-...)` atau `theme.useToken()`, dan nilai warna mentah (hex, `rgb()`, nama warna CSS) tidak ditulis di luar `packages/ui/src/theme/antd-tokens.ts`. Aturan itu dijaga ESLint `sai/warna-token-antd` (issue #204). `radix-ui` hanya tersisa untuk `Slot` di `FormControl`.
**Dials:** Variance 3/10 (minimal, profesional) · Motion 2/10 (halus) · Density 6/10 (nyaman untuk data, tidak sesak).

---

## Prinsip Inti (khusus app akuntansi ramah-amatir)

> Butir-butir ini aturan akuntansi, bukan aturan pustaka. Kalau pustakanya
> berganti, bagian ini ikut pindah tanpa berubah.

1. **Light-first**, tenang, kontras tinggi. Sidebar gelap sebagai aksen. Dark mode tersedia (Terang / Gelap / Ikut sistem di menu akun dan di layar pra-aplikasi), tetapi bawaannya terang: `DEFAULT_THEME` di `packages/ui/src/theme/config.ts` adalah `light`. Menjadikannya `system` berarti pengguna ber-OS gelap membuka aplikasi dalam mode yang belum ditinjau per halaman.
2. **Semantik warna uang**: hijau = uang masuk/lunas/positif; merah = uang keluar/jatuh tempo/negatif; biru = merek/aksi netral; amber = menunggu/peringatan. Jangan mengandalkan warna saja; selalu sertakan tanda (+/−), label, atau ikon. Sekitar satu dari dua belas pembaca laki-laki tidak membedakan merah-hijau, dan baginya dua angka di kolom "Saldo" terlihat sama.
3. **Angka rapi dan jujur**: `font-variant-numeric: tabular-nums`, rata kanan di tabel, format `id-ID` (mis. `Rp 1.234.567`), nilai negatif merah dengan `(...)` atau tanda minus. Tampilkan mata uang secara eksplisit (IDR/USD/CNY); di aplikasi ekspor, angka tanpa mata uang bisa terbaca tujuh belas ribu kali lebih besar.
4. **Nilai yang tidak diketahui ditulis kosong atau "—", tak pernah 0.** Contohnya dokumen valas tanpa kurs, barang tanpa dasar biaya, dan umur piutang tanpa tanggal jatuh tempo. Nol berarti "tidak ada nilai", sedangkan yang benar adalah "nilainya belum diketahui"; menjumlahkannya sebagai nol menyusutkan total tanpa tanda di layar. Jumlah baris yang dikecualikan selalu disebutkan sebagai catatan di bawah tabel. Aturan ini berasal dari Piutang/Utang dan Nilai Persediaan, dan dijaga `tests/money-unknown.test.tsx`.
5. **Ramah amatir**: label bahasa tugas (lihat issue #1), target sentuh ≥ 40px, teks dasar 16px, hindari jargon di permukaan (tooltip untuk istilah akuntansi).
6. **Reuse, jangan fork**: pakai dan perluas komponen di `@sai/ui` (`packages/ui/src/components`: button, card, input, badge, dll.). Jangan membuat varian baru tanpa alasan.

---

## Color Palette (light-first) - token **Ant Design**, satu lapisan saja

Warna datang dari satu tempat: token `ConfigProvider` Ant Design, ditambah
beberapa token kustom hasil pengukuran kontras. Tidak ada palet kedua
(variabel CSS sendiri atau kelas utilitas).

- **Sumber angka:** `packages/ui/src/theme/antd-tokens.ts`. Setiap hex ditulis
  di sana beserta rasio kontrasnya, dan `tests/antd-tokens.test.ts` serta
  `tests/antd-css-var-ssr.test.tsx` menghitung ulang angka itu dari paket
  `antd` yang terpasang setiap kali suite berjalan. Tabel warna tidak disalin
  ke berkas ini, karena salinan yang tidak diuji akan berselisih pada versi
  AntD berikutnya.
- **Cara memakai:** `style={{ color: "var(--ant-color-text-secondary)" }}`,
  atau `theme.useToken()` bila nilainya perlu dihitung. Nama variabel = nama
  token dalam kebab-case ber-prefix `--ant-`.
- **Identitas merek: navy institusional**, bukan biru bawaan AntD (`#1677ff`
  terbaca sebagai warna *framework*).

  Warna merek punya tiga peran, dan ketiganya token terpisah. Di tema terang
  nilainya berdekatan; di tema gelap berbeda, dan menyatukannya mematahkan
  salah satu peran:

  | Token | Peran | TERANG | GELAP |
  |---|---|---|---|
  | `colorPrimary` | teks, aksen, cincin fokus | `#1E3A5F` | dirender `#6f99c5` |
  | `colorBrandSolid` | isian DI BELAKANG teks terang (lambang, avatar) | `#1E3A5F` | `#2F6FBF` |
  | `colorBrandTone` | bibit nada permukaan (pita & chip) | `#2F6FBF` | `#2F6FBF` |

  `colorPrimary` sebagai isian di belakang teks putih terukur gagal di tema
  gelap (2,98:1); karena itu `colorBrandSolid` ada. Angka dan alasan lengkapnya
  di `packages/ui/src/theme/antd-tokens.ts`.

### Peta peran -> token

| Peran | Token |
|-------|-------|
| Latar halaman | `colorBgLayout` |
| Permukaan kartu / tabel | `colorBgContainer` |
| Permukaan melayang (modal, popover) | `colorBgElevated` |
| Teks utama | `colorText` |
| Teks penjelas / label kolom | `colorTextSecondary` |
| Kisi tabel & tepi kartu | `colorBorderSecondary` (#208) |
| Batas control (`Input`, `Select`) | `colorBorder` (#208) |
| Garis pemisah dekoratif (`Divider`) | `colorSplit` (#208) |
| Cincin fokus papan ketik | `colorPrimaryBorder` (#187) |
| Tautan & teks merek | `colorLink` / `colorBrandText` (#186) |
| Permukaan gelap permanen (sidebar, panel merek) | `Layout.Sider theme="dark"` (`#001529`) |

### Warna uang & status - token kustom, dan alasannya aritmetika

Anak tangga ke-6 palet AntD (`colorSuccess` `#52c41a`, `colorWarning` `#faad14`,
`colorError` `#ff4d4f`) dirancang untuk isian dan ikon, bukan teks 14px.
Terukur 2,27:1 · 1,90:1 · 3,27:1 di tema terang; semuanya gagal 4,5:1. Peran
teks karena itu memakai anak tangga yang lebih jauh dari latar, diambil dari
palet AntD sendiri (green-8 / red-8 / gold-9 / blue-7):

| Peran | Token |
|-------|-------|
| Uang masuk / saldo positif / lunas | `colorMoneyPositive` |
| Uang keluar / saldo negatif / jatuh tempo | `colorMoneyNegative` |
| Menunggu / sebagian | `colorMoneyPending` |
| Informasional | `colorMoneyInfo` |

Keempatnya juga dipakai sebagai warna teks `Tag` (issue #187) dan warna teks
error formulir. `colorSuccess`/`colorWarning`/`colorError` bawaan tetap dipakai
untuk isian pekat, ikon berlatar, dan `Progress`; di sana ambangnya 3:1
non-teks.

Warna tidak pernah menjadi penanda tunggal (badge wajib berteks, angka negatif
wajib bertanda minus), dan kolom uang berwarna memakai token uang di atas,
bukan `colorSuccess` bawaan.

### Ambang kontras per ukuran teks

WCAG membedakan teks besar dan teks biasa, dan sebagian besar teks aplikasi ini
masuk kategori yang ketat:

| Yang diwarnai | Ambang | Contoh di app ini |
|---|---|---|
| Teks < 18,66px, atau < 24px bila tidak tebal | **4,5:1** | seluruh isi tabel (`fontSize` 14px), label, teks bantuan, teks `Tag` |
| Teks >= 24px, atau >= 18,66px **bold** | **3:1** | angka besar kartu KPI (`fontSizeHeading*`) |
| Grafis non-teks: ikon, batas control, cincin fokus, bilah chart | **3:1** | `colorBorder`, `colorBorderSecondary`, `colorPrimaryBorder` |
| Teks nonaktif & batas control nonaktif | dikecualikan | `colorTextDisabled`, `colorBorderDisabled` — memang harus terlihat mati |

Baris pertama itulah yang membuat anak tangga ke-6 gagal sebagai teks 14px
(`colorSuccess` 2,27:1 · `colorWarning` 1,90:1 · `colorError` 3,27:1). Sebagai
ikon atau isian yang tidak memikul apa pun ketiganya lolos, dan di situ mereka
tetap dipakai.

Isian pekat tidak otomatis cukup memakai ambang 3:1. Isian yang memikul teks
14px (tombol berisian) tetap terikat baris pertama: label putih di atas
`colorError` bawaan hanya 3,27:1 (terang) / 4,24:1 (gelap) (#219). Isian tombol
harus lolos dua ambang sekaligus: label ≥ 4,5:1 dan isian vs latar ≥ 3:1.
Nilainya di `dangerButtonTokens` / `primaryButtonTokens`, lingkupnya
`components.Button` saja.

Ambang ini juga berlaku di dalam SVG. Recharts menyalin warna seri ke label
irisan dan baris tooltip, jadi `fill` yang sah sebagai bilah (3:1) muncul
sebagai teks 12px di grafik yang sama. Karena itu `dashboard-charts.tsx`
mengambil palet dari `moneyPalette()` (token teks), bukan dari
`colorSuccess`/`colorError`; dijaga `tests/chart-tokens.test.tsx`.

### Jenjang permukaan: kenapa latar halaman tidak bisa lebih gelap (issue #266)

Pemilik mengeluhkan aplikasi terbaca "dominan putih-hitam dengan outline saja".
Keluhan itu terukur: latar halaman dan kartu hampir sewarna, sehingga wilayah
hanya dipisahkan tepinya.

| Tema | halaman `colorBgLayout` | kartu `colorBgContainer` | melayang `colorBgElevated` | kartu vs halaman | ΔL\* |
|---|---|---|---|---|---|
| terang | `#f5f5f5` | `#ffffff` | `#ffffff` | 1,09:1 | 3,46 |
| gelap | `#000000` | `#141414` | `#1f1f1f` | 1,14:1 | 6,32 |

Ketiganya tetap bawaan AntD, setelah diukur. Ada dua batas:

- **Terang: tepi kartu #208 membatasi setiap bidang di `#f2f2f2`.**
  `colorBorderSecondary` (`#8c8c8c`) berada di antara kartu putih dan halaman,
  jadi harus lolos 3:1 terhadap keduanya, dan sisi halaman habis lebih dulu.
  Permukaan tergelap yang masih lolos: `#f2f2f2` (tepi kartu) · `#e7e7e7`
  (uang-positif) · `#e1e1e1` (batas control). `#f2f2f2` hanya menambah ΔL\*
  1,05 sambil menghabiskan seluruh margin ambang 3:1. Anak tangga netral AntD
  berikutnya (`#f0f0f0` α 0,06 · `#d9d9d9` α 0,15) gagal: 2,95:1 dan 2,38:1
  pada tepi kartu, dan `#d9d9d9` menurunkan angka hijau ke 3,96:1.
- **Gelap: `colorMoneyInfo` #186 membatasi permukaan melayang.** Permukaan gelap
  paling terang yang masih lolos adalah `#212121`, tiga satuan RGB dari
  `colorBgElevated` sekarang. Warna itu juga `colorLink`, jadi yang terdampak
  adalah setiap tautan. Akibatnya temuan tirai #205 (panel dialog vs halaman
  bertirai, 1,27:1) tidak bisa diperbaiki di lapisan token: menaikkan panel
  menurunkan kontras tautan, dan menggelapkan `colorBgMask` tidak berpengaruh
  karena halaman gelap sudah `#000000`.

Ada satu susunan yang lolos semua ambang: latar `#f0f0f0` bersama kisi naik ke
grey-4 dan control ke grey-5 (tidak ada pasangan yang turun; kisi 3,08 → 3,47).
Susunan itu ditolak karena menggelapkan setiap garis demi menambah ΔL\* 1,74,
berlawanan dengan arah keluhan. #208 menaikkan kisi dari 1,05:1 (bawaan AntD)
ke 3,08:1 dan itu tidak boleh dibalik. Konsekuensinya, garis itulah yang paling
menonjol di layar, dan garis itu juga yang membatasi setiap bidang ke rentang
3,5% antara `#ffffff` dan `#f2f2f2`. #208 dan #266 terhubung lewat satu angka.

### Jalan yang diambil: jenjangnya dikerjakan di PERENDER (issue #266)

Karena lapisan token tidak bisa diubah, jenjang dibuat di dalam bidang yang
sudah ada, dengan nilai yang menurut konstruksinya tidak mengubah kontras apa pun.

| Yang ditambahkan | Di mana | Nilai |
|---|---|---|
| Bayangan kartu | `packages/ui/src/components/card.tsx` | `--ant-box-shadow-tertiary` |
| Nada kepala tabel | `packages/ui/src/components/table.tsx` **dan** `components.Table.headerBg` | terang `#f5f5f5` · gelap `#1f1f1f` |

- **Nadanya bukan warna baru.** Terang `#f5f5f5` = `colorBgLayout`; gelap
  `#1f1f1f` = `colorBgElevated`. Keduanya anggota `SURFACES`, jadi setiap angka
  "min" di `antd-tokens.ts` sudah diukur di atasnya. Terukur di atas nada:
  judul kolom & tautan sortir 6,76 / 7,65 · hover 15,39 / 12,18 · penanda urut
  3,62 / 3,89 · kisi 3,08 / 3,05 (terang/gelap).
- **Arahnya ditentukan #208.** Tema terang tidak punya apa pun di atas `#ffffff`
  sehingga harus turun, dan berhenti di `#f2f2f2`. Tema gelap boleh naik sampai
  `#202020`; `#1f1f1f` satu satuan di bawahnya, nada paling terang yang boleh
  dipakai.
- **`Table.headerBg` saja tidak cukup**: ia hanya mengenai `DataTable`, sedangkan
  `StaticTable` menggambar sel judulnya sendiri. Karena itu nadanya berupa alias
  global `colorTableHeadBg` (`var(--ant-color-table-head-bg)`), sebab variabel
  token komponen tidak ada di dokumen bila komponennya tidak dirender.
  `AntdProvider` mengoper nilai yang sama ke keduanya. `headerColor` disamakan
  ke `colorTextSecondary`.
- **Sel judul lengket memakai latar yang sama** (#229). Bila tidak, kepala
  berganti warna saat menempel, misalnya ketika matriks izin digulung.
- **Penanda urut nonaktif (#265) memakai `colorBorder`, bukan
  `colorTextQuaternary`.** Kuartener terukur 1,83:1 di atas putih, di bawah
  ambang 3:1 grafis non-teks, padahal ia satu-satunya isyarat bahwa kolom bisa
  diurutkan.
- **Pita baris tidak dipakai** (butir 3 issue #266): `rowStyle` sudah dipakai
  /approvals untuk menandai keputusan yang belum dibaca, dan pita bawaan akan
  mengubah artinya menjadi "baris genap".
- **Tema gelap:** algoritma AntD membalik bayangan menjadi terang
  (`boxShadowTertiary` gelap = `rgba(255,255,255,0.01)`), jadi bayangan kartu
  hanya bekerja di tema terang. Di tema gelap kartu dipisahkan dari halaman oleh
  tepinya (3,05:1 sejak #208) dan nada kepala di dalamnya.

Semua angka di atas dihitung ulang setiap kali suite berjalan:
`tests/antd-tokens.test.ts` → "jenjang perender (#266)".

### Permukaan bersarang: isian, bukan kartu kedua (#266, ditegakkan Okt 2026)

Bayangan `boxShadowTertiary` pada `@sai/ui/card` hanya mengenai kotak yang
dirender `Card`. Kotak yang digambar tangan dengan resep yang sama
(`colorBgContainer` + `colorBorderSecondary` + `borderRadiusLG`) mengikuti
tabel ini:

| Kotaknya | Resep yang benar |
|---|---|
| **berdiri di atas latar halaman** | tepi + `--ant-box-shadow-tertiary` — sama dengan `Card` |
| **bersarang DI DALAM kartu** | `--ant-color-fill-quaternary`, **tanpa tepi** |
| **bagian dari GAMBAR** (diagram) | tepi saja, tanpa angkat — terdaftar di guard |

Baris kedua paling sering terlewat. Kotak bersarang yang memakai
`colorBgContainer` sewarna dengan kartu penampungnya, sehingga hanya dipisahkan
garis di dalam wilayah yang sudah bergaris. Acuan: rantai dokumen di
`/contracts/[id]`, kelompok isian di `/suppliers/[id]`, kisi fakta konsol
`/tenants/[id]`. Dijaga `tests/card-surface.test.ts`.

### Token AntD di server component: `var(--ant-…)`, di mana pun (issue #227)

Server component boleh memakai warna token tanpa menjadi client. `AntdProvider` memberi `cssVar` kunci tetap (`ANTD_CSS_VAR_KEY` di `packages/ui/src/theme/antd-tokens.ts`), dan `RootDocument` (`packages/ui/src/providers/root-document.tsx`) memasang kunci itu sebagai kelas di `<html>`. Blok `.sai-tokens{--ant-…}` karena itu ada di `<head>` sejak HTML pertama dan diwarisi seluruh dokumen, termasuk pohon tanpa komponen AntD di atasnya.

- **Bentuk:** `style={{ color: "var(--ant-color-text-secondary)" }}`. Nama variabel = nama token dalam kebab-case ber-prefix `--ant-` (`colorMoneyPositive` → `--ant-color-money-positive`), termasuk token kustom #186/#207/#208. Nilai jarak sudah membawa satuan (`--ant-padding` = `16px`).
- **`theme.useToken()` hanya bila nilainya dibutuhkan** (menghitung, membandingkan, meneruskan ke pustaka chart). Memanggilnya hanya demi warna menjadikan berkas `"use client"` tanpa manfaat; `tests/rsc-boundary.test.ts` mengunci jumlahnya.
- **Pergantian tema:** kedua tema memakai selektor yang sama, jadi toggle menimpa isi blok, bukan menambah blok kedua. Server component ikut berganti warna tanpa dirender ulang.
- Warna tetap tidak boleh menjadi penanda tunggal, dan ambang kontras tidak berubah. Bukti SSR-nya di `tests/antd-css-var-ssr.test.tsx`.

*Dark mode:* algoritma gelap AntD, dipilih `AntdProvider` dari cookie yang dibaca root layout di server, sehingga blok token yang benar ikut pada HTML pertama tanpa kedipan sebelum hydrate. Semantik warna dan ambang kontras sama di kedua tema; nilai gelap ditulis di sebelah nilai terangnya di `antd-tokens.ts`.

> **Pengecualian tertulis (#219):** isian tombol destruktif di tema gelap sengaja gagal ambang 3:1 "isian vs latar" (2,69:1) agar labelnya tetap 6,13:1; di tema terang keduanya lolos. Alasannya di §Aksi destruktif. Baca bagian itu sebelum menyeragamkannya.

Satu kekurangan yang diketahui: pilihan "ikut sistem". Preferensi OS tidak terlihat dari server, jadi HTML pertama selalu membawa token terang. Sebelum cat pertama, skrip sinkron di `<head>` memasang kelas `.dark`, dan dua variabel di `packages/ui/src/globals.css` yang terikat pada kelas itu (latar halaman dan warna teks) mengoreksinya. Token lainnya baru benar setelah hydrate.

**Dua bidang sewarna:** di tema gelap, sidebar `#001529` dan `colorBgContainer` `#141414` berkontras 1,00:1, tidak bisa dibedakan secara luminansi; `colorBgLayout` gelap `#000000` berjarak 1,14:1 dari sider. Batas antar-bidang yang sewarna wajib punya `border` dengan warna `colorBorderSecondary` (3:1, dinaikkan di #208). Jangan `colorSplit`: #208 sengaja menahannya di bawah 3:1 sebagai pemisah dekoratif, dan di atas sider ia hanya 2,67:1. Ketiga shell gelap (`sidebar.tsx`, `auth-shell.tsx`, `platform-shell.tsx`) dikunci pada token yang benar oleh `tests/antd-tokens.test.ts`. Kartu berdiri di atas `colorBgLayout`, bukan di atas isian abu-abu lain. Tinjau UI baru di kedua tema sebelum diserahkan.

**Permukaan gelap permanen memakai nilai gelap di kedua tema.** Sider, panel merek layar masuk, dan menu konsol tenant tidak berganti warna, jadi elemen di atasnya diambil dari tabel gelap (`SIDER_BG_DARK`, `BORDER_TOKENS_DARK`, `PRIMARY_BUTTON_DARK`), bukan dari `…Tokens(resolved)`. Perhatikan bahwa token AntD ber-prefix "dark" (mis. `Menu.darkItemSelectedBg`) tetap mengambil `colorPrimary` dari tema yang sedang berlaku; tanpa nilai gelap sendiri, label putih butir menu terpilih di tema terang jatuh di bawah 4,5:1.

---

## Typography

- **UI / heading & body:** Inter lewat `next/font`, dipasang sebagai variabel di `<html>`. Heading tidak memakai monospace.
- **Angka/nominal:** `font-variant-numeric: tabular-nums` (didukung Inter) agar digit sejajar di tabel dan laporan. `Money`/`MoneyCell` sudah membawanya; jangan memformat angka sendiri.
- **Skala dasar 16px.** Ini aturan app ini; `fontSize` bawaan AntD 14px. Nilainya dijaga `packages/ui/src/globals.css`. Ancamannya elemen `.ant-app`, sehingga `<App>` di `AntdProvider` dipasang `component={false}` agar merender `Fragment`, bukan `<div>` bergaya. Menggantinya dengan `component="div"` demi menghilangkan satu peringatan dev menurunkan teks dasar seluruh aplikasi ke 14px dan mengganti Inter dengan font sistem AntD, tanpa satu berkas halaman pun berubah.
- Hierarki lewat token, bukan angka: `--ant-font-size-heading-1` … `-5` = 38 · 30 · 24 · 20 · 16px, isi 14px (`--ant-font-size`), keterangan 12px (`--ant-font-size-sm`). Batas atas app internal adalah `fontSizeHeading1`, dan hanya `PageHeader` yang memakainya (lihat §Pemasaran vs App).
- Teks < 14px dilarang untuk data. 12px hanya untuk keterangan yang mengulang informasi yang sudah ada di tempat lain.

---

## Jarak, radius, bayangan — token AntD, tidak ada lapisan kedua

Skala AntD adalah satu-satunya skala; dua skala berdampingan menghasilkan dua
jawaban untuk jarak yang sama.

Nilainya berkelipatan 4px (`sizeUnit`/`sizeStep`), dan variabelnya sudah
membawa satuan (`--ant-padding` = `16px`, jadi ditulis apa adanya, bukan `${}px`):

| Peran | Token | Nilai |
|---|---|---|
| Celah rapat (ikon–teks) | `--ant-margin-xxs` / `--ant-padding-xxs` | 4px |
| Inline, antar-aksi ikon | `--ant-margin-xs` | 8px |
| Padding control & sel tabel (vertikal) | `--ant-padding-sm` | 12px |
| Padding standar, gap grid | `--ant-padding` / `--ant-margin` | 16px |
| Padding kartu, jarak antar-bagian (Density 6/10) | `--ant-padding-lg` / `--ant-margin-lg` | 24px |
| Gap besar | `--ant-margin-xl` | 32px |
| Jarak antar-seksi besar | `--ant-margin-xxl` | 48px |

Prop yang menuntut angka (mis. `gap` milik `<Flex>`/`<Space>`, bertipe
`number`, tempat variabel CSS tidak berlaku) mengambil nilainya dari
`packages/ui/src/layout-scale.ts`. Anak tangganya dinamai menurut token
(`SPACE_MD` = `margin` = 16), ditambah tiga peran yang dipakai banyak halaman
(`SECTION_GAP`, `CARD_GAP`, `INLINE_GAP`); jangan menulisnya sebagai angka
telanjang. `tests/layout-scale.test.ts` membandingkan setiap anak tangga dengan
token AntD yang terpasang, karena berkas itu satu-satunya salinan nilai token di
repo.

Radius: `--ant-border-radius` 6px (control & kartu) · `--ant-border-radius-lg`
8px (permukaan besar) · `--ant-border-radius-sm` 4px (balok kerangka, tag).

Bayangan: `--ant-box-shadow-tertiary` (lift halus) · `--ant-box-shadow-card` ·
`--ant-box-shadow` (melayang: modal, dropdown, popover). Jangan menulis
`box-shadow` sendiri; nilainya berlapis tiga dan disetel per algoritma tema.

**Tinggi control datang dari satu token:** `controlHeight: 40` di
`AntdProvider` (target sentuh minimum; bawaan AntD 32px). Button, Input,
Select, dan DatePicker ikut naik. `size="sm"` adalah turunan
(`controlHeight × 0,75` = 30px), jadi bukan target sentuh utama.

### Satu baris control = satu ukuran

Dua ukuran control dalam satu baris adalah cacat. Selisih 40px dan 30px pada
baris yang disejajarkan (`alignItems: "flex-end"`, `align="center"`, `<Row>`)
membuat garis dasar patah: satu control menggantung di atas tetangganya dan
terbaca sebagai render yang gagal.

Aturannya berlaku per baris. Setiap control yang berdampingan mendatar
(`Button`, `ButtonLink`, `Input`/`TextInput`, `Select`/`SelectField`,
`MoneyInput`, `PasswordField`, `Textarea`, kedua isian berpencarian) memakai
ukuran yang sama.

Bila satu baris campur, ukuran bawaan yang dipakai. Naikkan tombolnya (hapus
`size="sm"`); jangan mengecilkan isian di sebelahnya, karena itu menurunkan
beberapa target sentuh demi satu tombol.

`size="sm"` sah di tempat yang seluruh barisnya kecil dan bukan target sentuh
utama:

- aksi di dalam baris tabel (Ubah/Hapus per baris), tanpa isian 40px di
  sebelahnya;
- grup chip saringan yang berdiri di barisnya sendiri (`/invoices`,
  `stock-period-filter.tsx`); baris isian di bawahnya punya ukurannya sendiri;
- kaki dialog dan panel padat, selama tidak ada isian berukuran bawaan di baris
  yang sama.

`size="sm"` tidak sah di baris saringan/pencarian yang berdampingan dengan
`Select`/`Input`. Contoh yang dilaporkan pemilik: `/finance`, empat
`SelectField` 40px di sebelah tombol "Filter" 30px. Tombol kirim yang melebar
penuh di bawah tumpukan isian (layar auth: `size="lg"` + `width: 100%`) tidak
berbagi garis dasar dengan isian, jadi berada di luar aturan ini.

Aturan ini mengatur ukuran, bukan `variant`. Hierarki aksi utama (#267) tetap:
tombol saringan `outline`, aksi sampingan `secondary`. Dijaga
`tests/control-size-row.test.ts`; batas cakupannya ditulis di kepala berkas itu.

---

## Kepala Halaman & Breadcrumb (wajib)

Semua halaman dashboard memakai `PageHeader` (`packages/ui/src/components/page-header.tsx`). Jangan menulis `<h1>` atau memanggil `<Breadcrumb>` sendiri (dijaga `tests/page-header.test.ts`).

- **Halaman tingkat-1** (item menu samping): tanpa `breadcrumbs`; `title` sama persis dengan label menunya (boleh membawa jumlah, mis. "Pelanggan (12)"); tombol utama lewat `actions`.
- **Halaman di bawahnya** (baru / ubah / rincian): `breadcrumbs` dimulai dari label menu induk, dengan kata yang sama seperti menu samping (mis. "Tagihan Penjualan", bukan "Invoices"). Item terakhir (tanpa `href`) adalah halaman ini.
- Badge status di samping judul lewat `badge`; kalimat penjelas lewat `description`.

## Orientasi Perusahaan (chrome, wajib — issue #104)

Buku besar tiap PT ada di basis datanya sendiri, jadi pengguna harus selalu tahu buku mana yang sedang ia tulis. Pencatatan ke PT yang salah tidak menimbulkan error; ia baru terlihat berbulan-bulan kemudian sebagai neraca yang tidak cocok.

- **Nama perusahaan aktif selalu terlihat di top bar** (`CompanyIndicator`) di semua ukuran layar, tanpa membuka menu. Namanya dibawa sesi (`session.user.companyName`), bukan diambil lewat permintaan, sehingga hadir pada render pertama.
- Penanda itu untuk orientasi, bukan control. Pergantian perusahaan ada di menu avatar dan hanya muncul bila pengguna memegang lebih dari satu PT.
- Di layar sempit, yang menyempit adalah namanya (truncate + `title`), bukan target sentuh aksi di sebelah kanan.
- **Identitas yang dicetak** (kop faktur/kontrak/surat jalan) diambil berurutan: setting perusahaan → nama di registry control → konstanta. Jangan memundurkannya ke konstanta lebih awal: konstanta berisi nama pemasang pertama, dan mencetaknya di dokumen PT lain menghasilkan surat dengan badan hukum yang salah.
- Layar pra-aplikasi (`/select-company`, `/setup-required`, `/feature-inactive`) wajib punya jalan keluar: tombol keluar atau tautan kembali. Tanpa itu, orang yang aksesnya baru dicabut tidak bisa ke mana-mana.

## Pola Komponen (khusus domain)
- **Kartu KPI dashboard**: judul bahasa awam + angka besar tabular + delta berwarna (hijau/merah) dengan tanda +/−; sub-teks periode.
- **Tabel transaksi**: kolom nominal rata kanan + tabular-nums; kolom status memakai badge (Lunas=hijau, Sebagian=amber, Belum/Jatuh Tempo=merah) yang selalu berteks.
- **Form**: label terlihat (bukan placeholder), validasi inline dekat field, helper text, progressive disclosure ("Detail lengkap"). Tombol primer = aksi simpan.
- **Destruktif = merah + konfirmasi**, dan konfirmasi berarti `ConfirmDialog` (dijaga `tests/destructive-confirm.test.ts`, #308). Setiap `<Button>` yang bisa bernilai `danger`/`destructive` berpasangan dengan dialog, sebagai `trigger`-nya atau lewat bentuk terkendali (`open` + `onOpenChange`) di berkas yang sama. Pesannya menyebut akibatnya (apa yang hilang, jurnal apa yang terbentuk, apa yang tidak bisa dibalik), bukan "Anda yakin?". Formulir berisian bukan pengganti dialog: bila isiannya opsional, aksinya tetap berjarak satu klik.
- **Implementasi form:** `react-hook-form` + `zodResolver` dengan pola `Form` di `packages/ui/src/components/form.tsx` (RHF sebagai mesin, `Form.Item` AntD sebagai kulit; lihat "Konvensi Form"), bukan `useState` manual.
- **Empty state**: 1 kalimat + tombol aksi ("Belum ada faktur. Buat tagihan pertama →").
- **Uang/mata uang**: selalu tampilkan kode mata uang; konversi/kurs ditampilkan bila valas (konteks ekspor CNY/USD).

## Pusat Laporan: dialog parameter

Laporan tidak dibuka langsung dari kartunya. Menekan kartu membuka dialog parameter (`components/reports/report-launch-dialog.tsx`) yang menanyakan periode/saringan/kolom, lalu menawarkan tiga jalan: **Pratinjau** (halaman laporan), **Unduh PDF**, **Unduh Excel**. Membuka dengan periode bawaan berarti menghitung dan merender laporan yang salah, lalu menghitung ulang setelah saringan diubah.

- **Control dirender dari katalog**, tidak ditulis per laporan. `paramKind`, `filters`, `columns`, dan `payloadKind` di `lib/report-catalog.ts` adalah satu-satunya sumber bagi dialog, halaman, dan berkas ekspor.
- **`paramKind` menyatakan parameter yang benar-benar dibaca halaman tujuan**, bukan bentuk periode yang secara konsep cocok. Control yang isiannya diabaikan menyesatkan pengguna (tiga entri katalog pernah begitu).
- **Tombol unduh hanya muncul bila laporannya punya `payloadKind`.** Entri yang menunjuk halaman modul interaktif hanya menawarkan "Buka", dengan kalimat yang menjelaskan alasannya.
- **Pemilihan kolom hanya untuk laporan bertipe daftar.** Susunan Laba/Rugi, Neraca, dan Arus Kas ditentukan standar akuntansi, jadi centang kolom di sana tidak berguna. Kolom identitas baris selalu ikut (`fixed`), dan pilihan pengguna hanya boleh mengurangi kolom, tidak memunculkan kolom yang tidak ada isinya.
- **Satu penentu kolom untuk tiga permukaan** (`stockMovementColumns`, `partyRecapColumns`, `agingColumns`, `stockValueColumns`, `cashBankColumns` di `lib/statement-layout.ts`): layar, PDF, dan lembar sebar. Pratinjau harus memperlihatkan kolom yang sama dengan berkasnya.
- **Kartu menuju laporannya**, bukan halaman kerja atau hub. Halaman modul (`/inventory`, `/finance`) terpaginasi dan tersaring untuk bekerja; sepuluh baris pertama bukan laporan, dan totalnya akan salah. Hub (`/budget`) menambah satu klik. Laporan yang tidak punya view sendiri mendapat halaman di bawah `/reports`, dengan izin mengikuti datanya (`inventory.read`, `cash.read`); laporan tidak melonggarkan siapa yang boleh melihat isinya.
- **Nilai yang tidak diketahui ditulis kosong atau "—", tak pernah 0** (Prinsip Inti #4). Di Pusat Laporan aturan ini paling sering teruji: dokumen valas tanpa kurs dan barang tanpa dasar biaya masuk ke hampir setiap laporan nilai persediaan.

---

## Konvensi Form (issue #53)

Form ditulis dengan `react-hook-form` + `zodResolver` memakai pola `Form` (`packages/ui/src/components/form.tsx`). Contoh acuan: `src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/customers/new/customer-form.tsx` (master sederhana) dan `src/components/shared/payment-form.tsx` (transaksi valas).

1. **Satu skema zod, dua sisi.** Form wajib memakai skema yang sama dengan route handler, diimpor, tidak disalin. Bila server menambah field (mis. `invoiceId` dari URL), pisahkan field bersama sebagai objek yang dipakai ulang (contoh: `paymentFormFields` di `lib/validations/payment.ts`, dipakai `paymentFormSchema` di client dan `invoicePaymentSchema`/`contractPaymentSchema` di server). Client dan server tidak boleh bisa menyimpang.
2. **Pesan error lewat kunci kamus, ramah awam.** Skema menulis kunci bertipe, bukan kalimat: `z.string().min(1, vmsg("validation.dateRequired"))` (`@sai/core/i18n/validation`). Pesan zod ditetapkan saat modul dimuat sehingga tidak bisa berganti bahasa; pabrik `make…Schema(t)` melanggar aturan 1, dan `z.setErrorMap()` global membocorkan bahasa antar-permintaan yang berjalan bersamaan. Kalimatnya karena itu disusun di batas tampilan: `FormMessage` di client, `translateFieldErrors()` di route handler, `humanizeFieldMessage()` di jalur pesan API. Kunci salah ketik ditolak `tsc` (tipe `ValidationKey`); `tests/i18n-validation.test.tsx` menolak kalimat yang tertinggal di skema. Pesan yang membawa nominal memakai `vissue("…", { … })`: kunci dan nilainya dikirim sebagai `params` zod, tidak disisipkan ke teks pesan.

   Pola baku jawaban 400 di route handler (acuan: `src/app/api/invoices/route.ts`, `src/app/api/{invoices,contracts}/[id]/payments/route.ts`):

   ```ts
   if (!parsed.success) {
     const { dictionary, t } = await getRequestI18n();               // @sai/platform/i18n/server
     return NextResponse.json(
       {
         error: t("validation.invalidInput"),
         details: translateFieldErrors(parsed.error, dictionary),    // @sai/core/i18n/validation
       },
       { status: 400 }
     );
   }
   ```
3. **Struktur field:** `FormField` → `FormItem` → `FormLabel` + `FormControl` + `FormDescription?` + `FormMessage`. Pautan label–input–deskripsi–error (`aria-invalid`/`aria-describedby`/`role="alert"`) terpasang otomatis. Jangan memasang `aria-*` manual.

   Keempatnya berada di dalam `FormItem` yang sama, dan `FormItem` di dalam `FormField`, bukan sebaliknya (issue #262). `aria-describedby` hanya boleh menyebut id yang simpulnya dirender, dan `FormItem` memutuskannya saat render dari anak yang dilihatnya (fragment, array, dan elemen HTML biasa ikut ditelusuri). Isi di balik prop `render` sebuah `FormField` yang berada di dalam `FormItem` tidak terlihat dari sana, sehingga pautan deskripsinya hilang. Jangan menambal dengan `FormDescription` kosong, karena itu menambah simpul yang dibacakan tanpa isi. Bila sebuah panel tidak punya isian (mis. "kata sandi sudah tersimpan"), tulis dua bentuk `FormItem` yang berbeda.
4. **Isian di dalam `FormControl` harus telanjang**: `TextInput`/`SelectField`/`MoneyInput`, bukan `Input`/`Select` komposit (yang membawa label/error sendiri). `FormControl` (Radix `Slot`) meneruskan atribut ke anak tunggal, jadi anaknya harus satu elemen kontrol.

   `{...field}` tidak berlaku sama untuk ketiga isian pilihan. `SelectField` menerimanya utuh (`name` ikut, dan nilainya ikut `new FormData(form)`). `SearchableSelect`/`ServerSearchableSelect` menolak `name` di tipe; nilainya dibaca lewat `value`/`onChange` dan tidak ikut `FormData`. Tabel dan alasannya: §Primitif Wajib, "Keluarga isian pilihan".
5. **Nominal pakai `MoneyInput`**: tampil `1.234.567`, payload menerima angka bersih (`1234567`). Desimal 0 untuk IDR, 2 untuk valas.
6. **Progressive disclosure:** field bersyarat (mis. kurs untuk valas) hanya dirender saat relevan, dan skema hanya menuntutnya pada kondisi itu (`superRefine`).
7. **Server tetap guard terakhir.** Kegagalan validasi server dipetakan ke `form.setError` (ke field bila ada `fieldErrors`, atau ke `root`). Field yang tidak punya isian di layar (mis. `invoiceId` yang disuntik server) dilaporkan sebagai error formulir, bukan ditempel pada field yang tidak terlihat. Acuan: `applyPaymentServerErrors` di `payment-form.tsx`.

### Ant Design sebagai KULIT (keputusan issue #192)

`FormItem` dibangun di atas `Form.Item` AntD yang dipakai tanpa `Form` AntD: tanpa `name`, `rules`, atau `validateMessages`. Mesin formulirnya tetap react-hook-form + zod; AntD hanya memberi tata letak label, jarak, dan keadaan error. `Form` AntD dan `Form.useForm` tidak boleh dipakai di halaman mana pun, karena aturan validasi akan hidup di dua tempat dan aturan 1 batal. Dijaga `tests/ui-form-antd.test.tsx`.

Tiga akibat yang perlu diketahui sebelum menulis form baru:

- **Label ditulis sebagai anak** (`<FormLabel required>`), lalu diangkat `FormItem` menjadi prop `label` `Form.Item`, karena di AntD label adalah prop. Pengangkatan hanya menjangkau anak langsung; label di dalam `FormField` tetap dirender sebagai `<label htmlFor>` biasa di slot control. Keduanya benar.
- **Slot `help` AntD tidak dipakai.** Tanpa `name`, `Form.Item` baru merender daftar error-nya setelah `useLayoutEffect`, sehingga di render server pesannya hilang. Pesan validasi karena itu tetap `FormMessage` (`role="alert"`, warna `colorMoneyNegative` yang lolos AA; `colorError` AntD gagal 4,5:1 sebagai teks 14px).
- **Pautan ARIA tetap milik `FormControl`.** AntD hanya menyuntikkan `aria-*` di branch ber-`name`, yang tidak dipakai di sini. `FormControl` juga memasang `aria-required`, jadi isian wajib tidak hanya ditandai `*`.

Tanda wajib `*` digambar aplikasi ini di belakang teks label (sama seperti `Input`/`Select` komposit), bukan tanda bintang AntD yang digambar `::before` di depan label. Dua konvensi di layar yang sama terlihat sebagai cacat.

---

## Motion (Subtle)
- Transisi state 150–250ms `ease`. Hover halus (tanpa menggeser layout). Hormati `prefers-reduced-motion`.
- Hindari animasi dekoratif; animasi hanya untuk memberi makna (loading, perpindahan, feedback).

---

## Lambang produk

Geometri lambang hanya ada di `packages/ui/src/brand/mark.ts`. Tiga permukaan
membacanya: komponen `BrandMark`, kartu pratinjau sosial (`opengraph-image`),
dan generator ikon raster. Menyalin `<path>`-nya ke tempat keempat ditolak
`tests/brand-mark.test.ts`, karena salinan bisa menyimpang tanpa error.

- **Logo unggahan menimpa lambang bawaan tanpa rilis.** Operator mengunggahnya
  di konsol (`/brand`, izin `site.settings`; tabel `brand_assets` di
  `sai_platform`). Root layout kedua aplikasi membaca logo aktif (cache 60
  detik, fail-soft ke lambang bawaan) dan meneruskan alamatnya ke
  `RootDocument`, lalu `BrandMark` menampilkannya di kotak yang sama. Rute
  `/favicon.ico`, `/apple-icon.png`, manifest, dan `opengraph-image` ikut
  berganti. Jadi: **jangan pernah menggambar lambang tanpa `BrandMark`** —
  salinan SVG lokal tidak ikut berganti saat logonya diganti.
- **Ikon raster bawaan adalah turunan.** `bun run brand:icons` membangkitkan
  ikon manifest di `public/icons/` dari lambang yang sama. `favicon.ico` dan
  `apple-icon.png` tidak lagi berkas statis: keduanya rute (`brandIconResponse`)
  yang menyajikan logo unggahan atau menggambar lambang bawaan. Jangan
  menyunting PNG-nya; ubah lambangnya, jalankan skripnya, lalu komit hasilnya.
- **Warnanya satu: navy `#1E3A5F`** (`BRAND_SOLID_LIGHT`), peran "bidang merek
  di belakang isi terang", sama dengan tombol primer. `BRAND_HEX` (bilah status
  dan `theme_color` manifest) bernilai sama.
- **Lambang + nama memakai `BrandLockup`**, tidak disusun per chrome; susunan per
  chrome menyimpang dalam ukuran, celah, dan bobot.
  `packages/ui/src/components/brand-lockup.tsx` memegang tipografinya;
  pembungkusnya (`Link`, lebar, apakah nama disembunyikan di layar sempit) tetap
  milik masing-masing chrome. Dijaga `tests/brand-lockup.test.ts`, yang menolak
  `<BrandMark` di luar daftar izin pendek beralasan.
- **Uji lambang pada ukuran sebenarnya.** Rancangan lambang dinilai dengan
  merendernya di 16/20/24/32/64px lalu melihatnya. Empat alternatif gagal di
  tahap ini (dua buku bertumpuk, sudut terpotong, undak, garis halaman). Yang
  dipakai adalah bidang pejal dengan satu takik, dan takik itu harus ≥2,5 unit
  pada kanvas 24 unit agar tidak lebih kecil dari satu piksel di favicon.

## Logo perusahaan

Logo setiap PT diunggah pemilik PT sendiri di Pengaturan (kartu "Logo
perusahaan", izin `company_setting.manage`; tabel `company_logos` di buku PT
itu). Ia hanya muncul di DOKUMEN, tidak di chrome aplikasi: kepala PDF
memanggil `drawCompanyLogo` (`src/lib/pdf/company-header.ts`), yang menggambar
logo di kiri atas sejajar nama perusahaan. Dokumen tanpa logo identik dengan
sebelum fitur ini ada. Generator PDF baru wajib menerima `PdfCompany` dan
memanggil `drawCompanyLogo` tepat sesudah nama perusahaan.

## Ikon

Satu paket ikon: `@ant-design/icons`. `lucide-react` sudah dicabut; jangan
dipasang lagi, dan jangan menambah set ikon lain (emoji tetap terlarang). Dua set
ikon di satu layar terlihat sebagai cacat.

Varian yang dipakai adalah `…Outlined`. `…Filled` dan `…TwoTone` hanya dipakai
dengan alasan tertulis, karena isian pekat di antara ikon bergaris menarik
perhatian ke tempat yang tidak penting.

### Ukuran = `font-size`. Selalu. Tidak pernah kelas kotak.

SVG di dalam ikon AntD berukuran `1em`, dan pembungkusnya `<span>`:

| | |
|---|---|
| **Bawaan (mayoritas)** | **Jangan sebut ukuran.** Ikonnya mengikuti ukuran teks di sebelahnya: di dalam `Button`, `Menu`, `Tag`, atau paragraf, ia otomatis benar. |
| **Harus beda dari teksnya** (ikon empty state 48px, ikon kepala callout 20px) | `style={{ fontSize: 20 }}` — sekali, di tempat itu. |
| **JANGAN** | prop `size={16}`, atau `width`/`height` sebaris. |

Kedua larangan itu tidak menimbulkan error:
- Ukuran kotak (`width`/`height` sebaris) mengenai `<span>`, bukan
  `<svg width="1em">` di dalamnya. Ukurannya terpasang, tetapi ikonnya tidak
  berubah.
- `size={16}` lolos `tsc`: props ikon AntD turunan
  `React.HTMLProps<HTMLSpanElement>`, yang punya `size` (atribut HTML
  `<input>`/`<select>`). Ia menjadi atribut `size="16"` di `<span>` dan tidak
  mengatur apa pun.

Warna mengikuti jalur yang sama: `style={{ color: "var(--ant-color-text-secondary)" }}`,
bukan prop `color`. Ambangnya 3:1 (ikon adalah grafis non-teks), dan warna tidak
pernah menjadi penanda tunggal.

### Impor ikon SELALU bernama — `import { XOutlined } from "@ant-design/icons"`

Ini syarat build. Barrel paket itu memanggil `createContext` di tingkat modul
tanpa `"use client"`, sedangkan build React untuk server component tidak punya
`createContext`. Satu server component yang menyentuh barrel menggagalkan
seluruh `next build` dengan error yang menunjuk halaman acak (`Failed to
collect page data for /setup-required`). Karena itu `next.config.ts` menulis
ulang setiap impor bernama menjadi jalur di dalam paket, sehingga barrel tidak
pernah dimuat; ikonnya sendiri aman sebagai daun client. Penulisan ulang itu
hanya mengenali `{ … }`:

- BENAR: `import { PlusOutlined, SaveOutlined } from "@ant-design/icons";`
- JANGAN: `import Icon from "@ant-design/icons";` · JANGAN: `import * as Icons from "@ant-design/icons";`
- JANGAN: `IconProvider` / `getTwoToneColor` / `createFromIconfontCN` — bukan ikon, tidak
  punya berkasnya sendiri, dan lolos `tsc` sebelum menggagalkan build.

`tests/icon-rsc-boundary.test.ts` menolak ketiga bentuk itu; alasan lengkapnya di
komentar `modularizeImports` pada `next.config.ts`.

### Ikon dekoratif tetap `aria-hidden`

Ikon AntD merender `<span role="img" aria-label="…">`, yang dibacakan pembaca
layar secara bawaan. Ikon yang hanya mengulang teks di sebelahnya wajib
`aria-hidden="true"`; atribut itu diteruskan ke span dan mengalahkan
`aria-label` bawaan. Ikon yang menjadi satu-satunya isi tombol tidak diberi
`aria-hidden`; tombolnya yang diberi `aria-label`. Tidak ada tes untuk ini, dan
akibat kelalaiannya adalah menu yang dibacakan dua kali.

---

## Pemasaran vs App: batas dua dunia (issue #245)

Aplikasi ini punya dua permukaan yang tidak boleh saling meniru: halaman pendaratan publik `/` (dibaca orang yang belum punya akun) dan app internal (dipakai orang yang sudah masuk, delapan jam sehari). Keduanya memakai token AntD yang sama, jadi `fontSize: "var(--ant-font-size-heading-1)"` di halaman piutang dan di hero pendaratan terlihat sama. Karena itu batasnya dinyatakan dalam token dan dijaga tes (`tests/landing-boundary.test.ts`).

### Yang membuat sebuah halaman "pemasaran" — empat dimensi

| Dimensi | Pendaratan `/` | App internal |
|---|---|---|
| **Skala hero** | satu `<h1>` `--sai-landing-font-size-hero`: 30px → **≈42–49px** di ≥576px (fluid, `fontSizeHeading1 × 1,1–1,3`) | langit-langitnya `fontSizeHeading1` (38px) lewat `PageHeader`; tidak ada teks yang melampauinya |
| **Bobot CTA** | aksi yang SAMA diulang (bilah atas, hero, tiap kartu paket, penutup), `Button size="lg"`, primer + garis berpasangan, melebar penuh di layar sempit | aksi utama muncul **sekali**, di `PageHeader.actions` |
| **Irama antar-seksi** | `--sai-landing-rhythm` 64px → 96px | Density 6/10: 24px (`--ant-margin-lg`) antar-bagian |
| **Lebar maksimum** | kolom baca 42rem, seksi 72rem, **di tengah** | lebar penuh area kerja — tabel 12 kolom tidak dipotong demi ukuran baca |

### Pendaratan BOLEH punya token sendiri — sebagai turunan, dan berpagar

Pendaratan boleh punya token sendiri. Tanpa token, satu-satunya cara membuat hero di atas batas app adalah angka yang diketik di `style`, dan angka seperti itu bisa disalin ke mana saja tanpa jejak yang bisa dicari. Izin ini punya dua syarat:

1. **Setiap nilai adalah turunan token AntD**: `calc()` di atas `--ant-font-size-*`, `--ant-margin-*`, `--ant-padding-*`. Bila skala tipografi app berubah, skala pemasaran ikut berubah dan tidak menjadi tipografi kedua. Yang bukan turunan hanya tiga lebar baca (72/48/42rem) serta bobot/tracking display, karena app internal tidak punya token "kolom baca".
2. **Deklarasinya dibatasi pada `[data-landing]`**, bukan `:root`. Blok itu (`src/components/landing/landing-scale.ts`, dipasang `LandingShell`) hanya ada di dokumen yang merender komponen pendaratan. Menyalin `var(--sai-landing-font-size-hero)` ke halaman internal karena itu tidak menghasilkan hero: propertinya tidak teratasi, dan teks mewarisi ukuran induknya.

### Guard-nya (`tests/landing-boundary.test.ts`)

- **App internal tidak mengimpor apa pun dari `components/landing/**`.** Pintu masuknya halaman di `src/app/(marketing)/` (`/` dan `/pricing`, #399). Pintu baru berarti satu baris di `PINTU_MASUK` yang terlihat di diff.
- **Sebaliknya juga:** berkas pendaratan hanya boleh mengimpor `@sai/ui` / `@/components/ui`, `@sai/core` / `@/lib`, dan sesama berkas pendaratan. Halaman ini dibaca tanpa sesi, dan setiap impor ke app internal membuka jalan bagi kode ber-`auth()`/ber-Prisma ke permukaan publik.
- **`--sai-landing-` dan `data-landing` tidak boleh muncul di luar direktori itu**, dan akarnya dipasang tepat di satu berkas (`landing-shell.tsx`).
- **Blok skalanya tidak boleh dideklarasikan pada selektor global** (`:root`/`html`/`body`/`*`); pembatasan lingkup itulah yang membuat batas ini bekerja secara mekanis.

Dengan begitu, menyalin bentuk pemasaran ke halaman internal menjadi impor yang ditolak guard. Acuan halaman internal yang paling dekat dengan bentuk pemasaran: `app/(app)/(tenant)/(panel)/platform/billing/plans/page.tsx`, satu-satunya layar internal yang memajang daftar harga. Halaman itu sengaja tanpa hero dan tanpa kartu "paling populer", dan CTA-nya menyebut tindakannya ("Pilih paket ini"), bukan "Mulai sekarang".

### Permukaan KETIGA: `/platform`, dan bagaimana ia boleh berwarna tanpa menembus batas (issue #303)

`/platform` adalah panel tempat pelanggan membeli dan mengelola langganannya; ia bukan pendaratan dan bukan buku besar. Agar ia berwarna tanpa mengimpor `landing-scale.ts` (ditolak guard) atau menyalin resepnya ke berkas kedua (dua salinan akan menyimpang), yang dibagi adalah resepnya, bukan tokennya:

- `@sai/ui/theme/tone-recipe` (`packages/ui/src/theme/tone-recipe.ts`) netral terhadap permukaan. Ia tidak mendeklarasikan variabel CSS dan tidak mengenal halaman mana pun; isinya hanya bentuk `color-mix(in srgb, var(--ant-<hue>-6) N%, var(--ant-color-bg-*))` + peta peran→keluarga palet. `components/landing/**` sudah boleh mengimpor `@sai/ui/**`, jadi guard #245 tidak dilonggarkan.
- Setiap permukaan mendeklarasikan nadanya sendiri, dengan nama dan lingkup `data-*` sendiri: `--sai-landing-*` di `[data-landing]`, `--sai-platform-*` di `[data-platform]`. Nama variabel yang disalin ke permukaan lain tidak teratasi.
- **Kadarnya tidak dibagi.** Kadar campuran dibatasi tombol dan latar yang dipikul tiap permukaan: pendaratan `LANDING_MIX` (`landing-scale.ts`), `/platform` `PLATFORM_MIX` (`components/tenant/platform-tone.ts`, dibatasi tepi tombol garis di tema terang). Angka satu permukaan tidak berlaku untuk permukaan lain; rinciannya di `pages/landing.md` dan `pages/platform.md`.

Untuk permukaan berikutnya (mis. `/docs`, #300): ambil resepnya, ukur kadarnya sendiri, deklarasikan di lingkup `data-*` sendiri, dan tulis guard-nya sendiri.

---

## Dokumentasi `/docs`: permukaan KETIGA (issue #300)

`/docs` berada di antara kedua dunia di atas. Ia harus terbaca tanpa sesi, jadi
isinya tidak boleh bergantung pada chrome dasbor. Ia juga tidak menjual apa pun,
jadi tidak memakai skala pemasaran. Halaman panjang berkolom baca mudah bergeser
menjadi halaman jualan tanpa ada yang memutuskannya, sehingga aturannya ditulis
di sini.

Aturan ini mengatur isi; bingkainya ada dua (lihat "Satu halaman, DUA kulit" di
bawah). Tabel dimensi berikut berlaku untuk keduanya.

**Keputusan: dokumentasi memakai skala app yang dipersempit, bukan skala
pemasaran yang dilonggarkan.**

| Dimensi | Pendaratan `/` | **Dokumentasi `/docs`** | App internal |
|---|---|---|---|
| **Skala judul** | `--sai-landing-font-size-hero` ≈42–49px (`fontSizeHeading1 × 1,1–1,3`) | **`fontSizeHeading2` (30px)** — di BAWAH langit-langit app | langit-langit `fontSizeHeading1` (38px) |
| **Bobot CTA** | satu ajakan diulang empat kali, primer + garis berpasangan | **NOL tombol berisi penuh**; satu tautan "masuk ke aplikasi" `secondary` | satu aksi utama, di `PageHeader.actions` |
| **Irama antar-seksi** | `--sai-landing-rhythm` 64px → 96px | **`--ant-margin-lg` 24px** — irama app | 24px |
| **Lebar maksimum** | kolom baca 42rem, seksi 72rem, di tengah | **lebar penuh area kerja** (keputusan pemilik); alasan batas kolom baca lama & cara mengembalikannya di `pages/docs.md` | lebar penuh area kerja |

Batas judulnya lebih rendah daripada app internal: permukaan yang judulnya lebih
kecil dari judul layar kerja tidak akan terbaca sebagai halaman jualan, bahkan
bila seseorang menyalin bentuk hero ke sana. Nol CTA adalah penerapan aturan
yang sudah ada: §Aksi utama per layar menyebut "nol juga sah", dan halaman yang
hanya menjelaskan tidak mengikat atau memajukan apa pun.

**Guard:**

- **Sisi pemasaran.** `tests/landing-boundary.test.ts` hanya mengizinkan halaman
  `app/(marketing)/` mengimpor `components/landing/**`; berkas dokumentasi
  berada di luar `PINTU_MASUK`, jadi impor ke sana gagal. Menyalin
  `var(--sai-landing-…)` juga tidak menghasilkan hero, karena `[data-landing]`
  tidak dipasang di sini.
- **Sisi app internal** (`tests/docs.test.ts`): daftar izin impor (`@sai/ui` /
  `@/components/ui`, `@sai/core` / `@/lib`, sesama berkas dokumentasi), dengan
  alasan yang sama seperti `components/landing`: halaman ini dibaca tanpa sesi,
  dan impor ke app internal membuka jalan bagi kode ber-`auth()`/ber-Prisma ke
  permukaan publik. Pengecualiannya tepat satu berkas,
  `components/docs/docs-app-chrome.tsx`, yang bertugas mengimpor kulit panel
  akun; direktorinya tidak dilonggarkan. Dijaga dua arah.
- **Batas judul dan nol CTA dijaga sebagai teks berkas**: `--ant-font-size-heading-1`
  tidak boleh muncul di permukaan ini, dan `variant="primary"` tidak boleh muncul
  sama sekali.
- **Akses publiknya dijaga dua kali**: `tests/authz-coverage.test.ts` mendaftarkan
  grup rute `(docs)` sebagai grup publik (halamannya tidak memanggil guard
  apa pun dan tidak menyentuh `auth()` maupun Prisma), dan `src/proxy.ts`
  melepaskan subpohonnya lewat `isDocsPath()`. Bila salah satunya hilang,
  halaman tidak terbaca tanpa sesi; gejalanya halaman masuk, bukan error.

**Bahasa: Indonesia, dan pilihannya ditampilkan.** Prosa dokumentasi berbeda
dari label: label menamai sesuatu yang sudah dirender layar, sedangkan prosa
harus ditulis ulang setiap kali perilaku mesin berubah. Karena itu isinya ada di
`lib/docs-content.ts` dalam bahasa sumber, di luar kamus. Kamus repo menuntut
ketiga bahasa terisi (`tsc` + `tests/i18n.test.ts` menolak nilai yang sama
dengan bahasa Indonesia), jadi prosa di kamus berarti menjanjikan tiga bahasa
untuk setiap perubahan perilaku. Kerangkanya tetap trilingual (`docs.*`), dan
pembaca ber-`en`/`zh` mendapat pemberitahuan dalam bahasanya sendiri beserta
alasannya, agar tidak terbaca sebagai terjemahan yang hilang. Bandingkan #278,
keputusan serupa untuk ekspor.

**Peran dan izin dibangkitkan.** Halaman peran/izin membaca `PERMISSION_ROLES` +
`ROLE_VALUES` saat render, jadi menambah izin di `authz.ts` mengubah halamannya
tanpa menyunting dokumen. Halaman itu wajib menyebut dirinya bawaan yang bisa
ditimpa: matriks efektif = bawaan + `role_permission_overrides` per tenant
(#73), dan peran adalah data (tabel `roles`). Permukaan publik tidak punya
konteks perusahaan sehingga tidak bisa membaca keduanya; menebaknya melanggar
aturan pertama `docs/MULTI-COMPANY.md`. Karena itu halaman menyatakan batasnya
dan menunjuk ke `/permissions` di dalam aplikasi.

**Kelengkapan dijaga.** Setiap item `NAV_GROUPS` punya halaman dokumen atau
tercantum di `NAV_TANPA_DOKUMEN` dengan alasan tertulis. Guard dua arah, jadi
entri basi juga gagal. Yang dijaga adalah bahwa modul baru tidak bisa ditambahkan
tanpa dokumen; tuntutan "semuanya sudah ditulis" tidak realistis dan akan
membuat guard-nya dilonggarkan. Pola yang sama: `tests/print-label-dictionary.test.ts`
(#298) dan guard kunci yatim (#260).

**Istilah tetap milik `/glossary`.** Blok `istilah` membaca `TERMS`
(`packages/core/src/labels.ts`, #21/#1); definisi yang disalin ke prosa ditolak
guard-nya. Definisi dirender di tempat, bukan ditautkan, karena `/glossary`
bertenant dan menuntut sesi; tautan ke sana dari permukaan publik akan
di-redirect ke halaman masuk.

### Satu halaman, DUA kulit — dan kenapa yang kedua BUKAN kerangka dasbor

Pintu masuk `/docs` yang paling sering dipakai ada di dalam aplikasi (menu
Bantuan di bilah atas). Pengguna bersesi karena itu tidak boleh dilempar keluar
dari chrome-nya ke halaman telanjang. Cacat yang sama dulu ada di
`/companies/new`, yang memakai `AuthShell` bergaya login padahal dibuka dari
panel akun.

> **Pengecualian: wisaya penyiapan** `/t/{tenant}/{company}/setup` memakai
> kerangka fokusnya sendiri (`components/setup/setup-shell.tsx`): kepala
> ramping, tanpa navigasi, menu pengguna sebagai jalan keluar. Wisaya itu
> mendahului chrome mana pun; kerangka dasbor tetap terlarang di sana.

**Aturannya: kulit ditentukan oleh sesi, bukan oleh rute, dan jumlah kulitnya
dua.**

| Keadaan pembaca | Kulit | Yang menggambarnya |
|---|---|---|
| bersesi, dengan PT terbuka | **aplikasi** — menu samping + bilah atas, butir pertama "Kembali ke buku" | `PlatformShell` |
| bersesi, tanpa satu pun PT | **aplikasi** — menu samping panel akun, tanpa butir buku | `PlatformShell` |
| tanpa sesi | **publik** — kepala ramping seperti sejak #300, tak berubah | `docs-public-chrome.tsx` |
| bersesi, tanpa keanggotaan tenant | **publik** — tak ada nama tenant untuk dipajang | `docs-public-chrome.tsx` |

Kulit aplikasi memakai `PlatformShell`, bukan kerangka dasbor, karena dua hal:

- **Kerangka dasbor tidak bisa melayani keadaan kedua.** `(dashboard)/layout.tsx`
  menyusun menu dari `session.user.role`, yaitu peran di sebuah PT; bila peran
  itu `null`, ia mengembalikan `<PageLoader …>`. Pemilik tenant yang belum punya
  PT akan melihat pemutar memuat tanpa akhir di halaman yang seharusnya publik.
  Alasan yang sama tertulis di kepala `(tenant)/layout.tsx` dan
  `platform-shell.tsx`.
- **Menunya akan di-redirect.** Sekitar 40 butir menu dasbor beralamat jalur
  aplikasi (`/invoices`, `/dashboard`), yang diterjemahkan ke jalur kanonik oleh
  `scopedHref` dengan membaca slug dari `usePathname()`. Alamat `/docs` tidak
  memuat slug, jadi setiap butir bergantung pada redirect 307 dan tidak ada
  butir yang bertanda aktif.

**Lebar: penuh di kedua kulit** (keputusan pemilik; alasan batas kolom baca lama
dan cara mengembalikannya di `pages/docs.md` §Lebar). Bentuknya ditulis sekali di
`docs-shell.tsx` dan dipakai kedua kulit, agar keduanya tidak berbeda.

**Guard:**

- `tests/docs-chrome.test.tsx` merender layout dan halaman asli untuk keempat
  keadaan di tabel, termasuk "menu samping tidak kosong dan tidak ada butir yang
  menuntut PT";
- `tests/docs.test.ts` mengunci bahwa kulit dipilih di layout (kedua `page.tsx`
  bebas dari sesi), bahwa jalur pemilihan kulit tidak memuat guard atau
  `redirect()`, bahwa lebar skala kolom (≥600px) tidak diketik di luar
  `docs-shell.tsx`, dan bahwa daftar izin impor dikecualikan untuk satu berkas
  bernama;
- `tests/authz-coverage.test.ts` tetap menuntut kedua halaman tidak menyentuh
  sesi maupun Prisma, karena yang membaca sesi adalah layout.

**Prosanya tidak ikut berganti bahasa.** Badan dokumentasi tetap berbahasa
Indonesia, sementara chrome di sekelilingnya mengikuti bahasa sesi. Itu
keputusan #300 (lihat "Bahasa: Indonesia, dan pilihannya ditampilkan" di atas),
dan tetap berlaku untuk chrome aplikasi.

### Daftar isi: DAFTAR, bukan kartu

Kartu cocok untuk sedikit pilihan setara. Daftar isi tidak begitu: kartu seragam
yang berjajar sulit di-scan dan memakan tinggi layar. Aturannya:

- **dua branch** diperlakukan sebagai peta: bilah lompat di puncak dengan jumlah
  halaman per branch, agar pembaca tahu dokumentasi ditulis untuk dua jenis
  pembaca sebelum menggulung;
- **entri** berupa daftar tipografis: `<h3>` (bukan `<span>`; judul tanpa
  jenjang membuat daftar terbaca sebagai dua baris oleh pembaca layar), satu
  kalimat sekunder, garis pemisah tipis, panah di tepi kanan;
- **judul entri tidak berwarna biru tautan**, karena warna kehilangan arti bila
  semua baris memakainya. Afordansnya panah, ditambah garis bawah dan warna
  tautan saat `:hover`/`:focus-visible`;
- **pemisah bagian berupa garis, bukan ruang.** Irama 24px di tabel di atas
  berlaku; menambah jarak antar-bagian berarti memakai irama pemasaran;
- **jangkar bagian diturunkan dari kunci branch** (`#branch-pengguna`), bukan
  dari judul terjemahan, karena alamat tidak boleh berganti bersama bahasa;
- **halaman dokumen punya pengalih maju/mundur** di dalam branch-nya. Di sana
  kotak bertepi tepat dipakai: paling banyak dua, setara, berdampingan.

---

## Anti-Patterns (JANGAN)
- Emoji sebagai ikon → pakai `@ant-design/icons`.
- Dua paket ikon di satu layar; prop `size`/`width`/`height` pada ikon → ukurannya `style={{ fontSize }}`, lihat §Ikon. Dijaga `tests/design-system-primitives.test.ts`.
- `className` di mana pun (satu pengecualian: `<html>` di `packages/ui/src/providers/root-document.tsx`, dipakai setiap root layout kedua aplikasi) → tidak ada lembar gaya yang memaknainya, jadi kelas tidak gagal; ia hanya tidak berlaku.
- Nilai warna mentah (hex, `rgb()`, nama warna CSS) di luar `packages/ui/src/theme/antd-tokens.ts` → ditolak ESLint `sai/warna-token-antd`.
- Warna sebagai satu-satunya penanda status/nominal → selalu ada tanda/teks/ikon.
- Angka rata kiri / tanpa tabular-nums di tabel keuangan; 0 untuk nilai yang tidak diketahui → kosong atau "—", lihat Prinsip Inti #4.
- Placeholder sebagai pengganti label.
- Lebih dari satu tombol berisi penuh terlihat sekaligus di satu layar (kecuali pendaratan `/`, yang mengulang satu ajakan; lihat "Pendaratan `/` DIKECUALIKAN"). Jangan pula menurunkan semua tombol jadi sekunder, karena hierarkinya tetap rata. Lihat §Aksi utama per layar.
- Teks < 14px untuk data penting; kontras di bawah ambang §Ambang kontras per ukuran teks.
- Fokus keyboard tak terlihat; hover yang menggeser layout.
- Dark mode dipaksakan sebagai default; gaya landing/marketing (hero raksasa, CTA berulang, irama 96px, kolom baca di tengah) di app internal. Yang kedua dijaga `tests/landing-boundary.test.ts`; lihat §Pemasaran vs App.
- Jargon akuntansi mentah di permukaan tanpa tooltip/penjelasan.
- Nilai enum DB tampil mentah di UI (`purchase`, `bl`, `coo`, …): selalu lewat peta label bahasa tugas (`Record<Type, string>` seperti `CONTRACT_STATUS_LABELS`/`DOCUMENT_TYPE_LABELS` di `packages/core/src/constants.ts`); `Record` bertipe penuh membuat nilai baru tanpa label ditolak `tsc` (issue #68).

---

## Primitif Wajib: Tabel & Tombol

Markup mentah yang terlihat sama adalah jalur bocor paling umum bagi aturan di dokumen ini, karena yang hilang adalah bagian tak terlihat: pembungkus geser, cincin fokus keyboard, target sentuh. Karena itu kedua keluarga ini wajib lewat primitif, dijaga `tests/design-system-primitives.test.ts` (lingkup `src/app/(app)/(dashboard)` + `src/app/(app)/(setup)` + `src/components`, kecuali `src/components/ui` dan `packages/ui`, tempat primitifnya tinggal).

- **Tabel → `StaticTable` atau `DataTable`** (dipecah dua sejak issue #189, dengan satu kontrak kolom di `packages/ui/src/components/table-columns.tsx`):
  - **`StaticTable`** (`packages/ui/src/components/static-table.tsx`) adalah bawaan. Untuk laporan dan daftar yang dipaginasi server: dirender di server, tanpa JavaScript.
  - **`DataTable`** (`packages/ui/src/components/data-table.tsx`) dibangun di atas AntD `Table` dan merupakan komponen client. Pakai hanya bila datanya sudah di client dan pengguna diuntungkan sortir/filter/paginasi seketika. Ongkosnya terukur: +80 KB gzip per rute (rc-table + hidrasi), ditambah penyalinan seluruh `dataSource` ke peramban. Untuk tabel yang hanya menampilkan, ongkos itu tidak sepadan, dan halaman neraca saldo dengan 2.000 akun tidak lagi berupa HTML.
  - Kolomnya sama untuk keduanya: `textColumn`/`qtyColumn` (`table-columns.tsx`), `moneyColumn` (`money-column.tsx`), `statusColumn` (`src/components/ui/status-column.tsx`). Pembantu yang membawa komponen client tinggal di modulnya sendiri, agar halaman tanpa kolom uang tidak ikut memuat `money.tsx` di client.
  - **Sortir bukan alasan memilih `DataTable` (issue #265).** `StaticTable` mengurutkan lewat URL: judul kolom menjadi tautan `?sort=…&dir=…`, dan `orderBy` Prisma mengurutkan seluruh data, bukan hanya baris yang tampil. Halamannya menulis satu `SortSpec` (`packages/ui/src/table-sort.ts`), memakainya sebagai daftar putih `parseSort` sekaligus pembangun `orderBy`, lalu mengoper `sort={{ basePath, params, keys, active }}`. `sorter` berarti hal yang sama di kedua perender, dan bawaannya mati di semua pembantu kolom; menyalakannya keputusan halaman, karena hanya halaman yang tahu apakah kolomnya punya `orderBy`. `StaticTable` melempar error bila kolom menyatakan `sorter` tanpa konteks `sort`, agar tidak ada control sortir yang tidak tampil.
  - **Kunci sortir hanya boleh kolom NOT NULL.** Kolom yang nilainya bisa belum diketahui tidak ditawarkan sortirnya; bila ditawarkan, membalik arah urutan menaikkan blok baris "—" ke puncak, yang dilarang butir 4 Prinsip Inti. Kolom yang nilainya dihitung di memori (total faktur dari baris barangnya) juga tidak, karena urutan "terbesar"-nya berubah per halaman.
  - Keduanya menggulung sendiri: `StaticTable` lewat pembungkus ber-`overflow-x: auto`, `DataTable` lewat `scroll={{ x: "max-content" }}` yang dipasang primitif sebagai bawaan. AntD `Table` tanpa `scroll.x` tidak menggulung sendiri; halamannya yang menggulung, dan itu tidak terlihat di layar 1440px tempat kode ditulis. Jangan mengosongkan bawaan itu.
  - **Header lengket butuh `sticky` dan `maxHeight` berpasangan.** `position: sticky` dihitung terhadap kotak bergulir terdekat; tanpa `maxHeight`, pembungkus tidak pernah menggulung vertikal dan properti itu tidak berpengaruh. Salah satu tanpa yang lain adalah bug; lihat komentar kepala `packages/ui/src/components/table.tsx` dan `tests/permission-matrix-sticky.test.tsx`.
  - Baris total lewat prop `summary` (peta kunci kolom → isi sel) pada kedua varian; keadaan kosong lewat `empty` berisi `EmptyState`, tidak pernah "No Data" bawaan AntD.
- **Primitif JSX `Table`** (`packages/ui/src/components/table.tsx`: `TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableFooter`) adalah lapisan gaya di bawah kedua perender di atas, bukan API untuk halaman baru. Tabel baru memakai `StaticTable`/`DataTable`. `<table>`/`<thead>`/`<tbody>`/`<tfoot>` mentah tetap terlarang.
- **Nominal di tabel → `MoneyCell`** (satu sel penuh) atau **`Money`** (di dalam sel/teks). Jangan memformat angka sendiri: tabular-nums, rata kanan, format `id-ID`, dan mata uang eksplisit sudah termasuk.
- **Layar error & 404 → `StatusScreen`** (`packages/ui/src/components/status-screen.tsx`). Setiap `error.tsx`, `not-found.tsx`, `global-not-found.tsx`, dan `global-error.tsx` di kedua aplikasi memakainya, karena salinan tulisan tangan menyimpang. Teks lewat prop (layar ini juga dirender tanpa `<LocaleProvider>`), satu primer per layar, tombol pulang `<Button href>` (pemuatan penuh, untuk keluar dari render yang gagal). "Coba lagi" memakai `unstable_retry()`, bukan `reset()` (yang tidak mengambil ulang data). `global-error` lewat `GlobalErrorDocument`, tanpa provider apa pun. Dijaga `tests/error-pages.test.ts`.
- **Tombol → `Button`** (`packages/ui/src/components/button.tsx`), termasuk pemicu `ConfirmDialog` (lewat prop `trigger`). Isinya AntD `Button` dengan prop `variant`/`size`/`type` milik primitif. Di AntD `type` berarti varian visual; di primitif ini `type` tetap berarti `submit`/`button`/`reset` seperti di HTML. Jangan meneruskan `type` langsung ke AntD: setiap tombol kirim akan berhenti mengirim formulirnya tanpa error. Bawaan `variant` adalah `secondary`; tombol berisi penuh harus diminta (`variant="primary"`), satu per layar (§Aksi utama per layar).
- **Tombol yang menuju ke suatu tempat → `<ButtonLink href>`** (rute di dalam app) atau `<Button href>` (tautan keluar / `download` / pemuatan penuh). `asChild` tidak ada dan ditolak `tests/button-no-aschild.test.ts`. Bentuk itu membaca prop anaknya, dan dari server component anak itu bisa tiba sebagai simpul `react.lazy` tanpa `.props`, sehingga `React.Children.only()` melempar dan prerender gagal di halaman yang berganti-ganti. Atribut `download`/`target`/`rel` ditulis di tombolnya.
- **Tombol ikon → `variant="ghost" size="icon"`** = 40px, memenuhi target sentuh minimum. Jangan merakit tombol ikon dari padding kecil (≈28px). Aksi ikon yang berdampingan diberi jarak minimal 8px (`--ant-margin-xs`); 4px membuatnya mudah salah tekan di layar sentuh.
- **Tingginya datang dari token `controlHeight: 40`** di `AntdProvider`, bukan dari gaya di primitif (lihat §Jarak, radius, bayangan).
- **Badge status → `Badge`** (`packages/ui/src/components/badge.tsx`), yang merender AntD `Tag`. `Badge` AntD adalah titik notifikasi tanpa kata. Warna teksnya dari token `components.Tag` (lihat `packages/ui/src/theme/antd-tokens.ts`); warna bawaan AntD gagal 4,5:1. Badge wajib berteks.
- **Pengecualian yang disahkan** (tetap `<button>` mentah, alasannya di komentar kepala berkas dan terdaftar di `RAW_BUTTON_ALLOWLIST`): penanda langkah `components/shared/wizard.tsx`, dan tombol kirim kotak cari dokumentasi `components/docs/docs-search-form.tsx` (`/docs` tanpa JavaScript; `Button` AntD akan menjadi modul klien pertamanya). Pilihan saling meniadakan memakai `Segmented` AntD, menu memakai `Menu`/`Dropdown`, tur memakai `Tour`.
- **Di luar aturan tombol:** `<input type="radio">` native dan `<input type="file">` tersembunyi. Keduanya belum punya primitif dan tetap sah dipakai.
- **Pesan di dalam halaman → `Alert` AntD, dan `role`-nya tidak bisa dipilih.** `Alert` selalu merender `role="alert"` (wilayah live asertif, yang memotong bacaan pembaca layar) dan membuang `role` yang dioper. `<Alert role="status">` karena itu berperilaku asertif, tanpa peringatan dari `tsc` dan tanpa beda di layar. Untuk pesan yang tidak mendesak (ringkasan yang berubah, hitungan yang diperbarui), bungkus isinya dengan elemen ber-`role="status"` sendiri dan jangan pakai `Alert`; polanya di `components/shared/wizard.tsx`. Dijaga `tests/design-system-primitives.test.ts`.
- **Notifikasi melayang → `useToast()`** (`packages/ui/src/components/toast.tsx`), bukan `import { message } from "antd"`. Jalur statis AntD membuat akar React sendiri di luar `ConfigProvider` dan tampil dengan token bawaan (kotak putih di halaman gelap). `useToast` juga memasang wilayah live; `message` AntD tidak punya `aria-live`.
- **Isian pilihan telanjang → `SelectField`** (`packages/ui/src/components/select.tsx`), pasangan dari `Select` komposit seperti `PasswordField` dari `PasswordInput`. Ia `Select` AntD, bukan `<select>` native. Empat akibatnya:
  - **`name` tetap terkirim**: primitifnya menitipkan `<input type="hidden">` di dalam kontrolnya, jadi `new FormData(form)` dan `<form method="get">` tetap bekerja.
  - **`[name=…]` tidak menunjuk control yang bisa difokuskan** (issue #259). `document.querySelector('[name=…]')` pada isian pilihan menemukan input tersembunyi itu, dan `focus()` di sana tidak melempar error tetapi juga tidak memindahkan fokus. Control sebenarnya adalah `<input role="combobox">` di akar yang sama; `id` yang dioper mendarat di sana. Kode yang memindahkan fokus lewat nama field wajib menerjemahkan hasil pencariannya ke control yang bisa difokuskan. `focusFormField` (`src/components/ui/disclosure-section.tsx`) sudah melakukannya untuk semua pemanggil.
  - **`required` tidak divalidasi peramban.** Yang ada `aria-required` + tanda `*`; validasinya zod + server. Isian pilihan wajib harus punya validasi selain `required`.
  - **Pencarian menyala otomatis di atas 12 opsi** (`SEARCH_THRESHOLD`), bisa ditimpa lewat prop `searchable`.
- **Keluarga isian pilihan: tiga primitif, satu perbedaan** (issue #263). Ketiganya isian pilihan, ketiganya dipakai di dalam pola `Form`, dan dari sisi pemanggil terlihat setara. Perbedaannya tidak terlihat di layar:

| Primitif | Dipakai saat | Nilainya ikut `new FormData(form)` |
| --- | --- | --- |
| `SelectField` (`@sai/ui/select`) | bawaan; pencarian menyala sendiri di atas 12 opsi | **ya** — primitifnya menitipkan `<input type="hidden">` bernama |
| `SearchableSelect` (`@sai/ui/searchable-select`) | opsinya butuh **baris kedua** (negara / kontak) — sesuatu yang `SelectField` tidak punya | **tidak** |
| `ServerSearchableSelect` (`src/components/ui/server-searchable-select.tsx`) | daftarnya terlalu besar untuk dikirim ke klien; tiap ketikan mencari ke server | **tidak** |

  - **Kedua isian berpencarian tidak menerima `name`, dan itu dinyatakan di tipe.** `Select` AntD bukan kontrol form, jadi tidak ada tempat untuk menitipkan nama. Bila `name` diterima lalu diabaikan, formulir yang membaca `new FormData(form)` kehilangan satu field tanpa error: field itu tidak ada di muatan, dan server menerima objek yang tampak sah. Karena itu `name` ada di tipe kedua isian itu hanya untuk ditolak, dengan tipe berupa kalimat agar pesan `tsc` menyebut penggantinya.
  - **Bentuk sebaran juga tertutup.** `name="…"` yang ditulis langsung ditolak sebagai properti berlebih, tetapi `{...field}` dari `react-hook-form` tidak: pemeriksaan properti berlebih JSX tidak berlaku untuk sebaran, hanya pemeriksaan tipe atas properti yang dideklarasikan. Karena itu `name` dideklarasikan untuk ditolak. Guard-nya `tests/ui-fields.test.tsx` (markup di vitest, penutupan tipe lewat `@ts-expect-error` yang dinilai `bun run typecheck`).
  - **Bila nilainya harus terkirim bersama form**, pakai `SelectField`, atau baca nilainya lewat `value`/`onChange`.
  - **Tidak ada `searchPlaceholder`**: di AntD yang diketik adalah pemicunya sendiri, jadi teks petunjuknya `placeholder`.

---

## Aksi utama per layar (issue #267)

Tombol berisi penuh memberi tahu pengguna aksi mana yang dimaksud layar ini.
Bila sebagian besar tombol berisi penuh, penekanan tidak membedakan apa pun:
enam tombol primer berarti enam ajakan setara, dan pengguna harus membaca
semuanya. Di layar akuntansi, salah tekan berbiaya nyata (memposting,
membatalkan, menyetujui).

**Aturannya: satu aksi utama per layar. Nol juga sah.**

### Yang dihitung "satu layar"

Semua yang terender bersamaan pada satu URL dalam satu keadaan, bukan satu
berkas atau satu komponen.

- Branch yang saling meniadakan dihitung satu. `/verify-email` menulis tiga
  tombol primer di satu berkas (sudah terverifikasi · sudah terdaftar ·
  verifikasi sekarang), tetapi yang tampil selalu satu. Sama halnya kaki wisaya
  ("Lanjut" di langkah tengah, "Selesai" di langkah terakhir).
- **Overlay adalah layar tersendiri.** Tombol utama `ConfirmDialog`/`Modal`
  tidak bersaing dengan tombol di halaman di belakangnya.
- Primer dari komponen berbeda tetap satu layar. `/platform/billing` memuat tiga
  tautan "Lihat paket" dari tiga berkas (kepala halaman, pita masa coba, kartu
  naik-paket); tidak ada guard yang mendeteksinya, jadi periksa dengan mata.

### Yang memenuhi syarat menjadi aksi utama

Aksi yang mengikat atau memajukan: mengirim formulir yang menyimpan sesuatu,
memposting, menyetujui, melangkah maju di wisaya, "mulai bekerja".

Yang tidak memenuhi syarat:

- **Navigasi ke layar baca lain**, kecuali itu satu-satunya jalan maju. Karena
  itu "Tambah Perusahaan" primer di layar nol-perusahaan `/select-company`,
  tetapi `outline` di kaki kartu daftar, tempat ia jalan samping di sebelah
  pilihan perusahaan.
- **Jalan keluar dari layar tanpa tugas** (`/feature-inactive`, `/setup-required`:
  "Kembali ke dasbor").
- **Kirim formulir yang menyaring.** Ia hanya membaca ulang, jadi
  `outline`/`secondary` di seluruh kotak cari/saring app ini, termasuk kedua
  penyaring laporan (`reports/report-filters.tsx`). Halaman laporan karena itu
  sengaja tanpa aksi utama: layar baca dengan ekspor `secondary`.
- **Chip/tab saringan, termasuk yang aktif.** Chip aktif menyatakan keadaan
  (irisan yang sedang dilihat), bukan ajakan, jadi ia `secondary` (berbingkai)
  dan saudaranya `ghost` (tanpa bingkai), tidak pernah berisi penuh. Bedanya ada
  pada bingkai, bukan hanya warna. Ini juga berlaku untuk tombol pemilih baris
  ("Tinjau" di `/periods`).
  Pengecualian bersyarat: chip granularitas `shared/stock-period-filter.tsx`
  tetap berisi penuh karena ia satu-satunya penekanan penuh di layarnya
  (`/inventory/movement`, `/inventory/opname/history` sengaja tanpa primer).
  Halaman yang punya CTA kepala tidak memenuhi syarat itu.
- **Pemicu yang membuka panel.** Ia bagian tata letak: `secondary`, dan yang
  primer adalah submit di dalam panelnya (`shared/payment-form.tsx`,
  `users/users-client.tsx`, `inventory/update/stock-form.tsx`,
  `suppliers/[id]/advance-panel.tsx`). Layar memuat nol primer saat panel
  tertutup dan satu saat terbuka; ini bentuk yang paling sering benar untuk
  halaman detail.
  Pemicu `ConfirmDialog` berbeda dari pemicu panel. Pemicu panel membuka
  pekerjaan yang belum dikerjakan, sedangkan dialog konfirmasi muncul setelah
  pekerjaan selesai dan hanya meminta pembenaran. Karena itu pemicunya boleh
  primer (`/periods` "Tutup periode", `/inventory/opname` "Simpan hasil opname").
- **Aksi baris yang berulang** (lihat pengecualian 1 di bawah). Di `/approvals`,
  "Setujui" dan "Ajukan ulang" ada di dalam `.map()`, jadi keduanya `secondary`;
  aksi yang mengikat tetap berisi penuh di dalam dialognya. Layar itu tanpa
  primer, sesuai tugasnya menimbang.
- **Aksi destruktif.** `variant="destructive"` tidak dihitung sebagai aksi utama
  layar; ia menonjol karena bahayanya. Warnanya diputuskan di #219 (§Aksi
  destruktif di bawah).

### Aksi destruktif: warna — dan kenapa tema gelap SENGAJA berbeda (#219)

Aturan bentuknya tetap: destruktif = merah + konfirmasi (§Pola Komponen). #219
memutuskan merah yang mana. Isian `danger` bawaan AntD menjatuhkan label
putihnya di bawah 4,5:1 di kedua tema (3,27:1 terang, 4,24:1 gelap), dan label
tombol "Hapus" harus jelas terbaca.

Tombol berisian harus lolos dua ambang: label putih ≥ 4,5:1 (teks 14px) dan
isian vs latar ≥ 3:1 (grafis non-teks, agar terlihat sebagai tombol). Di tema
terang, tangga merah AntD punya anak tangga yang lolos keduanya. Di tema gelap
tidak ada: red-6 `#dc4446` memberi label 4,24 (gagal), red-5 `#ad393a` memberi
isian 2,69 (gagal).

**Keputusan pemilik: utamakan label.** Tema gelap memakai red-5 dan menerima
isian 2,69:1. Aksi destruktif di app ini wajib lewat `ConfirmDialog`, jadi
risiko tidak melihat tombolnya sudah ditutup dialog, sedangkan risiko salah
membaca labelnya tidak ditutup apa pun.

| Keadaan | TERANG | label | isian min | GELAP | label | isian min |
|---|---|---|---|---|---|---|
| diam  | `#d9363e` | 4,62 | 4,24 | `#ad393a` | 6,13 | **2,69** |
| hover | `#b32430` | 6,54 | 6,00 | `#7e2e2f` | 9,06 | 1,82 |
| aktif | `#8c1523` | 9,35 | 8,57 | `#5b2526` | 12,09 | 1,36 |

Isian menjadi lebih gelap saat disentuh di kedua tema, sama seperti tombol
primer sejak #187, karena menerangkannya di tema gelap menurunkan kontras label.
Ambang 3:1 karena itu hanya berlaku pada keadaan diam; saat hover, kursor sudah
menandai letak tombol.

Yang perlu diingat:

- **Ini pengecualian yang disengaja.** Tema gelap diperlakukan berbeda dari
  terang pada tepat satu angka. Mengubah 2,69:1 ke red-6 berarti membatalkan
  keputusan ini, bukan memperbaiki bug.
- **Prasyaratnya adalah dialog, dan itu dijaga**
  (`tests/destructive-confirm.test.ts`). Tombol destruktif tanpa
  `ConfirmDialog` tidak tercakup alasan di atas dan menanggung kedua kelemahan.
  Tambahkan dialognya, bukan warna khusus. Formulir berisian bukan pengganti
  dialog: isian yang terisi otomatis atau opsional tetap berjarak satu klik.
- **Ada alternatif terukur yang belum diambil.** Palet `red` resmi AntD
  (`presetDarkPalettes`, keluarga yang dipakai #208 untuk `grey`) punya satu anak
  tangga yang lolos kedua ambang di tema gelap: `#d32029`, label 5,24 · isian
  3,15. Ongkosnya label turun dari 6,13 ke 5,24 dan merah berpindah keluarga.
  Angkanya dikunci di `tests/antd-tokens.test.ts` agar pilihan itu tetap
  terbuka.

Seluruh angka di tabel dihitung ulang dari paket `antd` yang terpasang setiap
kali suite berjalan: `tests/antd-tokens.test.ts` → "label tombol destruktif
(#219)".

### CTA kepala halaman vs CTA keadaan-kosong — kepala yang menang

Pada halaman daftar yang kosong, dua ajakan terender bersamaan dan menunjuk
`href` yang sama, sering dengan label yang sama: tombol di kanan atas
`PageHeader` dan tombol di dalam `EmptyState`. CTA kepala yang menjadi primer;
`EmptyState` merender aksinya `secondary` (keputusan dan alasannya di
`packages/ui/src/components/empty-state.tsx`).

Dua alasannya:

1. **Kosong tidak selalu berarti modul kosong.** Halaman yang sama merender
   keadaan kosong ketika saringan tidak menemukan apa pun. `/contracts?search=zzz`
   pada perusahaan dengan 400 kontrak menampilkan "Belum ada kontrak" beserta
   tombolnya; CTA primer di situ menjawab pencarian yang nihil dengan "buat
   baru". CTA kepala tidak menyiratkan apa pun.
2. **Alternatifnya harus berkondisi dan punya dua ongkos.** Bila CTA kepala yang
   mengalah, ia hanya boleh mengalah saat daftar kosong. Akibatnya tombol
   berganti penekanan begitu baris pertama masuk, dan modul dalam keadaan
   normalnya (berisi) tidak punya aksi utama. #267 sudah menolak penyeragaman
   yang hanya mengganti satu hierarki rata dengan yang lain.

Ini tidak bertentangan dengan "Tambah Perusahaan" di `/select-company`. Di sana
layar nol-perusahaan tidak punya tombol lain; CTA-nya satu-satunya jalan maju.
Di halaman daftar, CTA kepala selalu ikut terender.

Aturan ini berlaku untuk setiap keadaan kosong di app. Bila kelak ada keadaan
kosong yang benar-benar satu-satunya jalan maju di layarnya, tambahkan prop
eskalasi di primitifnya; jangan menaikkan bawaannya.

### Dua pengecualian — ditemukan dengan mengujinya ke layar nyata

**1. Pilihan setara yang berulang.** Aksi baris di dalam `.map()` tidak pernah
primer, karena jumlahnya tak terbatas dan sepuluh blok biru sama dengan tanpa
penekanan. Kecuali ketiga syarat ini terpenuhi sekaligus:

  a. label dan akibatnya identik di setiap baris;
  b. memilih salah satunya adalah satu-satunya jalan maju di layar itu;
  c. tidak ada tombol primer lain di layar itu.

Satu layar memenuhinya: `/select-company`, sebuah kartu berisi daftar PT tanpa
isi lain; kaki kartunya seluruhnya `outline`. Kisi berbentuk sama di `/platform`
dan `/platform/team` tidak memenuhi syarat (b), karena kedua halaman itu juga
memuat meteran kuota, status langganan, dan jalan lain; di sana barisnya
`outline`. Menurunkan `/select-company` justru membuat layarnya tanpa titik
masuk.

**2. Eskalasi berkondisi.** Tombol boleh naik menjadi primer hanya dalam keadaan
tertentu: `variant={trial.urgent ? "primary" : "outline"}`
(`platform/subscription-section.tsx`), `variant={isUpgrade ? "default" :
"outline"}` (`billing/plans/plan-actions.tsx`). Bentuk ini disarankan karena
penekanan menjadi jawaban atas keadaan, bukan properti tetap tata letak.
Syaratnya: dalam keadaan yang menaikkannya, tombol itu satu-satunya primer di
layar.

Contoh terbaik: `/tax/efaktur` memuat dua aksi mengikat dari dua berkas,
"Simpan identitas penjual" dan "Unduh CSV". Selama NPWP penjual kosong, halaman
tidak merender tombol unduh (diganti catatan "NPWP diperlukan"), jadi menyimpan
identitas memang satu-satunya jalan maju. `variant={identityIncomplete ?
"primary" : "secondary"}` mengikuti apa yang bisa dilakukan. Contoh yang salah:
eskalasi yang menaikkan "Kunci" saat pekerjaannya belum selesai. Bentuknya sama,
syaratnya berbeda.

### Pendaratan `/` DIKECUALIKAN — dan pengecualiannya berbatas

Aturan di atas tidak berlaku untuk `/` dan `src/components/landing/**`. Halaman
itu merender empat tombol berisi penuh sekaligus, dari empat komponen: bilah
atas (`LandingNav`), hero (`LandingHero`), setiap kartu paket (`LandingPricing`,
di dalam `.map()`), dan ajakan penutup (`LandingClosingCta`, `variant="inverse"`
di atas pita pekat).

Halaman ini dikecualikan karena §Pemasaran vs App menyebut pengulangan aksi yang
sama sebagai salah satu dari empat dimensi halaman pemasaran. Menerapkan aturan
satu primer di sana mencabut dimensi itu dan membuat pembaca yang sampai di
ujung halaman harus menggulung balik untuk menemukan tombolnya (lihat juga
`pages/landing.md`).

**Batasnya: ajakannya harus sama.** Pengulangan sah karena keempat tombol menuju
`/register`. Tombol primer yang menuju tempat lain berarti halaman menawarkan dua
ajakan, dan hierarkinya menjadi rata. Batas ini dijaga
`tests/button-emphasis.test.ts`, yang menolak tombol primer di
`components/landing/**` dengan `href` selain `/register`. Yang tidak dijaga:
berapa kali tombol muncul di layar, dan apakah label yang berbeda untuk tujuan
yang sama masih terbaca sebagai satu ajakan.

Yang tetap berlaku penuh di pendaratan: `variant` ditulis eksplisit (bila tidak,
bawaan `secondary` menghapus penekanan ajakan halaman pemasaran) dan seluruh isi
`pages/landing.md` §Yang TETAP BERLAKU PENUH.

### Bawaan `variant` = `secondary` — penekanan tinggi harus DIMINTA

`<Button>` tanpa atribut adalah tombol sekunder. Dengan aturan "satu aksi utama
per layar, nol juga sah", tombol sekunder adalah bawaan yang paling sering benar.
Penekanan tinggi ditulis sebagai `variant="primary"`, sekali per layar, dan
terlihat di diff. Ketika bawaannya `primary`, sebagian besar tombol menjadi
berisi penuh tanpa ada yang memutuskannya.

Jangan membalik bawaan ini agar varian tidak perlu ditulis; yang hilang adalah
keputusannya.

### Guard-nya — dan batasnya, yang harus dibaca

`tests/button-emphasis.test.ts` menjaga tiga hal:

1. **Keeksplisitan**: setiap `<Button>`/`<ButtonLink>` menyebut `variant`-nya di
   seluruh `src/app`, `src/components`, dan `packages/ui/src`, tanpa daftar
   pengecualian. Lingkup itu sendiri dijaga: guard-nya harus menyentuh setiap
   berkas `.tsx` di akar-akar itu. Guard ini tetap perlu walau bawaannya
   `secondary`, karena tombol implisit gagal tanpa tanda (sekunder di antara
   sekunder), sehingga pertanyaannya harus dijawab sekali dan terlihat di diff.
2. **Satu primer per wadah JSX** yang bisa terender bersamaan. Branch ternary
   dihitung sebagai alternatif (`Math.max`), tidak dijumlahkan; tanpa itu
   guard-nya gagal pada kaki wisaya dan `/verify-email`, yang justru contoh
   aturan yang benar. `<Button>` implisit tidak dihitung primer (primitifnya
   tidak merendernya begitu, dan guard #1 melarang bentuk itu).
3. **Batas pengecualian pendaratan**: setiap tombol primer di
   `components/landing/**` harus menuju `/register`.

**Yang tidak dijaga dan harus diperiksa dengan mata:** pengulangan lewat `.map()`
(satu simpul di sumber, sepuluh tombol di layar), primer yang tersebar di
beberapa komponen pada satu halaman, primer berkondisi yang bisa bertemu primer
lain, dan primer di lingkup berbeda dalam satu berkas. Kolom
`StaticTable`/`DataTable` dirakit di variabel di luar `return`, jadi tombol baris
dan tombol halaman berada di dua akar JSX dan `hitungPrimer` tidak pernah
melihat keduanya bersama. Setiap tabel di app ini berbentuk begitu, jadi primer
di kolom render tidak akan terdeteksi. Guard yang hijau di berkas seperti itu
tidak membuktikan aturan ini terpenuhi.

**Preseden** (dua primer dari dua berkas atau dua lingkup yang tidak terlihat
guard; yang diturunkan adalah aksi sampingan atau navigasi):

- `shared/advance-compensation.tsx` → `secondary` (memposting, tetapi sampingan
  di `/invoices/[id]` & `/suppliers/[id]`).
- `contracts/[id]` "Buat Faktur" → `secondary` (navigasi; submit pembayaran
  yang menang saat formulirnya dibuka).
- `fixed-assets` "Jalankan penyusutan" → `secondary` ("Tambah Aset" yang masuk
  akal saat belum ada aset).
- `periods/period-manager.tsx` "Tinjau" (baris) → chip keadaan; "Tutup periode"
  pekerjaan halamannya.
- `permissions-client.tsx` × `role-manager.tsx` → formulir peran yang turun.
- `inventory/opname` CTA kepala "Tambah/Kurangi Stok" → turun (navigasi).
- `tax/efaktur` → eskalasi berkondisi (pengecualian 2).

---

## Guard: aturan mana dijaga apa (issue #204)

Aturan yang tidak dijaga cenderung dilanggar pada PR berikutnya. Guard yang
hanya mengenal sebagian kosakata lebih berisiko lagi, karena hasil hijaunya
dibaca sebagai aman.

| Aturan | Guard |
|---|---|
| Warna hanya dari token AntD (bukan hex/`rgb()`/nama warna) | ESLint `sai/warna-token-antd` (`eslint-rules/warna-token-antd.mjs`) |
| Nol `className`; ikon tanpa prop `size`; `Alert` tanpa `role`; tanpa `<table>`/`<button>` mentah | `tests/design-system-primitives.test.ts` |
| Judul & breadcrumb hanya lewat `PageHeader` (termasuk `Typography.Title level={1}`) | `tests/page-header.test.ts` |
| Halaman tetap server component; batas client berhenti di primitif | `tests/rsc-boundary.test.ts` (ambang `AMBANG_KLIEN`) |
| Barrel `@ant-design/icons` tak menyentuh lapisan RSC | `tests/icon-rsc-boundary.test.ts` + `modularizeImports` di `next.config.ts` |
| Angka kontras token, dihitung ulang dari paket `antd` yang terpasang | `tests/antd-tokens.test.ts`, `tests/ui-controls-antd.test.tsx`, `tests/chart-tokens.test.tsx` |
| Permukaan (`colorBgLayout`/`Container`/`Elevated`) tidak bergeser tanpa menurunkan ulang seluruh tabel kontras | `tests/antd-tokens.test.ts` → "jenjang permukaan (#266)" |
| Nada kepala tabel tetap permukaan terukur, kedua perender memakai satu angka, kartu berbayang dari token, tanpa pita baris | `tests/antd-tokens.test.ts` → "jenjang perender (#266)" |
| Kepala tabel tidak berganti warna saat menempel | `tests/permission-matrix-sticky.test.tsx` |
| Tirai/fokus/Escape overlay; `styles` Modal memakai nama bagian yang sungguh ada | `tests/ui-overlay-antd.test.tsx` |
| Batas dunia pemasaran ↔ app internal | `tests/landing-boundary.test.ts` |
| Nada pekat pendaratan: teks/tombol/glif/lantai "nadanya terlihat", dihitung ulang dari token terpasang + resep yang dirender | `tests/landing-colors.test.ts` |
| Nada pekat `/platform`: kadar diikat tepi tombol garis, badan kartu tetap telanjang, dan nadanya terkurung di `[data-platform]` | `tests/platform-colors.test.ts` |
| `Button asChild` tidak kembali (bentuk yang mematikan prerender dari server component) | `tests/button-no-aschild.test.ts` |
| Tak ada `<a>` yang membungkus `<button>`: jumlah sarang anchor–tombol per berkas hanya boleh mengecil, modul yang sudah dibersihkan tetap nol, `legacyBehavior` tidak dipakai. Tidak terlihat guard: sarang yang dirakit antar-berkas dan alias impor baru | `tests/anchor-button-nesting.test.ts` |
| `<ButtonLink>` benar-benar menavigasi di sisi klien: satu `<a class="ant-btn">`, `href` ter-scope tenant, `router.push` pada klik biasa, dan Ctrl/klik-tengah/`download`/alamat luar tetap milik peramban | `tests/button-link-navigation.test.tsx` |
| Satu aksi utama per layar: `variant` eksplisit di seluruh `src/app` + `src/components` + `packages/ui/src` (tanpa daftar pengecualian, dan lingkup itu sendiri dijaga), tak ada dua primer yang bisa terender bersamaan dalam satu wadah JSX, dan setiap primer pendaratan menuju `/register`. Tidak terlihat guard: `.map()`, primer antar-komponen, primer antar-lingkup dalam satu berkas (yaitu setiap kolom tabel), dan primer berkondisi; lihat §Aksi utama per layar | `tests/button-emphasis.test.ts` |
| Bawaan `variant` primitif `Button` = `secondary`, di kedua bentuknya (tombol & anchor), dikunci di sumber **dan** di markup hasil render | `tests/button-emphasis.test.ts` · `tests/ui-controls-antd.test.tsx` |
| Satu baris control = satu ukuran: control yang berdampingan mendatar (`Flex`/`Space`/`Row`/`display: flex\|grid`) tidak boleh mencampur `sm` (30px) dengan bawaan (40px) atau `lg`; tumpukan dan sel kisi melebar-penuh punya barisnya sendiri; model `sm→small` di kedua primitif ikut dikunci. Tidak terlihat guard: baris yang dirakit antar-berkas, gaya yang datang dari impor, `size={x ? "sm" : "md"}`, dan tinggi yang dipaksa lewat `style` | `tests/control-size-row.test.ts` |
| Destruktif = merah + konfirmasi: setiap `<Button>` yang bisa bernilai `danger`/`destructive` berpasangan dengan `ConfirmDialog` (sebagai `trigger`, atau bentuk terkendali di berkas yang sama); satu-satunya pengecualian berupa atribut (`aria-pressed` = sakelar, yang menekannya lagi mengembalikannya), bukan daftar nama berkas, sehingga tidak ada daftar yang perlu dirawat. Tidak terlihat guard: dialog mana untuk tombol mana (bentuk terkendali dinilai per berkas), apakah pesannya menyebut akibatnya, tombol destruktif yang tidak berwarna merah, dan perakitan antar-berkas | `tests/destructive-confirm.test.ts` |
| Nilai tak diketahui tidak pernah tampil 0 | `tests/money-unknown.test.tsx` |
| `StaticTable` tidak mengabaikan `sorter`; kolom yang menyatakannya merender control sortir, `aria-sort`, dan tautan yang mempertahankan query | `tests/table-sort.test.tsx` |
| Form: satu skema zod dua sisi; `Form` AntD tidak dipakai | `tests/form-schema-parity.test.ts`, `tests/ui-form-antd.test.tsx` |
| Fokus error validasi mendarat di control yang bisa difokuskan (bukan hidden companion isian pilihan) | `tests/focus-form-field.test.tsx` |
| Keluarga isian pilihan: hanya `SelectField` yang ikut `FormData`; `name` pada kedua isian berpencarian ditolak `tsc` bahkan lewat `{...field}` | `tests/ui-fields.test.tsx` (markup di vitest, penutupan tipenya lewat `@ts-expect-error` yang dinilai `bun run typecheck`) |
| Tidak ada kunci kamus yang menganggur: setiap kunci di `id/en/zh.json` punya rujukan di `src/`, `packages/*`, atau `apps/*` — literal, rantai properti berakar kamus, atau bentuk dinamis yang terdaftar (daftarnya dijaga dua arah: entri basi gagal, bentuk dinamis baru yang belum diputuskan juga gagal). Tidak terlihat guard: subpohon yang diambil utuh, dan kunci yang hanya dirujuk dari `tests/` | `tests/i18n-orphan-keys.test.ts` |
| Permukaan dokumentasi tetap permukaan ketiga: tidak mengimpor chrome app internal, tidak melampaui `fontSizeHeading2`, nol tombol berisi penuh; setiap modul navigasi punya halaman dokumen atau alasan tertulis (dijaga dua arah); definisi istilah tidak disalin; `isDocsPath` benar-benar dipakai proxy | `tests/docs.test.ts` |
| `/docs` terbaca tanpa sesi: grup rute `(docs)` terdaftar sebagai grup publik, halamannya tidak memanggil guard apa pun dan tidak menyentuh `auth()`/Prisma | `tests/authz-coverage.test.ts` → "permukaan PUBLIK: dokumentasi sistem (#300)" |

**Menambah guard:** langgar aturannya sekali dengan sengaja, pastikan tesnya
gagal karena alasan yang benar, lalu kembalikan. Contoh kode yang terlihat benar
tetapi tidak berpengaruh: `position: sticky` tanpa kotak bergulir, pembungkus
`role="status"` di sekeliling `Alert` yang selalu asertif, dan `styles.content`
pada `Modal` yang bukan bagian semantik v6 (sehingga prop `size` dialog tidak
berpengaruh selama berbulan-bulan). Guard `Alert` di atas juga lulus pada
percobaan pertama terhadap pelanggaran yang sengaja disuntikkan. Guard yang
belum pernah terlihat gagal belum terbukti bekerja.

**`bun run verify` yang hijau tidak membuktikan aplikasinya bisa dibangun.**
Sebuah bug pernah lolos typecheck, lint, dan seluruh tes, lalu menggagalkan
`next build` produksi (barrel `@ant-design/icons` yang menyentuh lapisan RSC;
error-nya menunjuk halaman acak). `bun run build` adalah gate tersendiri dan
wajib `EXIT=0` sebelum UI diserahkan.

---

## Pre-Delivery Checklist (UI apa pun)
- [ ] Ikon SVG konsisten (`@ant-design/icons`), tanpa emoji; ukurannya `style={{ fontSize }}`, bukan prop `size`/`width`/`height`; ikon dekoratif `aria-hidden`.
- [ ] `cursor: pointer` di semua elemen klik; hover transisi 150–250ms.
- [ ] Kontras memenuhi ambang per ukuran teks (§Ambang kontras); fokus keyboard terlihat; `prefers-reduced-motion` dihormati.
- [ ] Nominal: tabular-nums, rata kanan, format id-ID, mata uang eksplisit, negatif jelas (merah dan tanda/kurung).
- [ ] Nilai tak diketahui kosong atau "—", tak pernah 0; baris yang dikecualikan dari total disebutkan sebagai catatan.
- [ ] Status pakai badge berteks (bukan warna saja).
- [ ] Form: label terlihat, validasi inline, helper text, progressive disclosure.
- [ ] Responsive: 375 / 768 / 1024 / 1440px; tidak ada horizontal scroll di mobile (tabel menggulung sendiri).
- [ ] Judul & breadcrumb lewat `PageHeader` (bukan `<h1>` atau `Typography.Title level={1}` sendiri); label breadcrumb = label menu samping.
- [ ] Reuse komponen `@sai/ui` (`packages/ui/src/components`); warna & jarak dari token AntD (`var(--ant-...)` atau `theme.useToken()`), bukan nilai mentah.
- [ ] Dilihat di tema terang dan gelap. Lihat "dua bidang sewarna" di Color Palette; sidebar `SIDER_BG_DARK` yang melebur dengan permukaan gelap tidak terlihat dari kode.
- [ ] Nama produk & versi lewat `APP_NAME` / `APP_VERSION` (`packages/core/src/constants.ts`), lambang lewat `BrandMark`, bukan literal.
- [ ] Tabel lewat `StaticTable` (bawaan) / `DataTable` (hanya bila butuh sortir-filter seketika) + `MoneyCell`; tombol lewat `Button` (ikon = `size="icon"`). Tombol-tautan: `<ButtonLink href>` untuk rute di dalam app (satu `<a>`, navigasi sisi-klien + prefetch), `<Button href>` untuk tautan keluar / `download` / pemuatan penuh yang disengaja. Tidak pernah `<Link><Button/></Link>` (dua elemen interaktif bersarang: HTML tidak sah, pembaca layar mengumumkannya dua kali), dan tanpa `asChild`.
- [ ] **Hitung tombol berisi penuh di layar jadi**, termasuk yang berasal dari `.map()`, komponen lain, dan kolom tabel: satu, atau nol. `variant` ditulis eksplisit di setiap `<Button>`. Bawaannya `secondary`, jadi penekanan tinggi harus diminta (`variant="primary"`); tombol yang variannya lupa ditulis tidak tampak salah, tetapi kehilangan penekanannya. §Aksi utama per layar.
- [ ] **Satu ukuran control per baris.** Periksa per baris: `size="sm"` (30px) di sebelah `Select`/`Input`/`MoneyInput` bawaan (40px) mematahkan garis dasar. Bila campur, naikkan tombolnya; jangan mengecilkan isian di sebelahnya. §Satu baris control = satu ukuran.
- [ ] **Nol `className`.** Tidak ada lembar gaya yang memaknainya; kelas tidak gagal, tetapi juga tidak berlaku. Gaya ditulis sebaris, dan yang tidak punya bentuk sebaris (`:hover`, `::after`, `@media`) ditulis di satu `<style href precedence>` di komponennya; pola `landing-shell.tsx` (memasang CSS `landing-scale.ts`) / `packages/ui/src/components/table.tsx`.
- [ ] Empty state bermakna + aksi.
- [ ] **`bun run verify` hijau dan `bun run build` `EXIT=0`.** Yang pertama tidak membuktikan yang kedua; lihat §Guard.
