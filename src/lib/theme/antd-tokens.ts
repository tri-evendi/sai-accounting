/**
 * Token warna uang untuk Ant Design (issue #186) — SATU sumber kebenaran.
 *
 * ── Kenapa modul ini ada ───────────────────────────────────────────────────
 * Keputusan migrasi berbunyi "pakai palet bawaan AntD". Untuk teks nominal
 * keputusan itu tidak bisa dijalankan apa adanya, dan alasannya aritmetika,
 * bukan selera. Diukur ulang terhadap paket `antd` yang benar-benar terpasang
 * (lihat `tests/money-tokens.test.ts`, yang menghitung angka di bawah setiap
 * kali suite berjalan — jadi versi AntD baru tidak bisa menggeser kontras
 * diam-diam):
 *
 *   colorSuccess terang  #52c41a =  2,27:1  di atas colorBgContainer
 *   colorWarning terang  #faad14 =  1,90:1
 *   colorError   terang  #ff4d4f =  3,27:1 · gelap #dc4446 = 3,89:1 (elevated)
 *
 * Ambangnya 4,5:1 untuk hampir seluruh permukaan, karena `fontSize` bawaan
 * AntD adalah 14px — jalan keluar "pakai teks besar saja" tidak tersedia.
 * Hijau bawaan AntD (2,27:1) bahkan LEBIH BURUK daripada #16A34A (3,30:1)
 * yang baru saja diperbaiki sebagai bug di kolom uang beranda; memakainya apa
 * adanya berarti memundurkan aksesibilitas ke bawah titik awal.
 *
 * ── Ini masih palet AntD ───────────────────────────────────────────────────
 * Nilai di bawah BUKAN brand lama yang diselundupkan kembali. Semuanya anak
 * tangga resmi dari palet AntD sendiri (`@ant-design/colors`: green-8, red-8,
 * gold-9/gold-8, blue-7). Yang ditolak bukan paletnya, melainkan asumsi bahwa
 * anak tangga ke-6 — yang AntD pilih untuk ISIAN dan IKON — juga layak jadi
 * warna TEKS kecil. Untuk aplikasi umum asumsi itu jarang diuji; untuk
 * aplikasi akuntansi yang seluruh isinya angka berwarna di sel 14px, ia
 * langsung ambruk.
 *
 * Karena itu `colorSuccess`/`colorError`/`colorWarning` bawaan TETAP dipakai
 * untuk isian pekat, `Tag`, `Badge`, ikon berlatar, dan `Progress` — di sana
 * ambangnya 3:1 non-teks. Yang diganti hanya perannya sebagai warna teks.
 *
 * ── Rasio terhitung (WCAG 2.x, sRGB, alfa dikomposit ke latarnya) ──────────
 * "min" = yang terburuk di antara `colorBgContainer`, `colorBgLayout`, dan
 * `colorBgElevated` — jadi angkanya tetap berlaku di baris tabel yang di-hover
 * maupun di dalam Modal/Popover.
 *
 * | Peran    | TERANG    | ctr / layout / elev | min  | GELAP     | ctr / layout / elev  | min   |
 * |----------|-----------|---------------------|------|-----------|----------------------|-------|
 * | positif  | `#237804` | 5,59 / 5,12 / 5,59  | 5,12 | `#8fd460` | 10,31 / 11,75 / 9,23 |  9,23 |
 * | negatif  | `#b32430` | 6,54 / 6,00 / 6,54  | 6,00 | `#f39c97` |  8,78 / 10,01 / 7,86 |  7,86 |
 * | menunggu | `#874d00` | 6,79 / 6,23 / 6,79  | 6,23 | `#f3cc62` | 11,95 / 13,62 /10,69 | 10,69 |
 * | info     | `#0958d9` | 6,16 / 5,65 / 6,16  | 5,65 | `#3c89e8` |  5,21 /  5,94 / 4,66 |  4,66 |
 *
 * ── Token netral: teks bantuan (#207) & batas (#208) ───────────────────────
 * Dulu sengaja ditunda di sini karena keduanya token bawaan yang dipakai jauh
 * di luar uang. Keduanya kini diputuskan, di bagian bawah berkas ini —
 * `NEUTRAL_TEXT_*` dan `BORDER_TOKENS_*`. Alasannya sama dengan token uang:
 * anak tangga netral AntD dipilih untuk selera, bukan untuk sebuah lantai
 * kontras, dan aplikasi yang seluruh isinya angka di sel 14px membutuhkan
 * lantai itu.
 */

