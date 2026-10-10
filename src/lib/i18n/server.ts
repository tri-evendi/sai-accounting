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
import { applySiteContent, isSiteContentPath } from "@/lib/site-content";

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
 *
 * ══ PENIMPA ISI PENDARATAN — HANYA DI HALAMAN PEMASARAN ════════════════════
 * Kalimat `landing.*` boleh diganti dari konsol operator (tabel
 * `site_contents`). Penimpaannya dipasang DI SINI, dan bukan di tiap komponen
 * pendaratan, karena di sinilah seluruh permukaan pemasaran bertemu: lima
 * pemanggil `getDictionary` (layout pemasaran, `/`, `/pricing`, `/status`,
 * `landing-features`) plus setiap `getT()` di bawahnya, termasuk
 * `generateMetadata` — judul dan deskripsi yang dibagikan ke WhatsApp ikut
 * tersunting tanpa satu baris tambahan. Memasangnya per komponen berarti
 * komponen pendaratan BERIKUTNYA akan memakai `getT()` biasa dan diam-diam
 * melewatkan suntingannya.
 *
 * ⚠ GERBANG JALURnya yang membuat ini aman untuk dipasang di jalur panas:
 * `isSiteContentPath` menjawab `false` untuk setiap halaman aplikasi, dan di
 * situ TIDAK ADA satu query pun yang berjalan — kamus dipakai apa adanya,
 * persis seperti sebelum fitur ini ada. Jalurnya dibaca dari header `x-sai-path`
 * yang dititipkan `proxy.ts` pada setiap permintaan (dan DITULIS ULANG di sana,
 * jadi nilai kiriman klien tidak pernah dipercaya). Header hilang — runtime di
 * luar proxy, matcher yang berubah — berarti tidak ada penimpa: kalimat bawaan,
 * bukan galat.
 *
 * ⚠ IMPORNYA DINAMIS, dan itu doktrin bukan gaya (#137): `site-content-store`
 * mengimpor `lib/platform-db.ts`. Berkas ini diimpor nyaris setiap route di
 * aplikasi — impor statis akan menyeret klien Prisma penagihan ke dalam bundel
 * server setiap halaman buku besar, yang tidak punya satu pun urusan dengannya.
 * Dengan `import()` di dalam cabang, modul itu hanya dimuat ketika sebuah
 * halaman pemasaran benar-benar dirender.
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const dictionary = await loadDictionary(locale);

  let pathname: string | null = null;
  try {
    pathname = (await headers()).get("x-sai-path");
  } catch {
    /* Di luar konteks permintaan (tidak terjadi pada halaman, tetapi mungkin
       pada pemanggil masa depan): tanpa jalur, tanpa penimpa. */
    return dictionary;
  }
  if (!isSiteContentPath(pathname)) return dictionary;

  const { publishedSiteContent } = await import("@/lib/site-content-store");
  return applySiteContent(dictionary, await publishedSiteContent(locale));
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
