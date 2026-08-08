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
 * untuk isian pekat, ikon berlatar, dan `Progress` — di sana ambangnya 3:1
 * non-teks. Yang diganti hanya perannya sebagai warna teks.
 *
 * **Koreksi (issue #187): `Tag` dan `Badge` dulu ikut disebut di kalimat itu,
 * dan itu keliru.** Keduanya bukan isian — keduanya TEKS berlatar tipis, dan
 * teksnya `fontSizeSM` = 12px. Diukur pada `Tag` yang benar-benar terpasang:
 * `colorSuccess` di atas `colorSuccessBg` = **2,21:1** di tema terang. Jadi
 * memakai bawaan di sana mengulang persis kegagalan yang berkas ini cegah,
 * hanya pada komponen lain. Penggantinya di bagian `tagStatusTokens` di bawah.
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
    /**
     * Nada permukaan kepala tabel (issue #266). Alias GLOBAL, bukan token
     * `components.Table` — alasannya di bagian "Jenjang di perender" di bawah:
     * `StaticTable` menggambar sel judulnya sendiri dan tidak merender satu pun
     * komponen AntD, jadi variabel token KOMPONEN tidak akan ada di dokumen.
     */
    colorTableHeadBg?: string;
  }
}

/* ------------------------------------------------------------------------ */
/* Token sebagai VARIABEL CSS yang sampai ke server component (issue #227)    */
/* ------------------------------------------------------------------------ */

/**
 * Kelas pembawa blok variabel token AntD — dipasang pada `<html>`.
 *
 * ── Masalah yang diselesaikannya ──────────────────────────────────────────
 * Server component yang butuh WARNA, bukan interaktivitas, sebelumnya hanya
 * punya dua pilihan: menyeberang jadi client demi `theme.useToken()` (itu yang
 * terjadi pada `document-chain-timeline.tsx` di #194), atau kehilangan warnanya
 * (itu yang terjadi pada `aging.tsx`). Keduanya harga yang tidak perlu dibayar.
 *
 * ── Yang sebenarnya terjadi, terukur ──────────────────────────────────────
 * Catatan #194 dan #227 menyimpulkan `extractStyle()` tidak memuat blok
 * variabelnya sama sekali. **Kesimpulan itu keliru, dan kekeliruannya satu
 * kata.** Diukur ulang terhadap `antd` 6.5.3 + `@ant-design/cssinjs` 2.1.2 yang
 * terpasang (`tests/antd-css-var-ssr.test.tsx` menghitungnya setiap kali suite
 * berjalan):
 *
 *  1. **`cssVar` sudah MENYALA sebagai bawaan di AntD v6.** Tanpa opsi apa pun,
 *     `ConfigProvider` sudah menulis seluruh token sebagai variabel.
 *  2. **`extractStyle()` MEMUAT blok itu** — `types` bawaannya
 *     `['style','token','cssVar']`, dan cabang `token` persis mengeluarkan
 *     `cssVarsStr` yang di peramban disuntik `updateCSS`. Diukur: blok ~13 kB
 *     tetap keluar bahkan ketika pohonnya TIDAK memuat satu pun komponen AntD.
 *  3. Yang tidak pernah ada adalah string `--sai-`: `cssVar.key` menentukan
 *     **nama KELAS** pemikul blok, sedangkan nama variabelnya ditentukan
 *     `cssVar.prefix` yang bawaannya `ant`. Pencarian `--sai-` karena itu
 *     mengembalikan "tidak ada" pada blok yang sebenarnya ada — sebagai
 *     `.css-var-«useId»{--ant-color-…}`.
 *
 * Jadi satu-satunya yang benar-benar hilang adalah PEMIKUL kelasnya: bawaannya
 * kelas ber-`useId` yang hanya dipasang komponen AntD pada dirinya sendiri, dan
 * di halaman tanpa komponen AntD di atasnya `var(--ant-…)` memang tidak pernah
 * teratasi. Memberi `cssVar` sebuah kunci TETAP membuat selektornya bisa
 * ditebak, dan memasang kunci itu di `<html>` (root layout) membuat seluruh
 * dokumen mewarisinya.
 *
 * ── Kenapa ini tidak mengembalikan kedipan #184 ───────────────────────────
 * Urutannya, karena orang berikutnya tidak akan menebaknya benar:
 *
 *   `AntdRegistry` (root layout) memanggil `extractStyle(cache, {plain, once})`
 *   di dalam `useServerInsertedHTML`. `ConfigProvider` adalah hal PERTAMA yang
 *   dirender di bawah registry, jadi entri cache `token%…` sudah ada sebelum
 *   flush pertama — blok variabelnya ikut pada kepingan HTML pertama, bersama
 *   gaya komponen, di dalam SATU `<style id="antd-cssinjs">` yang sama.
 *
 * Letaknya di dalam blok itu sengaja TIDAK dijaga, dan itu keputusan bukan
 * kelalaian: terukur, blok variabel justru berdiri SESUDAH gaya komponen. Untuk
 * properti kustom hal itu tidak berpengaruh — setiap `--ant-…` hanya
 * dideklarasikan sekali, jadi tidak ada yang bisa saling menimpa, dan satu
 * elemen `<style>` diurai peramban sekaligus. Yang harus dijaga adalah keduanya
 * berada di dalam SATU elemen `<style>` yang sama; itulah yang diuji.
 *
 * Tidak ada langkah client di jalur itu: `<html class="…">` datang dari server
 * dan blok variabelnya datang dari server. Yang berjalan setelah hydrate hanya
 * `updateCSS` milik `useCacheToken`, dan ia memakai kunci hash yang sama
 * (`css-var-«key»`) — jadi pergantian tema saat berjalan MENIMPA blok yang sama
 * alih-alih menumpuk blok kedua. Itulah yang membuat toggle tema tetap hidup
 * untuk server component: nilainya berganti, markup-nya tidak perlu dirender
 * ulang.
 *
 * ── Kenapa namanya bukan `css-var-root` ───────────────────────────────────
 * Kelas ini ikut menempel pada setiap komponen AntD (AntD memasangnya sendiri
 * lewat `useCSSVarCls`), jadi ia akan terlihat di markup di mana-mana. Nama
 * bermerek membuat jelas dari mana ia datang saat seseorang menemukannya di
 * inspektur; nama generik `css-var-root` terbaca seperti kelas milik pustaka
 * dan mengundang orang menghapusnya.
 */