import type { ResolvedTheme } from "./config";

/**
 * Token kustom didaftarkan ke tipe AntD sebagai OPSIONAL, bukan wajib.
 * Itu bukan kelalaian: komponen yang dirender di luar `AntdProvider` (uji
 * unit, render terisolasi) mendapat token bawaan AntD yang memang tidak
 * memuatnya. Menyatakannya `string` akan membuat TypeScript menjanjikan nilai
 * yang tidak ada, dan cadangannya (`moneyPalette`) tidak akan pernah ditulis.
 */
declare module "antd/es/theme/interface/alias" {
  interface AliasToken {
    /** Uang masuk / saldo positif / lunas — teks, bukan isian. */
    colorMoneyPositive?: string;
    /** Uang keluar / saldo negatif / jatuh tempo — teks, bukan isian. */
    colorMoneyNegative?: string;
    /** Menunggu / sebagian — teks, bukan isian. */
    colorMoneyPending?: string;
    /** Angka/tautan informasional sebagai teks. */
    colorMoneyInfo?: string;
    /** Teks berwarna merek yang BUKAN tautan (label aktif, penekanan). */
    colorBrandText?: string;
    colorBrandTextHover?: string;
    colorBrandTextActive?: string;
  }
}

export interface MoneyTokens {
  colorMoneyPositive: string;
  colorMoneyNegative: string;
  colorMoneyPending: string;
  colorMoneyInfo: string;
}

/** green-8 · red-8 · gold-9 · blue-7 dari palet AntD, tema terang. */
export const MONEY_TOKENS_LIGHT: MoneyTokens = {
  colorMoneyPositive: "#237804", // min 5,12:1
  colorMoneyNegative: "#b32430", // min 6,00:1
  colorMoneyPending: "#874d00", // min 6,23:1
  colorMoneyInfo: "#0958d9", // min 5,65:1
};

/**
 * Anak tangga yang sama diturunkan lewat algoritma gelap AntD
 * (`generate(seed, { theme: "dark", backgroundColor: "#141414" })`).
 * Perhatikan "menunggu": terang memakai gold-9, gelap memakai gold-8 —
 * gold-9 gelap (`#f8df8b`) juga lolos, tapi sudah nyaris krem dan tidak lagi
 * terbaca sebagai amber. Kontras bukan satu-satunya syarat; warnanya masih
 * harus berarti.
 */
export const MONEY_TOKENS_DARK: MoneyTokens = {
  colorMoneyPositive: "#8fd460", // min 9,23:1
  colorMoneyNegative: "#f39c97", // min 7,86:1
  colorMoneyPending: "#f3cc62", // min 10,69:1
  colorMoneyInfo: "#3c89e8", // min 4,66:1
};

/** Token yang didaftarkan `AntdProvider` ke `ConfigProvider` per tema. */
export function moneyTokens(resolved: ResolvedTheme): MoneyTokens {
  return resolved === "dark" ? MONEY_TOKENS_DARK : MONEY_TOKENS_LIGHT;
}

/* ------------------------------------------------------------------------ */
/* Warna merek sebagai TEKS dan sebagai ISIAN TOMBOL                          */
/* ------------------------------------------------------------------------ */

