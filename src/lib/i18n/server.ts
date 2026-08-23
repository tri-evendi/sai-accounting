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
import { loadDictionary } from "./load";

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

/**
 * Kamus satu bahasa.
 *
 * Petanya sendiri pindah ke `./load` pada issue #467 — penjadwal `tsx` juga
 * butuh kalimatnya dan tidak bisa memuat modul ber-`server-only`. Yang tinggal
 * di sini adalah yang memang milik permintaan HTTP (cookie/header); peta
 * pemuatnya satu, jadi tidak ada dua daftar kamus yang bisa menyimpang.
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loadDictionary(locale);
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

/**
 * Kamus + penerjemah untuk permintaan ini, sekali muat — bentuk yang dipakai
 * ROUTE HANDLER saat menjawab 400 dari zod.
 *
 * Route handler boleh membaca cookie persis seperti server component (preseden:
 * `lib/period-close.ts`), jadi bahasa pengguna memang tersedia di sini — dan
 * DI SINILAH pesan validasi diterjemahkan, karena kunci di dalam skema tidak
 * bisa (lihat `lib/i18n/validation.ts`).
 *
 * Pola bakunya — inilah yang disalin fase B ke seluruh route:
 *
 * ```ts
 * const parsed = invoiceSchema.safeParse(body);
 * if (!parsed.success) {
 *   const { dictionary, t } = await getRequestI18n();
 *   return NextResponse.json(
 *     {
 *       error: t("validation.invalidInput"),
 *       details: translateFieldErrors(parsed.error, dictionary),
 *     },
 *     { status: 400 }
 *   );
 * }
 * ```
 *
 * `dictionary` dikembalikan bersama `t` karena `translateFieldErrors` menerima
 * string apa pun (kunci ATAU prosa), sedangkan `t` sengaja hanya menerima
 * `DictionaryKey` supaya salah ketik kunci tetap ditolak `tsc`.
 */
export async function getRequestI18n(): Promise<{
  locale: Locale;
  dictionary: Dictionary;
  t: (key: DictionaryKey, values?: TranslationValues) => string;
}> {
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);
  return { locale, dictionary, t: (key, values) => translate(dictionary, key, values) };
}
