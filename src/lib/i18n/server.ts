import "server-only";

/**
 * Sisi SERVER dari fondasi multibahasa.
 *
 * `import "server-only"` di baris pertama bukan hiasan: berkas ini memuat
 * ketiga kamus dan membaca `cookies()`/`headers()`. Bila suatu saat ada
 * komponen client yang tak sengaja mengimpornya, build GAGAL di situ juga —
 * bukan diam-diam mengirim tiga kamus ke browser.
 *
 * Kamus dimuat lewat `import()` DINAMIS supaya hanya bahasa yang sedang aktif
 * yang ikut ke bundel server route tersebut (pola yang dianjurkan panduan Next,
 * `01-app/02-guides/internationalization.md`).
 *
 * Pemuatnya diketik `() => Promise<Dictionary>` dengan `Dictionary` diturunkan
 * dari `id.json`. Efeknya: kunci yang HILANG di `en.json`/`zh.json` menjadi
 * galat `tsc` di berkas ini — pemeriksaan pertama dari dua lapis penjaga
 * (lapis kedua: `tests/i18n.test.ts`, yang juga menangkap kunci berlebih).
 */

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  negotiateLocale,
  type Locale,
} from "./config";
import { translate, type Dictionary, type DictionaryKey, type TranslationValues } from "./dictionary";

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  id: () => import("./dictionaries/id.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  zh: () => import("./dictionaries/zh.json").then((m) => m.default),
};

/**
 * Bahasa aktif untuk permintaan ini.
 *
 * Urutan: cookie `locale` (pilihan eksplisit pengguna) → negosiasi
 * `Accept-Language` (tebakan sopan dari browser) → `DEFAULT_LOCALE`.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const headerStore = await headers();
  return negotiateLocale(headerStore.get("accept-language")) ?? DEFAULT_LOCALE;
}

/** Kamus satu bahasa. Locale asing tidak mungkin lolos ke sini (`Locale`). */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}

/**
 * Penerjemah siap pakai untuk SERVER component:
 *
 * ```tsx
 * const t = await getT();
 * <h2>{t("quickActions.title")}</h2>
 * ```
 *
 * Kuncinya bertipe `DictionaryKey`, jadi salah ketik ditolak `tsc`.
 */
export async function getT(): Promise<
  (key: DictionaryKey, values?: TranslationValues) => string
> {
  const dictionary = await getDictionary(await getLocale());
  return (key, values) => translate(dictionary, key, values);
}