/**
 * Keputusan pemilik: warna merek = bawaan Ant Design, `colorPrimary` `#1677ff`.
 * Tidak ada brand kustom, dan `#1E40AF` lama tidak dikembalikan. Karena itu
 * `colorPrimary` sengaja TIDAK didaftarkan di mana pun — biarkan bawaan AntD
 * yang berlaku, supaya identitasnya tidak pelan-pelan menyimpang dari palet
 * yang sedang kita adopsi.
 *
 * Masalah yang ikut dengan keputusan itu, terukur (rumus yang sama, kalibrasi
 * yang sama seperti token uang di atas):
 *
 *   `#1677ff` sebagai TEKS di atas putih          = 4,10:1  -> GAGAL 4,5:1
 *   putih sebagai LABEL di atas isian `#1677ff`   = 4,10:1  -> GAGAL 4,5:1
 *   `#1677ff` di atas sidebar `#0F172A`           = 4,35:1  -> lolos 3:1 (ikon/
 *       aksen), tapi TETAP gagal 4,5:1 kalau dipakai sebagai teks 14px
 *
 * Jadi masalahnya bukan hanya "permukaan terang": yang selamat hanyalah peran
 * non-teks. Perbaikannya sama persis dengan pola token uang — identitas tetap
 * bawaan AntD, peran TEKS KECIL memakai anak tangga yang lebih jauh dari
 * latarnya, diambil dari tangga biru AntD sendiri.
 *
 * ── Teks merek & tautan ───────────────────────────────────────────────────
 * Aturannya satu kalimat: **satu tangga lebih jauh dari latar untuk keadaan
 * diam, satu tangga lagi untuk hover, satu lagi untuk aktif.** Di tema terang
 * itu berarti makin gelap (blue-7 -> 8 -> 9); di tema gelap makin terang
 * (blue-7 -> 8 -> 9 versi gelap). Nilai hover bawaan AntD tidak bisa dipakai:
 * `colorLinkHover` terang `#69b1ff` = 2,06:1 dan versi gelapnya `#15417e` =
 * 1,64:1 (terburuk di ketiga latar) — keduanya gagal bahkan ambang 3:1, jadi
 * tautannya praktis lenyap justru saat kursor menyentuhnya.
 *
 * | Peran        | TERANG    | ctr/layout/elev      | min   | GELAP     | ctr/layout/elev      | min  |
 * |--------------|-----------|----------------------|-------|-----------|----------------------|------|
 * | teks/tautan  | `#0958d9` |  6,16 /  5,65 / 6,16 |  5,65 | `#3c89e8` |  5,21 / 5,94 / 4,66  | 4,66 |
 * | hover        | `#003eb3` |  8,97 /  8,23 / 8,97 |  8,23 | `#65a9f3` |  7,48 / 8,52 / 6,69  | 6,69 |
 * | aktif        | `#002c8c` | 12,08 / 11,08 /12,08 | 11,08 | `#8dc5f8` | 10,07 /11,47 / 9,01  | 9,01 |
 */
export interface BrandTextTokens {
  colorBrandText: string;
  colorBrandTextHover: string;
  colorBrandTextActive: string;
}

/** blue-7 / blue-8 / blue-9 dari tangga `colorPrimary`, tema terang. */
export const BRAND_TEXT_LIGHT: BrandTextTokens = {
  colorBrandText: "#0958d9", // min 5,65:1
  colorBrandTextHover: "#003eb3", // min 8,23:1
  colorBrandTextActive: "#002c8c", // min 11,08:1
};

/** Tangga yang sama diturunkan lewat algoritma gelap AntD. */
export const BRAND_TEXT_DARK: BrandTextTokens = {
  colorBrandText: "#3c89e8", // min 4,66:1
  colorBrandTextHover: "#65a9f3", // min 6,69:1
  colorBrandTextActive: "#8dc5f8", // min 9,01:1
};