export const ANTD_CSS_VAR_KEY = "sai-tokens";

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
/* Cincin fokus keyboard (issue #187)                                         */
/* ------------------------------------------------------------------------ */

/**
 * Warna cincin fokus — SATU token yang melayani seluruh keluarga kendali.
 *
 * ── Token mana yang sebenarnya menggambar cincin itu ───────────────────────
 * Bukan `colorPrimary`. Dibaca dari `antd/es/style/index.ts`, setiap komponen
 * memakai `genFocusStyle()`, dan isinya satu baris:
 *
 *     outline: `${lineWidthFocus}px solid ${colorPrimaryBorder}`  (offset 1px)
 *
 * Jadi yang menentukan terlihat-tidaknya fokus keyboard adalah
 * **`colorPrimaryBorder`** — anak tangga blue-3, yang AntD pilih sebagai warna
 * BATAS LEMBUT, bukan sebagai penanda keadaan. Terukur (min di antara
 * `colorBgContainer`, `colorBgLayout`, `colorBgElevated`):
 *
 *   terang `#91caff` = **1,59:1**   ·   gelap `#15325b` = **1,29:1**
 *
 * Keduanya jauh di bawah 3:1 yang diminta WCAG 1.4.11 / 2.4.13 untuk penanda
 * fokus. Praktisnya: pengguna keyboard tidak bisa melihat di mana ia berada —
 * kegagalan yang tidak pernah muncul di layar orang yang memakai tetikus, dan
 * karena itu nyaris tidak pernah ditemukan tanpa diukur.
 *
 * ── Kenapa nilainya tidak baru ─────────────────────────────────────────────
 * Cincin fokus tidak membutuhkan warna sendiri: yang dibutuhkannya adalah warna
 * merek yang SUDAH terbukti lolos di ketiga latar. Itu persis `colorBrandText`
 * (#186). Memakai ulang anak tangga yang sama berarti fokus, tautan, dan teks
 * merek tidak bisa berpisah rupa, dan tidak ada satu pun hex tambahan yang
 * harus diaudit ulang saat palet bergeser.
 *
 * | Tema   | cincin    | ctr / layout / elev  | min  |
 * |--------|-----------|----------------------|------|
 * | terang | `#0958d9` |  6,16 /  5,65 / 6,16 | 5,65 |
 * | gelap  | `#3c89e8` |  5,21 /  5,94 / 4,66 | 4,66 |
 *
 * Cincin digambar `outline` dengan `outline-offset: 1px`, jadi ada satu piksel
 * warna HALAMAN antara isian tombol dan cincinnya. Itu sebabnya angka yang
 * berlaku adalah kontras terhadap LATAR, bukan terhadap isian tombol — cincin
 * biru tua di sekeliling tombol primer biru tua tetap terbaca sebagai cincin
 * karena garis pemisah satu piksel itu.
 */
