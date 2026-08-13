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
 * **Koreksi kedua (issue #219): "isian pekat" pun punya satu pengecualian.**
 * Tombol `danger` adalah isian yang MEMIKUL TEKS 14px di atasnya, jadi di sana
 * ambangnya 4,5:1 dan `colorError` bawaan gagal di kedua tema (3,27 / 4,24).
 * Penggantinya dipersempit ke `components.Button` di bagian
 * `dangerButtonTokens` di bawah; `colorError` global tetap utuh.
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
 * ⚠ Tabel di bawah DIPERBARUI saat warna merek menjadi navy. Angka "min" =
 * rasio TERBURUK di antara ketiga permukaan, dan itulah yang dikunci tes.
 *
 * | Peran        | TERANG    | min   | GELAP     | min  |
 * |--------------|-----------|-------|-----------|------|
 * | teks/tautan  | `#1E3A5F` | 10,55 | `#5B8DD0` | 4,84 |
 * | hover        | `#16304F` | 12,27 | `#6FA0DC` | 6,07 |
 * | aktif        | `#101F33` | 15,22 | `#87B4E8` | 7,63 |
 */
export interface BrandTextTokens {
  colorBrandText: string;
  colorBrandTextHover: string;
  colorBrandTextActive: string;
}

/** Tangga NAVY, tema terang. Diukur di atas `colorBgContainer` putih. */
export const BRAND_TEXT_LIGHT: BrandTextTokens = {
  colorBrandText: "#1E3A5F", // 11,50:1
  colorBrandTextHover: "#16304F", // 13,38:1
  colorBrandTextActive: "#101F33", // 16,59:1
};

/**
 * Tema gelap MENERANG, bukan menggelap — dan itu bukan ketidakkonsistenan.
 * Navy tua di atas `#141414` hanya 1,60:1: sebagai TEKS ia praktis tak terbaca.
 * Peran teks karena itu naik ke anak tangga terang; peran ISIAN (tombol) tetap
 * gelap, di `PRIMARY_BUTTON_DARK`. Pemisahan itu sudah ada sebelum navy dan
 * justru navy yang membuatnya wajib.
 */
export const BRAND_TEXT_DARK: BrandTextTokens = {
  colorBrandText: "#5B8DD0", // 5,41:1 halaman · 4,84:1 elevated
  colorBrandTextHover: "#6FA0DC", // 6,79:1
  colorBrandTextActive: "#87B4E8", // 8,53:1
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
 * | diam    | `#1E3A5F` | 11,50:1     | `#2F6FBF` |  5,06:1     |
 * | hover   | `#16304F` | 13,38:1     | `#2861A8` |  6,24:1     |
 * | aktif   | `#101F33` | 16,59:1     | `#1F4C85` |  8,64:1     |
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
  colorPrimary: "#1E3A5F", // navy · label putih 11,50:1
  colorPrimaryHover: "#16304F", // 13,38:1
  colorPrimaryActive: "#101F33", // 16,59:1
};

/**
 * Isian tema gelap TIDAK bisa memakai navy yang sama. Diukur: `#1E3A5F` di atas
 * halaman gelap hanya **1,60:1** — tombolnya berhenti bisa ditemukan sebagai
 * bidang. Nilai di bawah adalah navy yang dinaikkan sampai lolos KEDUA ambang
 * sekaligus (label putih ≥4,5 DAN bidang ≥3 terhadap halaman maupun permukaan
 * melayang), yang ternyata hanya terpenuhi di pita sempit.
 */
export const PRIMARY_BUTTON_DARK: PrimaryButtonTokens = {
  colorPrimary: "#2F6FBF", // label 5,06:1 · halaman 3,64:1 · elevated 3,25:1
  colorPrimaryHover: "#2861A8", // label 6,24:1 · halaman 2,95:1
  colorPrimaryActive: "#1F4C85", // label 8,64:1 · halaman 2,13:1
};

/**
 * `colorPrimary` GLOBAL — warna merek sebagai aksen, cincin fokus, garis aktif,
 * dan (di pendaratan) label kategori, centang, serta garis sparkline.
 *
 * ══ KENAPA SEKARANG DISEBUT, PADAHAL DULU SENGAJA TIDAK ════════════════════
 * Sampai perubahan ini keputusan pemiliknya adalah "warna merek = bawaan AntD
 * (#1677ff)", dan menuliskannya ulang hanya menciptakan salinan kedua. Pemilik
 * mengganti keputusan itu: warna merek kini **navy institusional**, dipilih
 * karena `#1677ff` terbaca sebagai biru bawaan framework, bukan sebagai merek —
 * dan karena riset jenis produk (perkakas faktur & pembukuan) menaruh navy tua
 * sebagai primernya.
 *
 * ⚠ Ia BERBEDA per tema, dan itu wajib. Navy tua adalah warna TEKS yang sangat
 * baik di atas putih (11,50:1) dan warna teks yang mustahil di atas hitam
 * (1,60:1). Satu nilai untuk kedua tema karena itu tidak bisa ada — dan nilai
 * lama pun sebenarnya sudah menyerempet: `#1677ff` sebagai teks di tema gelap
 * hanya **4,49:1**, di bawah ambang 4,5. Memisahkannya per tema sekaligus
 * memperbaiki kegagalan tipis yang sudah berjalan itu.
 *
 * | Peran            | TERANG    | rasio   | GELAP     | rasio |
 * |------------------|-----------|---------|-----------|-------|
 * | aksen / teks     | `#1E3A5F` | 11,50:1 | `#5B8DD0` | 5,41:1 |
 */
/*
 * ⚠ NILAI DI SINI ADALAH BENIH, BUKAN WARNA YANG DIRENDER — dan di tema gelap
 * keduanya BERBEDA.
 *
 * Algoritma gelap AntD mentransformasi `colorPrimary` yang diberikan. Benih
 * `#5B8DD0` (yang secara langsung terukur 5,41:1) keluar sebagai `#507bb4`,
 * yaitu **4,24:1** di atas halaman gelap dan **3,79:1** di atas permukaan
 * melayang — dua-duanya di bawah ambang teks 4,5:1, padahal token inilah yang
 * memikul label kategori, centang, dan garis sparkline di pendaratan.
 *
 * Kekeliruan itu tidak tertangkap penjaga mana pun karena penjaganya mengukur
 * BENIH. Sejak perbaikan ini penjaga mengukur nilai TERPAKAI (lihat
 * `landing-colors.test.ts` §appliedPrimary), dan benih di bawah dipilih supaya
 * HASIL transformasinya yang lolos:
 *
 *   benih `#7FB0E4`  →  dirender `#6f99c5`  →  worst 5,52:1  ✓
 */
export const BRAND_PRIMARY_LIGHT = "#1E3A5F"; // dirender apa adanya · 11,50:1
export const BRAND_PRIMARY_DARK = "#7FB0E4"; // dirender #6f99c5 · worst 5,52:1

/**
 * BIBIT NADA MEREK — peran PERMUKAAN, dan sengaja berbeda dari `brandPrimary`.
 *
 * ══ KENAPA TIDAK MEMAKAI `colorPrimary` SAJA ═══════════════════════════════
 * Resep nada (`tone-recipe.ts`) mencampur 10–28% bibit ke permukaan yang sedang
 * berlaku. Tiga hue lain memakai anak tangga `-6`, yaitu bobot PERMUKAAN. Warna
 * merek versi teks tidak sebobot itu: di tema gelap ia `#5B8DD0` — sengaja
 * terang supaya terbaca sebagai huruf. Memakainya sebagai bibit membuat pita
 * merek melompat terang, dan itu terukur menabrak dua ambang sekaligus:
 * isian tombol primer turun ke 2,96:1 terhadap `band-accent` (batas 3:1).
 *
 * Bibit di bawah karena itu memakai bobot yang sama dengan ISIAN TOMBOL:
 * hubungan "pita 10% vs tombol 100%" itulah yang selama ini menjaga jarak
 * keduanya, dan ia tidak bergantung pada hue melainkan pada kadar campuran.
 */
/*
 * ⚠ SATU nilai untuk kedua tema, dan itu disengaja.
 *
 * Bibit ini dicampur 10–28% ke permukaan yang SEDANG berlaku, jadi arah
 * terang/gelapnya sudah datang dari permukaannya — bukan dari bibitnya. Yang
 * harus dijaga bibit hanyalah BOBOTNYA, dan navy tua (`#1E3A5F`) terlalu berat:
 * dicampur ke permukaan terang ia menghasilkan pita yang cukup gelap untuk
 * menjatuhkan tepi tombol garis ke 2,96:1 di `/platform` (ambang 3:1).
 *
 * `#2F6FBF` adalah navy yang sama pada bobot PERMUKAAN — sama dengan anak
 * tangga `-6` milik tiga hue lain, dan sama dengan isian tombol tema gelap.
 * Hubungan "pita 10% vs tombol 100%" yang menjaga jarak keduanya tidak
 * bergantung pada hue, melainkan pada kadar campuran.
 */
export const BRAND_TONE_LIGHT = "#2F6FBF";
export const BRAND_TONE_DARK = "#2F6FBF";

/**
 * ISIAN MEREK yang memikul teks TERANG — lambang produk, dan apa pun yang
 * menaruh putih di atas warna merek.
 *
 * ══ KENAPA TIDAK `colorPrimary` SAJA ═══════════════════════════════════════
 * Sejak merek menjadi navy, `colorPrimary` memikul dua peran yang saling
 * berlawanan di tema GELAP:
 *
 *   • sebagai TEKS/garis di atas halaman → harus TERANG (dirender `#6f99c5`,
 *     terukur 5,52–6,17:1 — benar);
 *   • sebagai ISIAN di belakang glif putih → harus GELAP.
 *
 * `BrandMark` memakai peran kedua, dan dengan `colorPrimary` ia terukur
 * **2,98:1** di tema gelap — di bawah ambang 3:1 untuk grafis non-teks, apalagi
 * 4,5:1. Lambang produk yang lenyap di tema gelap adalah kegagalan yang tidak
 * akan terlihat oleh siapa pun yang bekerja di tema terang.
 *
 * Nilainya sama dengan isian TOMBOL primer, dan itu bukan kebetulan: keduanya
 * peran yang sama persis — bidang merek yang memikul teks putih. Rasionya sudah
 * diukur di `PRIMARY_BUTTON_*`: 11,50:1 (terang) dan 5,06:1 (gelap).
 */
export const BRAND_SOLID_LIGHT = PRIMARY_BUTTON_LIGHT.colorPrimary;
export const BRAND_SOLID_DARK = PRIMARY_BUTTON_DARK.colorPrimary;

export function brandSolid(resolved: ResolvedTheme): string {
  return resolved === "dark" ? BRAND_SOLID_DARK : BRAND_SOLID_LIGHT;
}

export function brandTone(resolved: ResolvedTheme): string {
  return resolved === "dark" ? BRAND_TONE_DARK : BRAND_TONE_LIGHT;
}

export function brandPrimary(resolved: ResolvedTheme): string {
  return resolved === "dark" ? BRAND_PRIMARY_DARK : BRAND_PRIMARY_LIGHT;
}

export function primaryButtonTokens(resolved: ResolvedTheme): PrimaryButtonTokens {
  return resolved === "dark" ? PRIMARY_BUTTON_DARK : PRIMARY_BUTTON_LIGHT;
}

/* ------------------------------------------------------------------------ */
/* Isian tombol DESTRUKTIF (issue #219)                                       */
/* ------------------------------------------------------------------------ */

/**
 * Isian tombol `danger` — token KOMPONEN, lingkupnya `Button` saja.
 *
 * Sisa terakhir #187: label putih di atas `colorError` bawaan GAGAL 4,5:1 di
 * KEDUA tema — terang `#ff4d4f` = 3,27:1, gelap `#dc4446` = 4,24:1. Tombol
 * destruktif ("Hapus", "Tolak", "Buka kembali periode") adalah tempat terakhir
 * yang boleh dibiarkan ambigu, jadi kegagalan ini bukan yang paling besar
 * angkanya tapi yang paling mahal akibatnya.
 *
 * Seperti `colorPrimary`, yang dipersempit hanya lingkupnya: `colorError`
 * GLOBAL tetap bawaan AntD apa adanya — ia ikon `Alert`, garis `Form.Item`
 * bergalat, isian `Progress`, dan di sana ambangnya memang 3:1 non-teks.
 * (Perannya sebagai TEKS sudah punya jawabannya sendiri sejak #186/#187:
 * `colorMoneyNegative` untuk angka, `Tag.colorError` untuk label status.)
 *
 * ── Dua syarat yang tarik-menarik ─────────────────────────────────────────
 * Tombol berisian harus lolos DUA ambang sekaligus, dan menaikkan yang satu
 * menurunkan yang lain:
 *
 *  1. **label putih di atas isian** ≥ 4,5:1 (teks 14px, WCAG 1.4.3)
 *  2. **isian di atas latar halaman** ≥ 3:1 (grafis non-teks, WCAG 1.4.11) —
 *     supaya tombolnya sendiri terbaca sebagai tombol
 *
 * Di tema TERANG tangga merah AntD (`generate('#ff4d4f')`) punya anak tangga
 * yang lolos keduanya dengan lapang; di tema GELAP
 * (`generate('#ff4d4f', { theme: 'dark' })`) **tidak ada satu pun**:
 *
 *   red-6 gelap `#dc4446` : label 4,24 GAGAL · isian 3,89 lolos
 *   red-5 gelap `#ad393a` : label 6,13 lolos · isian **2,69 GAGAL**
 *
 * ── Keputusan pemilik: utamakan LABEL ─────────────────────────────────────
 * Dipilih `red-5` di tema gelap; isian yang lebih melebur (2,69) diterima
 * dengan sadar. **Alasannya bukan aritmetika.** MASTER.md mewajibkan aksi
 * destruktif memakai merah **DAN** konfirmasi, dan 22 berkas memang memakai
 * `ConfirmDialog`. Jadi risiko "tidak melihat ada tombol destruktif di sana"
 * sudah ditutup oleh dialognya; risiko "salah membaca tombolnya" tidak ditutup
 * apa pun. Membayar keterbacaan label demi bidang merah yang lebih tegas
 * berarti membeli perlindungan yang sudah kita punya.
 *
 * ── Keadaan hover & aktif: MENGGELAP di kedua tema ────────────────────────
 * Sama seperti tombol primer #187, dan karena alasan yang sama: menerangkan
 * isian di tema gelap (red-6 `#dc4446`) menjatuhkan labelnya ke 4,24. Ambang
 * 3:1 "isian vs latar" karena itu diberlakukan pada keadaan DIAM saja — saat
 * hover, kursor pengguna sendiri sudah menandai letak tombolnya.
 *
 * | Keadaan | TERANG    | label | isian min | GELAP     | label | isian min |
 * |---------|-----------|-------|-----------|-----------|-------|-----------|
 * | diam    | `#d9363e` |  4,62 | 4,24      | `#ad393a` |  6,13 | **2,69**  |
 * | hover   | `#b32430` |  6,54 | 6,00      | `#7e2e2f` |  9,06 | 1,82      |
 * | aktif   | `#8c1523` |  9,35 | 8,57      | `#5b2526` | 12,09 | 1,36      |
 *
 * Tidak ada hex baru yang lahir di sini. Keduanya keadaan DIAM adalah
 * `colorErrorActive` bawaan AntD tema masing-masing, dan hover terang `#b32430`
 * adalah `colorMoneyNegative` #186 — anak tangga yang sama melayani dua peran.
 *
 * ── Yang WAJIB ikut dicatat, karena ia bisa membalik keputusannya ─────────
 * Kalimat "palet AntD tidak menyediakan langkah di antaranya" benar untuk
 * tangga yang diturunkan dari BENIH `colorError`. Ia TIDAK benar untuk palet
 * `red` resmi AntD (`presetDarkPalettes.red`, keluarga yang sama yang dipakai
 * #208 untuk `grey`). Terukur:
 *
 *   preset gelap red-6 `#d32029` : label **5,24 lolos** · isian **3,15 lolos**
 *
 * Yaitu satu-satunya anak tangga merah yang melewati KEDUA ambang di tema
 * gelap. Ia tidak dipakai di sini karena keputusan A diambil sebelum
 * pengukuran ini ada, bukan karena ia kalah — dan angkanya dikunci di
 * `tests/antd-tokens.test.ts` supaya pilihan itu tetap terbuka dan tidak
 * hilang bersama issue-nya. Harganya, kalau suatu hari diambil: label gelap
 * turun 6,13 -> 5,24 (tetap di atas 4,5) dan merahnya berpindah keluarga,
 * sehingga tombol destruktif tidak lagi sewarna `colorError` bawaan.
 */
export interface DangerButtonTokens {
  colorError: string;
  colorErrorHover: string;
  colorErrorActive: string;
}

/** red-7 / red-8 / red-9 dari tangga `colorError` AntD, tema terang. */
export const DANGER_BUTTON_LIGHT: DangerButtonTokens = {
  colorError: "#d9363e", // label putih 4,62:1 · isian min 4,24:1
  colorErrorHover: "#b32430", // label 6,54:1 · isian min 6,00:1
  colorErrorActive: "#8c1523", // label 9,35:1 · isian min 8,57:1
};

/**
 * red-5 / red-4 / red-3 dari tangga yang sama versi gelap. Keadaan diam
 * SENGAJA di bawah 3:1 terhadap latar (2,69) — lihat "keputusan pemilik" di
 * atas; tema gelap di sini memang diperlakukan berbeda dari terang.
 */
export const DANGER_BUTTON_DARK: DangerButtonTokens = {
  colorError: "#ad393a", // label putih 6,13:1 · isian min 2,69:1 (di bawah 3:1, disengaja)
  colorErrorHover: "#7e2e2f", // label 9,06:1 · isian min 1,82:1
  colorErrorActive: "#5b2526", // label 12,09:1 · isian min 1,36:1
};

export function dangerButtonTokens(resolved: ResolvedTheme): DangerButtonTokens {
  return resolved === "dark" ? DANGER_BUTTON_DARK : DANGER_BUTTON_LIGHT;
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
/* Peran TEKS berstatus: colorSuccessText & saudaranya (issue #355)           */
/* ------------------------------------------------------------------------ */

/**
 * `colorSuccessText` / `colorWarningText` / `colorErrorText` / `colorInfoText`
 * — celah terakhir yang tertinggal dari #186.
 *
 * ── Bagaimana ia lolos ─────────────────────────────────────────────────────
 * #186 mengganti peran TEKS `colorSuccess` dan #187 mempersempitnya lagi ke
 * `Tag`/`Badge`. Yang tak pernah disebut keduanya adalah keempat token
 * `color*Text` — dan AntD MENURUNKANNYA dari bibit yang sama, sehingga
 * `colorSuccessText` tetap `#52c41a`: **2,27:1**, angka yang sudah tercetak di
 * kepala berkas ini sebagai contoh yang gagal.
 *
 * Audit produksi 13 Agustus 2026 menemukannya di halaman Tutup Buku. Kodenya
 * justru BENAR — `period-manager.tsx` dengan hati-hati memisahkan warna ikon
 * (`token.colorSuccess`, non-teks, ambang 3:1) dari warna kata
 * (`token.colorSuccessText`) — tetapi token yang ia raih tidak pernah disetel.
 * Hasilnya "· Aman" tercetak 11,2px hijau bawaan di atas putih: teks paling
 * tidak terbaca di seluruh aplikasi, dan kebetulan ia adalah kalimat penenang
 * pada layar yang mengunci pembukuan sebulan.
 *
 * ── Kenapa GLOBAL, bukan per komponen seperti `Tag` ────────────────────────
 * `colorSuccess` dipersempit ke komponen karena ia punya peran sah lain: isian
 * pekat dan ikon, di mana 3:1 memang cukup. `colorSuccessText` tidak punya
 * peran lain — namanya sendiri menyatakan ia teks. Karena itu tak ada yang
 * perlu dilindungi dari penggantian ini, dan mendaftarkannya global sekaligus
 * menutup setiap pemakai berikutnya tanpa mereka perlu tahu apa-apa.
 *
 * Nilainya SAMA dengan warna uang (bukan angka baru), jadi tak ada salinan
 * ketiga yang bisa berpisah: positif 5,12:1 min · menunggu 6,23 · negatif 6,00
 * · info 5,65 di tema terang, dan 9,23 / 10,69 / 7,86 / 4,66 di tema gelap.
 * `tests/money-tokens.test.ts` menghitung ulang angka-angka itu tiap suite
 * berjalan, jadi versi AntD baru tidak bisa menggesernya diam-diam.
 */
export interface StatusTextTokens {
  colorSuccessText: string;
  colorWarningText: string;
  colorErrorText: string;
  colorInfoText: string;
}

export function statusTextTokens(resolved: ResolvedTheme): StatusTextTokens {
  const money = moneyTokens(resolved);
  return {
    colorSuccessText: money.colorMoneyPositive,
    colorWarningText: money.colorMoneyPending,
    colorErrorText: money.colorMoneyNegative,
    colorInfoText: money.colorMoneyInfo,
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
/* Kartu pratinjau sosial (`app/opengraph-image.tsx`)                         */
/* ------------------------------------------------------------------------ */

/**
 * Palet gambar Open Graph — satu-satunya permukaan aplikasi ini yang TIDAK
 * dirender peramban, dan karena itu satu-satunya yang tidak bisa memakai
 * `var(--ant-…)`.
 *
 * **Kenapa nilainya harfiah, dan kenapa itu bukan pengecualian yang dicuri:**
 * `ImageResponse` merender lewat Satori, bukan lewat mesin tata letak peramban.
 * Tidak ada dokumen, tidak ada `:root`, dan karena itu tidak ada satu pun
 * properti kustom yang bisa teratasi — `var(--ant-color-primary)` di sana tidak
 * menghasilkan warna merek melainkan warna KOSONG. Ini kelas yang sama dengan
 * `SIDER_BG_DARK` di atas (nilai yang dibutuhkan di tempat variabelnya tidak
 * pernah ada), jadi ia tinggal di berkas yang sama dan bukan di berkas yang
 * memakainya.
 *
 * **Tidak bertema, dan memang tidak bisa:** kartu pratinjau dirender sekali
 * untuk perayap dan aplikasi perpesanan. Pengirim tautan tidak tahu tema
 * pembacanya, dan tidak ada mekanisme untuk menanyakannya. Karena itu palet ini
 * TERANG saja — dan setiap pasangannya diukur pada latar terang itu:
 *
 *   | pasangan                              | rasio     | ambang           |
 *   |---------------------------------------|-----------|------------------|
 *   | `OG_TEXT` di atas `OG_BG`             | 18,42:1   | 4,5:1 (teks)     |
 *   | `OG_TEXT_SECONDARY` di atas `OG_BG`   |  7,00:1   | 4,5:1 (teks)     |
 *   | `OG_BRAND` di atas `OG_BG`            | 11,50:1   | 4,5:1 (teks)     |
 *   | `OG_BG` di atas `OG_BRAND` (lambang)  | 11,50:1   | 4,5:1 (teks)     |
 *   | `OG_BORDER` di atas `OG_BG`           |  1,41:1   | — (garis hias)   |
 *
 * `OG_BRAND` adalah `colorPrimary` tema terang apa adanya (navy `#1E3A5F`).
 * Sejak warna merek menjadi navy, pengecualian "teks besar" yang dulu
 * diperlukan sudah TIDAK ada lagi: 11,50:1 lolos ambang teks penuh (4,5:1),
 * jadi ia aman dipakai pada ukuran berapa pun di kartu itu.
 */
export const OG_BG = "#ffffff";
export const OG_TEXT = "#141414"; // 18,42:1 di atas OG_BG
export const OG_TEXT_SECONDARY = "#595959"; // 7,00:1
export const OG_BRAND = "#1E3A5F"; // = colorPrimary terang (navy) · 11,50:1
export const OG_BORDER = "#d9d9d9"; // garis hias, 1,41:1

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