export function brandTextTokens(resolved: ResolvedTheme): BrandTextTokens {
  return resolved === "dark" ? BRAND_TEXT_DARK : BRAND_TEXT_LIGHT;
}

/**
 * Isian tombol primer — token KOMPONEN, bukan global.
 *
 * Yang diperbaiki di sini adalah label putihnya, bukan warnanya sebagai
 * identitas. `colorPrimary` global tetap `#1677ff` dan tetap dipakai untuk
 * cincin fokus, aksen, garis aktif, dan permukaan gelap; hanya `Button` yang
 * mendapat isian lebih gelap, karena hanya `Button` yang menaruh teks 14px di
 * ATAS warna itu.
 *
 * Tiga hal yang perlu dicatat karena berlawanan dengan dugaan:
 *
 *  1. **`colorPrimaryHover` bawaan justru arah yang salah di tema terang.**
 *     Nilainya `#4096ff` (blue-5, LEBIH TERANG): label putih di atasnya
 *     2,99:1 — lebih buruk dari 4,10:1 yang sedang kita perbaiki. Tangga yang
 *     lebih gelap yang AntD sediakan adalah `colorPrimaryActive` `#0958d9`,
 *     yaitu blue-7, warna yang sama dengan teks tautan di atas. Satu anak
 *     tangga melayani dua peran.
 *  2. **Tema gelap TIDAK perlu diubah pada keadaan diam.** Label putih di atas
 *     `#1668dc` bawaan = 5,19:1, lolos. Yang gagal hanya hover-nya
 *     (`#3c89e8` = 3,54:1), jadi hanya itu yang diganti.
 *  3. **Karena itu tombol MENGGELAP saat disentuh di kedua tema**, termasuk di
 *     tema gelap — berlawanan dengan kebiasaan AntD yang menerangkan. Alasannya
 *     terukur: menerangkan isian di tema gelap berarti menjatuhkan labelnya ke
 *     3,54:1. Harga yang dibayar adalah kontras isian terhadap halaman saat
 *     hover (2,28:1 di tema gelap); itu bisa diterima karena yang harus
 *     "menemukan" tombol adalah keadaan DIAM (3,18:1) — saat hover, kursor
 *     pengguna sendiri sudah berada di atasnya.
 *
 * | Keadaan | TERANG    | label putih | GELAP     | label putih |
 * |---------|-----------|-------------|-----------|-------------|
 * | diam    | `#0958d9` |  6,16:1     | `#1668dc` |  5,19:1     |
 * | hover   | `#003eb3` |  8,97:1     | `#1554ad` |  7,23:1     |
 * | aktif   | `#002c8c` | 12,08:1     | `#15417e` | 10,05:1     |
 *
 * Jalan keluar "biarkan `#1677ff`, besarkan hurufnya" sudah diukur dan
 * DITOLAK: ambang 3:1 baru berlaku pada ≥18,66px **tebal**, sedangkan
 * `fontSize` AntD 14px. Label tombol 19px tebal merusak seluruh skala tipografi
 * MASTER.md (body 16, caption 14) demi satu angka kontras — dan tetap tidak
 * menolong teks merek di tempat lain.
 */
export interface PrimaryButtonTokens {
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryActive: string;
}

export const PRIMARY_BUTTON_LIGHT: PrimaryButtonTokens = {
  colorPrimary: "#0958d9", // blue-7 · label putih 6,16:1
  colorPrimaryHover: "#003eb3", // blue-8 · 8,97:1
  colorPrimaryActive: "#002c8c", // blue-9 · 12,08:1
};

export const PRIMARY_BUTTON_DARK: PrimaryButtonTokens = {
  colorPrimary: "#1668dc", // bawaan AntD · label putih 5,19:1 — lolos, tak diubah
  colorPrimaryHover: "#1554ad", // blue-5 gelap · 7,23:1
  colorPrimaryActive: "#15417e", // blue-4 gelap · 10,05:1
};