export function focusRingColor(resolved: ResolvedTheme): string {
  return brandTextTokens(resolved).colorBrandText;
}

/* ------------------------------------------------------------------------ */
/* Label status: `Tag` (issue #187, menggantikan Badge lama)                   */
/* ------------------------------------------------------------------------ */

/**
 * Warna TEKS `Tag` untuk keempat status AntD — token KOMPONEN, bukan global.
 *
 * ── Kenapa bawaannya tidak bisa dipakai ────────────────────────────────────
 * `Tag` menaruh teks `fontSizeSM` (12px) di atas latar tipis
 * `color*Bg`, dan mewarnai teks itu dengan `color*` — anak tangga ke-6, yang
 * dipilih AntD untuk ISIAN. Diukur terhadap latar `Tag` itu sendiri:
 *
 * | Status     | TERANG                      | GELAP                        |
 * |------------|-----------------------------|------------------------------|
 * | success    | `#52c41a` / `#f6ffed` 2,21  | `#49aa19` / `#162312`  5,49  |
 * | warning    | `#faad14` / `#fffbe6` 1,83  | `#d89614` / `#2b2111`  6,24  |
 * | error      | `#ff4d4f` / `#fff2f0` 2,99  | `#dc4446` / `#2c1618`  4,01  |
 * | processing | `#1677ff` / `#e6f4ff` 3,66  | `#1668dc` / `#111a2c`  3,35  |
 *
 * Empat dari delapan gagal 4,5:1, dan yang terburuk ada di tema terang — tema
 * bawaan aplikasi ini. Badge lama (`--*-soft` + `--*-strong`) berada di
 * 6,4–6,8:1, jadi memakai bawaan AntD bukan sekadar "kurang ideal": ia
 * MEMUNDURKAN label status "Lunas / Menunggu / Jatuh Tempo" dari lolos AA
 * menjadi gagal, di 52 berkas sekaligus.
 *
 * ── Penggantinya bukan warna baru ──────────────────────────────────────────
 * Peran ini sama persis dengan peran token uang: kata berwarna, ukuran kecil,
 * di atas permukaan terang. Karena itu dipakai token uang #186 apa adanya —
 * positif/menunggu/negatif/info — dan tidak ada satu hex pun yang lahir di
 * issue ini. Latar dan batas `Tag` TETAP bawaan AntD; yang diganti hanya warna
 * teksnya, sama seperti #186 hanya mengganti peran teks `colorSuccess`.
 *
 * Terukur ulang pada latar `Tag` (bukan pada latar halaman):
 *
 * | Status     | TERANG           | GELAP            |
 * |------------|------------------|------------------|
 * | success    | `#237804`  5,44  | `#8fd460`  9,16  |
 * | warning    | `#874d00`  6,53  | `#f3cc62` 10,26  |
 * | error      | `#b32430`  5,98  | `#f39c97`  8,11  |
 * | processing | `#0958d9`  5,50  | `#3c89e8`  4,91  |
 *
 * Didaftarkan sebagai `components.Tag`, bukan token global: `colorSuccess`
 * global tetap dibutuhkan apa adanya untuk isian pekat dan ikon berlatar, di
 * mana ambangnya memang 3:1. Yang dipersempit hanya lingkupnya ke komponen yang
 * memakainya sebagai TEKS.
 */
export interface TagStatusTokens {
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
}

