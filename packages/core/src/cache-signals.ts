/**
 * SINYAL INVALIDASI CACHE LINTAS PROSES — kosakata & angka (murni).
 *
 * Penulis nilai-nilai ini adalah konsol (`app-operator`) dan skrip; pembacanya
 * `app-customer`, `svc-worker`, dan konsol sendiri. Setiap proses punya cache
 * sendiri, jadi `updateTag()`/`invalidate*()` di proses penulis tidak pernah
 * sampai ke proses lain. Sinyalnya satu baris per nama di tabel platform
 * `cache_signals` (migration platform 0009): penulis menaikkan `version`,
 * pembaca membaca semua baris itu paling sering sekali per
 * `CACHE_SIGNAL_POLL_SECONDS` dan memakai versinya sebagai bagian dari kunci
 * cache. Mekanismenya di `@sai/platform/cache-signals`.
 *
 * Berkas ini murni supaya kalimat konsol bisa menyebut angka yang sama dengan
 * yang dipakai mesinnya, tanpa menyeret klien basis data.
 */

/** Nama sinyal — satu per cache yang isinya ditulis proses lain. */
export const CACHE_SIGNAL_NAMES = [
  "site-settings",
  "site-content",
  "plan-catalog",
  "brand-mark",
  "status-notices",
  "platform-mail-settings",
] as const;

export type CacheSignalName = (typeof CACHE_SIGNAL_NAMES)[number];

/** Bentuk nama yang diterima basis data — sama dengan CHECK di migration 0009. */
export const CACHE_SIGNAL_NAME_PATTERN = /^[a-z][a-z0-9-]{0,59}$/;

/**
 * Berapa lama sebuah proses boleh memakai versi sinyal yang sudah dibacanya.
 * Ini juga batas atas jeda antara simpan di konsol dan tampil di halaman
 * publik, selama sinyalnya terbaca. Bebannya satu `SELECT` atas tabel
 * berbaris enam, per proses, per lima detik, dan hanya bila ada permintaan.
 */
export const CACHE_SIGNAL_POLL_SECONDS = 5;