export function primaryButtonTokens(resolved: ResolvedTheme): PrimaryButtonTokens {
  return resolved === "dark" ? PRIMARY_BUTTON_DARK : PRIMARY_BUTTON_LIGHT;
}

/* ------------------------------------------------------------------------ */
/* Teks bantuan & placeholder (issue #207)                                    */
/* ------------------------------------------------------------------------ */

/**
 * `colorTextTertiary` bawaan gagal 4,5:1 di KEDUA tema — dan AntD memakainya
 * untuk teks bantuan 14px.
 *
 * Tangga netral AntD tidak dibuat lewat `generate()` seperti warna berwarna.
 * Ia dibuat lewat `getAlphaColor(colorTextBase, α)` dengan α dari daftar tetap
 * (`themes/default/colors.ts`): **0,88 · 0,65 · 0,45 · 0,25** — dan versi
 * gelapnya memakai daftar yang sama dengan puncak 0,85. Anak tangga itulah
 * "palet" untuk teks netral, persis seperti green-8/red-8 untuk warna uang.
 *
 * | Peran (α)              | TERANG            | ctr / layout / elev | min  | GELAP                  | ctr / layout / elev | min  |
 * |------------------------|-------------------|---------------------|------|------------------------|---------------------|------|
 * | tersier BAWAAN (0,45)  | `rgba(0,0,0,.45)` | 3,35 / 3,31 / 3,35  | 3,31 | `rgba(255,255,255,.45)`| 4,52 / 4,41 / 4,40  | 4,40 |
 * | placeholder BAWAAN (0,25) | `rgba(0,0,0,.25)` | 1,83 / 1,82 / 1,83 | 1,82 | `rgba(255,255,255,.25)`| 2,24 / 2,02 / 2,28  | 2,02 |
 * | **pengganti (0,65)**   | `rgba(0,0,0,.65)` | 6,98 / 6,76 / 6,98  | 6,76 | `rgba(255,255,255,.65)`| 8,19 / 8,60 / 7,65  | 7,65 |
 *
 * ── Kenapa 0,65 dan bukan sesuatu di antaranya ─────────────────────────────
 * Diukur: α terkecil yang lolos 4,5:1 adalah ~0,53 (terang, di atas
 * `colorBgLayout`) dan ~0,46 (gelap, di atas `colorBgElevated`). Jadi 0,45 nyaris
 * cukup di tema gelap dan jelas tidak cukup di tema terang. Tangga AntD tidak
 * punya anak tangga antara 0,45 dan 0,65 — dan mengarang α sendiri berarti
 * berhenti memakai paletnya, yaitu hal yang justru dihindari seluruh berkas ini.
 * Maka dipakai anak tangga berikutnya, 0,65, yang nilainya sama dengan
 * `colorTextSecondary`.
 *
 * **Akibatnya jujur: tingkat "tersier" melebur ke "sekunder".** Hierarki teks
 * AntD berubah dari tiga tingkat menjadi dua (0,88 untuk isi, 0,65 untuk
 * penjelas). Itu memang kehilangan — tetapi tingkat yang tidak terbaca bukan
 * tingkat; ia hanya penanda bahwa ada sesuatu di sana. Beda 0,88 vs 0,65 masih
 * terlihat jelas, jadi teks bantuan tetap "lebih ringan" dari isinya.
 *
 * ── Placeholder: masalah TERPISAH yang mudah terlewat ──────────────────────
 * `colorTextPlaceholder` **tidak** berasal dari tersier. Di lapisan alias
 * (`theme/util/alias.ts`) ia = `colorTextQuaternary`, yaitu α 0,25 — 1,82:1,
 * jauh LEBIH buruk dari tersier. Menaikkan tersier saja meninggalkan seluruh
 * placeholder `Input`/`Select`/`DatePicker` tak terbaca.
 *
 * Yang diganti adalah alias `colorTextPlaceholder`, BUKAN `colorTextQuaternary`
 * di bawahnya. Sebabnya `colorTextDisabled` juga menunjuk kuartener, dan
 * WCAG 1.4.3 secara tegas MENGECUALIKAN kendali nonaktif: teks nonaktif yang
 * dinaikkan kontrasnya berhenti terlihat nonaktif. Terukur setelah override:
 * `colorTextDisabled` tetap `rgba(0,0,0,0.25)` — persis yang diinginkan.
 *
 * Harga yang dibayar: placeholder jadi hampir sepekat nilai isian sungguhan
 * (0,65 vs 0,88), sehingga kolom kosong bisa terbaca seolah terisi. Itu bisa
 * diterima **hanya karena aturan MASTER.md**: label selalu terlihat, tak pernah
 * diganti placeholder. Placeholder di aplikasi ini berisi contoh format, dan
 * contoh format adalah informasi — informasi 1,82:1 sama saja tidak ada.
 */
