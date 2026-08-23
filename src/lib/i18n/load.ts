/**
 * Pemuat kamus — TANPA `server-only` (issue #467).
 *
 * `i18n/server.ts` sengaja memikul `import "server-only"`: ia membaca
 * `cookies()`/`headers()`, dan komponen client yang tak sengaja mengimpornya
 * harus MENGGAGALKAN build alih-alih diam-diam mengirim tiga kamus ke browser.
 *
 * Tapi ada pemanggil ketiga yang bukan komponen client dan juga bukan
 * permintaan HTTP: penjadwal `tsx` di luar Next, yang mengirim surel pengingat
 * dan karena itu butuh KALIMATNYA. Ia tidak punya cookie bahasa untuk dibaca,
 * dan `import "server-only"` membuat modulnya gagal dimuat sama sekali
 * (preseden yang sama: `mailer.ts` vs `mailer-core.ts`).
 *
 * Jadi yang dipisahkan ke sini hanyalah bagian yang TIDAK menyentuh permintaan:
 * peta pemuat + pemilihan bahasa eksplisit. Yang membaca cookie tetap tinggal
 * di `server.ts`, dan `server.ts` memakai peta ini supaya tidak ada dua daftar
 * kamus yang bisa menyimpang.
 */

import type { Locale } from "./config";
import type { Dictionary } from "./dictionary";

/**
 * `import()` DINAMIS supaya hanya bahasa yang dipakai yang ikut ke bundel route
 * bersangkutan — pola yang dianjurkan panduan i18n Next.
 *
 * Tipenya `() => Promise<Dictionary>` dengan `Dictionary` diturunkan dari
 * `id.json`: kunci yang HILANG di `en.json`/`zh.json` menjadi galat `tsc` di
 * sini, lapis pertama dari dua penjaga kelengkapan kamus.
 */
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  id: () => import("./dictionaries/id.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  zh: () => import("./dictionaries/zh.json").then((m) => m.default),
};

/** Kamus satu bahasa. Locale asing tidak mungkin lolos ke sini (`Locale`). */
export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
