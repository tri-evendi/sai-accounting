/**
 * Tema tampilan (terang / gelap / ikut sistem) — konfigurasinya.
 *
 * Modul ini MURNI: tanpa React, tanpa `next/headers`, tanpa Prisma. Dipakai
 * root layout (server), toggle (client), server action, DAN tes — persis
 * alasan yang sama dengan `lib/i18n/config.ts`, dan strukturnya sengaja
 * dicerminkan dari sana supaya dua preferensi tampilan ini tidak tumbuh
 * menjadi dua mekanisme yang berbeda.
 *
 * ── Kenapa blok `.dark` selama ini mati ────────────────────────────────────
 * `globals.css` sudah memuat palet gelap lengkap sejak awal — termasuk
 * pasangan soft/strong dengan kontras terverifikasi dan token sidebar — dengan
 * catatan "disiapkan tetapi TIDAK diaktifkan (tidak ada elemen dengan class
 * .dark)". Yang hilang memang bukan warnanya, melainkan satu hal: sesuatu yang
 * memasang kelas itu. Berkas ini dan `actions.ts` di sebelahnya adalah hal itu.
 *
 * ── Bawaan TERANG, bukan "ikut sistem" ─────────────────────────────────────
 * MASTER.md menyebut light-first sebagai prinsip pertama dan dark mode sebagai
 * fase lanjutan; anti-patternnya berbunyi "dark mode dipaksakan sebagai
 * default". Menjadikan `system` sebagai bawaan akan membuat setiap pengguna
 * ber-OS gelap membuka aplikasi keuangan ini dalam mode yang belum pernah
 * ditinjau halaman demi halaman — dipaksakan oleh mesinnya, bukan dipilih
 * orangnya. Karena itu bawaannya `light`, dan `system` tersedia sebagai
 * PILIHAN yang sadar.
 *
 * ── Di COOKIE, bukan localStorage ──────────────────────────────────────────
 * Cookie bisa dibaca root layout di server, jadi kelas `.dark` sudah ikut pada
 * HTML pertama — tidak ada kedipan putih sebelum hydrate, dan tidak ada
 * ketidakcocokan hydrate. localStorage menuntut skrip pemblokir di `<head>`
 * untuk hasil yang sama. Satu-satunya keadaan yang memang tak bisa diketahui
 * server adalah `system` (preferensi OS hidup di browser); hanya keadaan itu
 * yang dibantu skrip kecil di root layout.
 */

/** Pilihan yang bisa disimpan. `system` = ikut preferensi OS pembacanya. */
export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/** Tema yang benar-benar dirender. `system` selalu diselesaikan ke salah satu. */
export type ResolvedTheme = "light" | "dark";

/** Bawaan bila cookie kosong atau isinya asing. Light-first (MASTER.md). */
export const DEFAULT_THEME: Theme = "light";

/** Nama cookie penyimpan pilihan tema. */
export const THEME_COOKIE = "theme";

/** Umur cookie tema: satu tahun — preferensi tampilan, bukan data sesi. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Kelas yang dipasang pada `<html>` untuk mengaktifkan blok `.dark`. */
export const DARK_CLASS = "dark";

/** Penyempit tipe: `unknown` → `Theme`. Dipakai di cookie, action, dan tes. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Cookie apa pun → `Theme` yang sah. Nilai asing/rusak jatuh ke bawaan. */
export function parseTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * Tema → kelas `<html>` yang dirender SERVER.
 *
 * `system` sengaja menghasilkan string kosong: preferensi OS tidak terlihat
 * dari server, dan menebaknya berarti separuh pembaca mendapat kedipan ke tema
 * yang salah. Untuk keadaan itu kelasnya dipasang skrip kecil sebelum cat
 * pertama (lihat `themeScript`).
 */
export function themeClass(theme: Theme): string {
  return theme === "dark" ? DARK_CLASS : "";
}

/**
 * Nilai properti CSS `color-scheme`.
 *
 * Inilah yang membuat kontrol BAWAAN peramban — bilah geser, pemilih tanggal
 * `<input type="date">` (dipakai wizard penyiapan), dan menu `<select>` —
 * ikut gelap. Tanpa ini mereka tetap putih terang di tengah halaman gelap,
 * kesalahan dark mode yang paling sering luput karena hanya muncul pada
 * elemen yang tidak kita gambar sendiri.
 */
export function colorScheme(theme: Theme): "light" | "dark" | "light dark" {
  return theme === "system" ? "light dark" : theme;
}

/**
 * Skrip sebelum-cat untuk keadaan `system` SAJA.
 *
 * Dijalankan sinkron di `<head>` sehingga kelasnya sudah terpasang sebelum
 * cat pertama. Sengaja sekecil ini dan tanpa `try/catch` yang menelan galat:
 * satu-satunya API yang disentuh (`matchMedia`) ada di setiap peramban yang
 * didukung Next 16, dan bila toh gagal, hasilnya adalah tema terang — bawaan
 * yang memang sudah benar.
 */
export function themeScript(): string {
  return `if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('${DARK_CLASS}')`;
}
