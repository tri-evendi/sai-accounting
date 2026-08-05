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
 * ── Yang SENGAJA tidak diputuskan di sini ──────────────────────────────────
 * `colorTextTertiary` (gagal 4,5:1 di kedua tema) adalah issue #207 dan
 * `colorBorder` (1,41:1 terang) adalah issue #208. Keduanya token bawaan yang
 * dipakai jauh di luar uang, jadi menaikkannya di sini akan mengubah seluruh
 * aplikasi lewat pintu belakang sebuah berkas bernama "token uang". Tempatnya
 * sudah disiapkan: tambahkan saja entri ke `MONEY_TOKENS_*`/blok override di
 * `antd-provider.tsx` tanpa menyentuh komponen uang.
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