export interface NeutralTextTokens {
  colorTextTertiary: string;
  colorTextPlaceholder: string;
}

/** α 0,65 — anak tangga `colorTextSecondary` dari `colorTextBase` `#000`. */
export const NEUTRAL_TEXT_LIGHT: NeutralTextTokens = {
  colorTextTertiary: "rgba(0,0,0,0.65)", // min 6,76:1
  colorTextPlaceholder: "rgba(0,0,0,0.65)", // min 6,76:1
};

/** Anak tangga yang sama dari `colorTextBase` `#fff` versi gelap. */
export const NEUTRAL_TEXT_DARK: NeutralTextTokens = {
  colorTextTertiary: "rgba(255,255,255,0.65)", // min 7,65:1
  colorTextPlaceholder: "rgba(255,255,255,0.65)", // min 7,65:1
};

export function neutralTextTokens(resolved: ResolvedTheme): NeutralTextTokens {
  return resolved === "dark" ? NEUTRAL_TEXT_DARK : NEUTRAL_TEXT_LIGHT;
}

/* ------------------------------------------------------------------------ */
/* Batas: kisi tabel, tepi kartu, garis pemisah (issue #208)                  */
/* ------------------------------------------------------------------------ */

/**
 * `colorBorder` bawaan berkontras 1,29:1 (terang) / 1,64:1 (gelap) terhadap
 * latar terburuknya. Itu mengulang jebakan yang sudah tertulis di MASTER.md —
 * "batas antar-bidang yang sewarna wajib punya `border`" — lewat jalan lain:
 * batasnya ada, hanya tak terlihat.
 *
 * ── Yang membuat temuan ini lebih besar dari judulnya ──────────────────────
 * Kisi tabel TIDAK memakai `colorBorder`. Dibaca dari `table/style/index.ts`,
 * token komponen `Table.borderColor` dan `Table.headerSplitColor` keduanya
 * `colorBorderSecondary` — dan `Card` memakai token yang sama untuk tepinya.
 * `colorBorderSecondary` bawaan adalah yang TERBURUK dari ketiganya: 1,05:1
 * terang. Memperbaiki `colorBorder` saja akan menaikkan kotak isian dan
 * meninggalkan justru kisi tabel dan tepi kartu — dua hal yang disebut issue —
 * tepat seperti semula.
 *
 * ── Anak tangganya: palet `grey` resmi AntD ────────────────────────────────
 * Netral bawaan bukan anak tangga palet mana pun; ia `getSolidColor(colorBgBase,
 * N)` — putih digelapkan N% (terang) atau hitam diterangkan N% (gelap), dengan
 * N ∈ {6, 15} dan {19, 26}. Tidak ada N yang lebih jauh; menambah N sendiri
 * sama saja mengarang. Yang tersedia dan resmi adalah `presetPalettes.grey` /
 * `presetDarkPalettes.grey` dari `@ant-design/colors`, palet yang sama yang
 * memberi green/red/blue pada token uang.
 *
 * | Peran                   | TERANG            | ctr / layout / elev | min  | GELAP             | ctr / layout / elev | min  |
 * |-------------------------|-------------------|---------------------|------|-------------------|---------------------|------|
 * | `colorBorder` BAWAAN    | `#d9d9d9`         | 1,41 / 1,29 / 1,41  | 1,29 | `#424242`         | 1,83 / 2,09 / 1,64  | 1,64 |
 * | `colorBorderSecondary` BAWAAN | `#f0f0f0`   | 1,14 / 1,05 / 1,14  | 1,05 | `#303030`         | 1,40 / 1,59 / 1,25  | 1,25 |
 * | `colorSplit` BAWAAN     | `rgba(5,5,5,.06)` | 1,14 / 1,14 / 1,14  | 1,14 | `rgba(253,253,253,.12)` | 1,40 / 1,26 / 1,44 | 1,26 |
 * | **`colorBorder`**       | `#808080` grey-4  | 3,95 / 3,62 / 3,95  | 3,62 | `#7b7b7b` grey-8  | 4,35 / 4,96 / 3,89  | 3,89 |
 * | **`colorBorderSecondary`** | `#8c8c8c` grey-3 | 3,36 / 3,08 / 3,36 | 3,08 | `#6a6a6a` grey-7 | 3,41 / 3,88 / 3,05  | 3,05 |
 * | **`colorSplit`**        | `#999999` grey-2  | 2,85 / 2,61 / 2,85  | 2,61 | `#5a5a5a` grey-6  | 2,67 / 3,04 / 2,39  | 2,39 |
 *
 * ── Mana yang MEMBAWA MAKNA, mana yang dekoratif ───────────────────────────
 * Ini keputusan yang menentukan seberapa berisik layar, jadi ditulis eksplisit:
 *
 *  • **`colorBorderSecondary` = membawa makna, ambang 3:1.** Kisi tabel dan
 *    tepi kartu. Kisi adalah cara orang melacak satu baris uang menyeberangi
 *    layar 1440px; tepi kartu adalah satu-satunya yang memisahkan panel dari
 *    halaman sewarna di tema gelap. Dipakai anak tangga PERTAMA yang melewati
 *    3:1 — grey-3 terang (3,08) dan grey-7 gelap (3,05) — bukan yang lebih
 *    gelap. Grey-5 `#737373` (4,35) juga lolos, tapi kisi setebal itu membuat
 *    tabel terbaca seperti kertas milimeter; ambangnya lantai, bukan target.
 *  • **`colorBorder` = membawa makna, ambang 3:1.** Ini batas kendali interaktif
 *    (`Input`, `Select`, `DatePicker`, tombol `default`), dan WCAG 1.4.11
 *    menuntut 3:1 untuk batas komponen — kotak isian yang tak terlihat batasnya
 *    berhenti terbaca sebagai kotak isian. Diberi satu anak tangga LEBIH kuat
 *    dari kisi (grey-4 / grey-8) supaya hierarki dua tingkat milik AntD tetap
 *    ada: kendali menonjol di atas wadahnya, bukan sekuat wadahnya.
 *  • **`colorSplit` = DEKORATIF, sengaja di BAWAH 3:1** (2,61 / 2,39). Ia
 *    dipakai `Divider`, pemisah `List`, `Descriptions`, `Timeline` — garis yang
 *    memisahkan isi yang sudah dipisahkan judul dan ruang kosong. Satu anak
 *    tangga di bawah kisi: terlihat, tapi tak pernah tertukar dengan batas
 *    bidang.
 *
 * `colorSplit` HARUS disebut, tidak boleh dibiarkan: di lapisan alias ia
 * turunan `colorBorderSecondary` (`getAlphaColor(colorBorderSecondary,
 * colorBgContainer)`), jadi menaikkan kisi tanpa menyebutnya akan menyeret
 * setiap `Divider` ikut menjadi garis pekat.
 *
 * Yang TIDAK ikut naik, dan itu disengaja: `colorBorderDisabled` (token
 * terpisah, tetap `#d9d9d9`/`#424242`) — sama seperti teks nonaktif, kendali
 * nonaktif dikecualikan WCAG dan harus tetap terlihat nonaktif.
 *
 * Catatan tema gelap: sidebar aplikasi `#0F172A` berkontras 1,03:1 terhadap
 * `colorBgContainer` gelap — persis jebakan "dua bidang sewarna" di MASTER.md.
 * Batas grey-8 di atas sidebar itu berkontras 4,22:1, jadi pembagian kolomnya
 * kembali terlihat.
 */
