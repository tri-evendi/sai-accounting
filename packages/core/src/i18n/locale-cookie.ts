/**
 * Menulis cookie bahasa DARI SISI KLIEN — jaring pengaman, bukan jalur utama.
 *
 * ══ KENAPA ADA (dilaporkan pengguna, 24 Agustus 2026) ═══════════════════════
 * Seorang pengguna melaporkan "ganti bahasa tidak jalan". Lognya menjelaskan
 * kenapa: sepuluh kali `Failed to find Server Action` dalam dua kelompok.
 *
 * Id sebuah server action lahir dari BUILD. Tab peramban yang sudah terbuka
 * sejak sebelum sebuah deploy masih memegang id lama, dan server yang baru
 * tidak mengenalinya lagi — `setLocale()` melempar, `router.refresh()` tidak
 * pernah dijalankan, dan yang dialami pengguna adalah sakelar yang ditekan
 * berkali-kali tanpa satu pun tanda bahwa ada yang salah. (Pola lognya persis
 * itu: empat–lima kegagalan beruntun dalam hitungan detik.)
 *
 * ══ KENAPA CUKUP MENULISNYA DI KLIEN ════════════════════════════════════════
 * Cookie ini memang `httpOnly: false` — dan itu keputusan yang sudah tertulis
 * di `i18n/actions.ts`: ia preferensi tampilan, bukan otorisasi, dan tidak
 * membuka apa pun. Jadi klien boleh menulisnya sendiri, dan `isLocale`
 * menjaga isinya tetap salah satu dari `LOCALES` di kedua jalur.
 *
 * ══ KENAPA MUAT ULANG PENUH SESUDAHNYA ══════════════════════════════════════
 * Karena muat ulang itulah yang MENYEMBUHKAN penyebabnya: bundel lama diganti
 * yang baru, sehingga sakelar berikutnya kembali melewati jalur normal. Jalur
 * utama tetap server action + `router.refresh()` yang tidak membuang isian
 * formulir; yang ini hanya dipakai ketika jalur itu sudah tidak ada.
 */

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "./config";

/** Tulis cookie bahasa langsung, lalu muat ulang halaman penuh. */
export function fallbackSwitchLocale(locale: string): void {
  if (typeof document === "undefined") return;
  const next = isLocale(locale) ? locale : DEFAULT_LOCALE;
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  window.location.reload();
}