export function tagStatusTokens(resolved: ResolvedTheme): TagStatusTokens {
  const money = moneyTokens(resolved);
  return {
    colorSuccess: money.colorMoneyPositive,
    colorWarning: money.colorMoneyPending,
    colorError: money.colorMoneyNegative,
    colorInfo: money.colorMoneyInfo,
  };
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
 * Catatan tema gelap, **diukur ulang di #205**: sidebar aplikasi adalah
 * `SIDER_BG_DARK` `#001529` — bukan `#0F172A`, palet lama yang sempat tertulis
 * di sini — dan ia berkontras **1,00:1** terhadap `colorBgContainer` gelap
 * (`#141414`), yaitu bentuk paling murni jebakan "dua bidang sewarna" di
 * MASTER.md: dua bidang yang secara luminansi TIDAK bisa dibedakan sama
 * sekali. Terhadap `colorBgLayout` gelap (`#000000`) angkanya 1,14:1.
 *
 * Karena itu batas antar keduanya wajib `colorBorderSecondary` (3,41:1 di atas
 * sider, minimum 3,05:1 di sisi seberangnya) dan **bukan** `colorSplit`, yang
 * sengaja ditahan di bawah 3:1 sebagai pemisah dekoratif — terukur hanya
 * 2,67:1 di atas sider. Ketiga shell gelap (`sidebar`, `auth-shell`,
 * `platform-shell`) dikunci pada token yang benar oleh
 * `tests/antd-tokens.test.ts`.
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

/* ------------------------------------------------------------------------ */
/* Jenjang permukaan: DIUKUR, lalu sengaja TIDAK digeser (issue #266)        */
/* ------------------------------------------------------------------------ */

/**
 * `colorBgLayout` / `colorBgContainer` / `colorBgElevated` — tiga permukaan
 * yang menyusun setiap layar, dan **tetap bawaan Ant Design apa adanya setelah
 * diukur**, sama seperti `colorBgMask` (#190).
 *
 * Bagian ini ada supaya keputusan "tidak melakukan apa-apa" itu tercatat
 * beserta angkanya — pola yang sama dengan `colorBgMask` (#190) di bawah.
 * Tanpa catatan ini, orang berikutnya yang membaca issue #266 akan mengulang
 * seluruh pengukuran di bawah dan sampai ke dinding yang sama.
 *
 * ── Keluhan yang memicunya ────────────────────────────────────────────────
 * Pemilik: aplikasi terasa "dominan putih-hitam dengan **outline saja**".
 * Terukur, latar halaman dan permukaan kartu memang nyaris sewarna:
 *
 * | Tema   | halaman   | kartu/tabel | melayang  | kartu vs halaman | ΔL*  |
 * |--------|-----------|-------------|-----------|------------------|------|
 * | terang | `#f5f5f5` | `#ffffff`   | `#ffffff` | 1,09:1           | 3,46 |
 * | gelap  | `#000000` | `#141414`   | `#1f1f1f` | 1,14:1           | 6,32 |
 *
 * (ΔL* = selisih lightness CIE — satuan yang berarti untuk dua BIDANG
 * bersebelahan; rasio WCAG dibuat untuk teks di atas latar, dan pada dua
 * abu-abu terang ia memampatkan perbedaan yang masih terlihat mata.)
 *
 * ── Dinding pertama: setiap permukaan terang dipatok oleh #208 ────────────
 * Menggelapkan latar halaman menurunkan kontras SETIAP tinta yang mendarat di
 * atasnya. Diukur — permukaan netral (r=g=b) paling gelap yang masih
 * dilewati tiap token, di tema terang:
 *
 * | Tinta                                 | ambang | permukaan tergelap |
 * |---------------------------------------|--------|--------------------|
 * | `colorBorderSecondary` `#8c8c8c` (#208) | 3:1  | **`#f2f2f2`**      |
 * | `colorMoneyPositive` `#237804` (#186)   | 4,5:1| `#e7e7e7`          |
 * | `colorBorder` `#808080` (#208)          | 3:1  | `#e1e1e1`          |
 * | `colorMoneyInfo` / `colorBrandText`     | 4,5:1| `#dddddd`          |
 * | `colorMoneyNegative` `#b32430`          | 4,5:1| `#d7d7d7`          |
 * | `colorMoneyPending` `#874d00`           | 4,5:1| `#d3d3d3`          |
 * | teks bantuan `rgba(0,0,0,0.65)` (#207)  | 4,5:1| `#a1a1a1`          |
 *
 * Yang mematok bukan teksnya melainkan **tepi kartu**: `colorBorderSecondary`
 * berdiri di ANTARA kartu putih dan halaman, jadi ia harus lolos 3:1 di kedua
 * sisinya. Latar `#f2f2f2` menyisakan ΔL* 4,51 — 1,05 lebih banyak dari hari
 * ini, yaitu perbedaan yang tidak akan terlihat siapa pun, ditukar dengan
 * SELURUH margin sebuah ambang yang dijaga (3,00:1 tepat). Itu bukan tukaran
 * yang layak diambil, dan karena itu tidak diambil.
 *
 * Dan tangga netral AntD sendiri tidak menawarkan apa pun di antaranya. Netral
 * terang AntD lahir dari `colorFill*` yang dikomposit ke putih — `#fafafa`
 * (α 0,02) · `#f5f5f5` (α 0,04, yang berlaku hari ini) · `#f0f0f0` (α 0,06) ·
 * `#d9d9d9` (α 0,15). Anak tangga berikutnya keduanya menabrak:
 *
 *   `#f0f0f0` -> tepi kartu 2,95:1  (GAGAL 3:1; ΔL* hanya 5,20)
 *   `#d9d9d9` -> tepi kartu 2,38:1 dan uang-positif 3,96:1 (GAGAL keduanya)
 *
 * ── Dinding kedua: tema gelap dipatok oleh #186 ───────────────────────────
 * Arahnya terbalik dan hasilnya sama. Permukaan gelap paling TERANG yang masih
 * dilewati tiap token: `colorMoneyInfo` `#3c89e8` -> `#212121`,
 * `colorBorderSecondary` `#6a6a6a` -> `#202020`. `colorBgElevated` gelap hari
 * ini `#1f1f1f` — tersisa **tiga satuan RGB** sebelum warna tautan/angka
 * informasional jatuh di bawah 4,5:1. Permukaan gelap karena itu juga tidak
 * bisa direnggangkan.
 *
 * Akibat yang perlu ikut dicatat untuk #205: panel dialog gelap vs halaman
 * bertirai (1,27:1 terukur di sini) **tidak bisa** diperbaiki dari lapisan
 * token. Menaikkan `colorBgElevated` menjatuhkan `colorMoneyInfo`; menggelapkan
 * `colorBgMask` tidak melakukan apa-apa karena `colorBgLayout` gelap sudah
 * `#000000` — tirai hitam di atas hitam. Yang tersisa adalah bayangan/tepi
 * Modal, dan itu bukan warna. (Di tema terang angkanya sehat: panel putih vs
 * halaman bertirai `#878787` = 3,59:1.)
 *
 * ── Kenapa menggeser latar TETAP ditolak walau ada jalan yang "lolos" ─────
 * Ada satu susunan yang melewati semua ambang: latar `#f0f0f0` **bersama**
 * kisi/tepi naik ke grey-4 (`#808080`) dan batas kendali ke grey-5
 * (`#737373`). Terukur, tak satu pun pasangan turun — kisi 3,08 -> 3,47,
 * kendali 3,62 -> 4,16, uang-positif 5,12 -> 4,90 (tetap di atas 4,5).
 *
 * Ia tetap ditolak, dan alasannya membaca keluhannya, bukan angkanya: susunan
 * itu **menggelapkan setiap garis di aplikasi** demi menambah ΔL* 1,74 pada
 * bidangnya. Keluhannya berbunyi "outline saja" — jadi menambah bobot outline
 * adalah arah yang salah, betapa pun sehat angkanya.
 *
 * Dan di situlah letak temuan yang sebenarnya. #208 menaikkan kisi dari 1,05:1
 * (bawaan AntD — kalibrasi yang berlaku di hampir setiap aplikasi di atas
 * pustaka ini) menjadi 3,08:1, hampir tiga kali lipat. Itu SENGAJA, supaya kisi
 * membawa makna, dan itu keputusan aksesibilitas yang tidak boleh dibalik.
 * Tetapi konsekuensinya baru terbaca sekarang: garis
 * setegas itu MEMANG menjadi hal paling menonjol di layar, dan ia sekaligus
 * yang memaku setiap bidang di dalam pita 3,5% antara `#ffffff` dan `#f2f2f2`.
 * **#208 dan #266 terhubung lewat satu angka**, dan keduanya tidak bisa sama-
 * sama berada di ujung "tenang"-nya.
 *
 * ── Yang tersisa, dan kenapa bukan di lapisan token ──────────────────────
 * Isyarat "terangkat" yang tidak memakai luminansi bidang dan karena itu
 * berongkos kontras NOL: **bayangan** pada kartu (`boxShadow`, MASTER.md
 * menyebut `--ant-box-shadow-tertiary` sebagai "lift halus") dan **kepala
 * tabel bernada** pada nilai yang sudah terbukti aman.
 *
 * Keduanya tidak bisa dijangkau dari lapisan token: `Card` AntD tidak punya
 * token bayangan sama sekali (lihat `antd/es/card/style` — `headerBg`,
 * `actionsBg`, padding, tinggi; tidak ada `boxShadow`), dan `Table.headerBg`
 * hanya mengenai `DataTable` (20 dari 66 tabel) sedangkan `StaticTable`
 * menggambar sel judulnya sendiri tanpa latar. Menyetel `Table.headerBg`
 * sendirian karena itu menghasilkan dua rupa tabel di satu produk — lebih
 * buruk dari tidak melakukan apa-apa.
 *
 * **Pemilik memilih jalan itu**, dan ia dikerjakan di perender: bayangannya di
 * `ui/card.tsx`, nadanya di `ui/table.tsx` + `components.Table` sekaligus.
 * Nilai nadanya, beserta buktinya bahwa ongkos kontrasnya benar-benar nol,
 * ada di bagian berikutnya di berkas ini.
 *
 * ── Kalau suatu hari permukaannya MEMANG digeser ─────────────────────────
 * Dua tempat di luar `ConfigProvider` ikut memikul nilainya, dan keduanya diam
 * kalau tertinggal: nilai cadangan `var(--ant-color-bg-layout, #f5f5f5)` pada
 * `body` di `globals.css` (dipakai halaman galat Next yang dirender DI LUAR
 * `AntdRegistry`), dan blok `html.dark` di berkas yang sama, yang menahan latar
 * gelap untuk pilihan "ikut sistem" sebelum hydrate. Yang tertinggal tidak
 * menghasilkan galat — hanya satu frame, atau satu halaman galat, berlatar
 * warna lama.
 *
 * Semua yang tertulis di sini dihitung ulang setiap kali suite berjalan di
 * `tests/antd-tokens.test.ts` (bagian "jenjang permukaan"), dari paket `antd`
 * yang benar-benar terpasang — termasuk kedua dinding di atas. Kalau bagian itu
 * merah, permukaan sudah bergeser dan seluruh tabel di berkas ini harus
 * diturunkan ulang, bukan ditambal satu hex.
 */

/* ------------------------------------------------------------------------ */
/* Jenjang di PERENDER: nada kepala tabel (issue #266, jalan B)              */
/* ------------------------------------------------------------------------ */

/**
 * Latar sel judul tabel — **satu nilai untuk KEDUA perender**.
 *
 * ── Kenapa ia token GLOBAL dan bukan `components.Table.headerBg` ──────────
 * Karena `components.Table` hanya menjangkau `DataTable`. `StaticTable`
 * menggambar `<th>`-nya sendiri lewat `ui/table.tsx`, yang server-safe dan
 * karena itu tidak boleh memanggil `theme.useToken()`; satu-satunya warna yang
 * bisa dipakainya adalah `var(--ant-…)`. Dan variabel token KOMPONEN AntD baru
 * ada di dokumen bila komponennya benar-benar dirender — alasan yang sama yang
 * membuat `SIDER_BG_DARK` di bawah ditulis sebagai konstanta. Sebuah halaman
 * laporan yang hanya berisi `StaticTable` tidak merender satu pun `Table` AntD,
 * jadi `var(--ant-table-header-bg)` di sana tidak akan pernah teratasi dan
 * kepalanya jatuh diam-diam ke tanpa-latar.
 *
 * Karena itu nadanya didaftarkan sebagai ALIAS global (`colorTableHeadBg` →
 * `--ant-color-table-head-bg`, teratasi di seluruh dokumen sejak #227), dan
 * `AntdProvider` mengoper nilai YANG SAMA ke `components.Table.headerBg`. Dua
 * perender, satu angka; kalau salah satunya lepas, penjaga "jenjang perender"
 * di `tests/antd-tokens.test.ts` merah.
 *
 * ── Kenapa ongkos kontrasnya NOL, dan itu bukan kiasan ────────────────────
 * Kedua nilainya adalah permukaan yang SUDAH diukur — anggota `SURFACES` yang
 * dipakai `worst()` di seluruh berkas ini. Lebih dari itu: di masing-masing
 * tema, nilai itu justru permukaan tempat setiap minimum yang tertulis di
 * berkas ini diambil. Terukur ulang di atas nada kepala:
 *
 * | Tinta di kepala tabel                   | ambang | TERANG `#f5f5f5` | GELAP `#1f1f1f` |
 * |-----------------------------------------|--------|------------------|-----------------|
 * | judul kolom & tautan sortir (sekunder)  | 4,5:1  | 6,76             | 7,65            |
 * | tautan sortir saat hover (`colorText`)  | 4,5:1  | 15,39            | 12,18           |
 * | penanda urut nonaktif (`colorBorder`)   | 3:1    | 3,62             | 3,89            |
 * | kisi & garis kepala (`…BorderSecondary`)| 3:1    | 3,08             | 3,05            |
 *
 * Keempatnya identik dengan angka "min" yang sudah tertulis di tabel-tabel di
 * atas. Itu bukan kebetulan — itu definisi `worst()`.
 *
 * ── Kenapa terang TURUN dan gelap NAIK ────────────────────────────────────
 * Bukan selera; kedua arah itu satu-satunya yang tersedia, dan yang menutup
 * arah sebaliknya adalah tepi #208 — dinding yang sama yang menutup jalan token
 * di bagian sebelumnya.
 *
 *  • **Terang.** Di atas `#ffffff` tidak ada apa pun, jadi nadanya harus lebih
 *    gelap. Permukaan netral tergelap yang masih dilewati `colorBorderSecondary`
 *    adalah `#f2f2f2`; `#f5f5f5` berada di sisi aman dan sudah terukur. Bedanya
 *    ΔL* 4,51 vs 3,46 — 1,05, yang menurut pengukuran #269 tidak akan terlihat
 *    siapa pun — ditukar dengan SELURUH margin ambang 3:1. Tidak diambil.
 *  • **Gelap.** Permukaan gelap paling TERANG yang masih dilewati
 *    `colorBorderSecondary` adalah `#202020`. `#1f1f1f` satu satuan di bawahnya:
 *    ia nada paling terang yang boleh dipakai sama sekali, dan ia kebetulan
 *    persis `colorBgElevated`. `#000000` (latar halaman gelap) juga lolos dan
 *    memberi ΔL* lebih besar, tetapi ia lubang hitam di dalam kartu `#141414`,
 *    dan arah "kepala = chrome yang terangkat" adalah arah yang sudah dipakai
 *    AntD sendiri di tema gelap.
 *
 * ── Yang berubah di layar, jujur ─────────────────────────────────────────
 * `DataTable` SUDAH punya kepala bernada: `Table.headerBg` bawaan AntD adalah
 * `colorFillAlter` yang dikomposit ke `colorBgContainer` — terang `#fafafa`
 * (α 0,02 = 2%, yaitu persis besaran yang dikeluhkan issue ini) dan gelap
 * `#1d1d1d`. Jadi perubahannya: terang **`#fafafa` → `#f5f5f5`** (2% → 4%),
 * gelap **`#1d1d1d` → `#1f1f1f`** (dua satuan RGB, tak terlihat) — dan
 * `StaticTable`, 46 dari 66 tabel, mendapat nada yang sebelumnya tidak ada
 * sama sekali. Warna judulnya ikut disamakan: bawaan `Table.headerColor` adalah
 * `colorTextHeading` (α 0,88), sedangkan `ui/table.tsx` memakai
 * `colorTextSecondary` (α 0,65) karena judul kolom MENAMAI angka di bawahnya
 * dan tidak boleh bersaing dengannya. Dua perender tidak boleh memilih dua
 * jawaban untuk itu.
 *
 * Yang TIDAK disamakan dan sengaja dicatat sebagai sisa: tebal huruf judul —
 * `ui/table.tsx` memakai 500, `Table` AntD memakai `fontWeightStrong` (600) dan
 * tidak menyediakan token untuknya. Bedanya satu anak tangga tebal pada teks
 * 14px; menyamakannya berarti menulis CSS ke dalam komponen AntD, dan itu
 * pekerjaan yang lebih besar dari imbalannya.
 */
export const TABLE_HEAD_BG_LIGHT = "#f5f5f5"; // = colorBgLayout terang
export const TABLE_HEAD_BG_DARK = "#1f1f1f"; // = colorBgElevated gelap

export function tableHeadBg(resolved: ResolvedTheme): string {
  return resolved === "dark" ? TABLE_HEAD_BG_DARK : TABLE_HEAD_BG_LIGHT;
}

/* ------------------------------------------------------------------------ */
/* Permukaan gelap permanen — nilai yang TIDAK punya variabel CSS (#204)     */
/* ------------------------------------------------------------------------ */

/**
 * `Layout.siderBg` bawaan Ant Design — permukaan gelap permanen aplikasi ini:
 * menu samping dasbor, panel merek layar masuk, dan kepala konsol operator.
 * Ketiganya harus bidang yang SAMA PERSIS; dua abu-abu tua yang berbeda 3%
 * terbaca sebagai cacat, bukan sebagai dua permukaan.
 *
 * **Kenapa nilainya ditulis di sini dan bukan dirujuk sebagai `var(--ant-…)`:**
 * variabel token KOMPONEN AntD baru ada di dokumen bila komponennya benar-benar
 * dirender. Dua permukaan memakainya justru di tempat yang tidak menggambar
 * satu pun `Layout.Sider` — kerangka muat `(auth)/loading.tsx`, yang dirender
 * MENGGANTIKAN halaman yang merendernya, dan chrome `(operator)/layout.tsx`,
 * yang tidak punya menu samping. Di sana `var(--ant-layout-sider-bg)` tidak
 * pernah teratasi dan warnanya jatuh diam-diam ke warisan.
 *
 * Sampai #204 nilai itu diketik ulang di ketiga tempat, masing-masing dengan
 * komentar "kalau `Layout.siderBg` berubah, ubah juga di sini" — yaitu
 * kesepakatan yang hanya berlaku selama seseorang mengingatnya. Sekarang ia
 * berdiri satu kali, di berkas yang memang rumah setiap nilai warna, dan
 * `sai/warna-token-antd` menolak salinan berikutnya.
 *
 * Tidak bertema: ia sengaja gelap di KEDUA tema. Teks di atasnya karena itu
 * memakai `colorTextLightSolid`, bukan `colorText`.
 */
export const SIDER_BG_DARK = "#001529";

/* ------------------------------------------------------------------------ */
/* Tirai overlay: yang DIPERIKSA, lalu sengaja TIDAK diganti (issue #190)     */
/* ------------------------------------------------------------------------ */

/**
 * `colorBgMask` — satu-satunya token overlay yang harus diukur sebelum
 * dipercaya, dan hasilnya: **bawaan AntD dipakai apa adanya, tanpa override.**
 * Bagian ini ada supaya keputusan "tidak melakukan apa-apa" itu tercatat,
 * karena ia dibuat setelah pengukuran — bukan karena terlewat.
 *
 * ── Kenapa ia dicurigai lebih dulu ────────────────────────────────────────
 * `dialog.tsx` dan `alert-dialog.tsx` lama memakai `bg-black/50` dengan
 * pengecualian lint TERTULIS, karena upaya sebelumnya memakai token bertema
 * (`--foreground`) dan token itu ikut BERBALIK di tema gelap: tirainya menjadi
 * kabut PUTIH, dan halaman justru lebih terang saat dialog dibuka. Setiap
 * pengganti karena itu harus dibuktikan tidak mengulang pola yang sama.
 *
 * ── Terukur (`theme.getDesignToken`, paket `antd` yang terpasang) ─────────
 *
 *   terang  colorBgMask = rgba(0,0,0,0.45)
 *   gelap   colorBgMask = rgba(0,0,0,0.45)   ← NILAI YANG SAMA PERSIS
 *
 * Nilainya sama karena ia bukan turunan `colorTextBase` melainkan konstanta di
 * `antd/es/theme/themes/shared/genColorMapToken.js` — hitam beralfa, dipakai
 * kedua algoritma. Jadi ia secara struktural tidak bisa berbalik.
 *
 * Efeknya pada luminansi (nilai kecil = lebih gelap):
 *
 * | Latar                          | sebelum | sesudah tirai |            |
 * |--------------------------------|---------|---------------|------------|
 * | terang `#ffffff` (container)   | 1,0000  | 0,2633        | menggelap  |
 * | terang `#F8FAFC` (halaman app) | 0,9536  | 0,2515        | menggelap  |
 * | gelap  `#141414` (container)   | 0,0070  | 0,0033        | menggelap  |
 * | gelap  `#0F172A` (halaman app) | 0,0088  | 0,0039        | menggelap  |
 *
 * ── Yang jujur harus ikut ditulis ────────────────────────────────────────
 * Di tema gelap penggelapannya BENAR arahnya tetapi kecil dalam angka
 * absolut, karena halaman gelap memang sudah nyaris hitam. Panel dialog
 * (`colorBgElevated` gelap `#1f1f1f`) karena itu hanya berkontras **1,18:1**
 * terhadap halaman yang sudah ditirai — yang memisahkan keduanya di sana
 * praktis hanya bayangan `boxShadow` milik Modal, bukan warnanya.
 *
 * Itu tetap arah yang BENAR (panel lebih terang dari sekelilingnya, kebalikan
 * dari bug kabut putih), dan ia bawaan AntD apa adanya — tetapi ia satu
 * keluarga dengan jebakan "dua bidang sewarna" di MASTER.md, dan layak
 * ditinjau di sapuan dua tema #205. Menaikkannya di sini akan menggeser
 * `colorBgElevated`, yaitu permukaan SETIAP popover, dropdown, dan tooltip —
 * keputusan yang terlalu lebar untuk diambil di dalam issue overlay.
 *
 * Angka-angka di atas dihitung ulang setiap kali suite berjalan di
 * `tests/ui-overlay-antd.test.tsx`, jadi versi AntD baru tidak bisa membalik
 * arahnya diam-diam.
 */

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