export interface BorderTokens {
  colorBorder: string;
  colorBorderSecondary: string;
  colorSplit: string;
}

/** grey-4 / grey-3 / grey-2 dari `presetPalettes.grey`. */
export const BORDER_TOKENS_LIGHT: BorderTokens = {
  colorBorder: "#808080", // min 3,62:1
  colorBorderSecondary: "#8c8c8c", // min 3,08:1
  colorSplit: "#999999", // min 2,61:1 — dekoratif, sengaja di bawah 3:1
};

/** grey-8 / grey-7 / grey-6 dari `presetDarkPalettes.grey`. */
export const BORDER_TOKENS_DARK: BorderTokens = {
  colorBorder: "#7b7b7b", // min 3,89:1
  colorBorderSecondary: "#6a6a6a", // min 3,05:1
  colorSplit: "#5a5a5a", // min 2,39:1 — dekoratif, sengaja di bawah 3:1
};

export function borderTokens(resolved: ResolvedTheme): BorderTokens {
  return resolved === "dark" ? BORDER_TOKENS_DARK : BORDER_TOKENS_LIGHT;
}

/** Sumber token yang cukup bagi `moneyPalette` — apa pun yang `useToken()` beri. */
type MoneyTokenSource = Partial<MoneyTokens> & { colorBgContainer: string };

/**
 * Luminansi relatif WCAG 2.x. Hanya untuk memutuskan "permukaan ini gelap atau
 * terang" pada jalur cadangan di bawah — bukan penghitung kontras umum; yang
 * itu hidup di `tests/money-tokens.test.ts` supaya angka di kepala berkas ini
 * benar-benar diverifikasi, bukan dipercaya.
 */
function luminance(color: string): number {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const channels = [0, 2, 4].map((i) => {
    const s = parseInt(full.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Warna uang untuk token AntD yang sedang berlaku.
 *
 * Jalur normal: token kustom sudah didaftarkan `AntdProvider`, jadi nilainya
 * dipakai apa adanya. Jalur cadangan dipakai saat komponen dirender di luar
 * provider (uji unit, render terisolasi) — dan cadangan itu **tidak** boleh
 * asal memilih tabel terang: `Money` di atas permukaan gelap dengan `#b32430`
 * berkontras 1,9:1, yaitu persis kegagalan yang seluruh berkas ini cegah.
 * Karena itu temanya disimpulkan dari `colorBgContainer`, satu-satunya petunjuk
 * yang SELALU ada di token AntD.
 */
export function moneyPalette(token: MoneyTokenSource): MoneyTokens {
  const fallback = luminance(token.colorBgContainer) < 0.5 ? MONEY_TOKENS_DARK : MONEY_TOKENS_LIGHT;
  return {
    colorMoneyPositive: token.colorMoneyPositive ?? fallback.colorMoneyPositive,
    colorMoneyNegative: token.colorMoneyNegative ?? fallback.colorMoneyNegative,
    colorMoneyPending: token.colorMoneyPending ?? fallback.colorMoneyPending,
    colorMoneyInfo: token.colorMoneyInfo ?? fallback.colorMoneyInfo,
  };
}
