"use client";

/**
 * Kamus untuk layar status di permukaan TANPA `<LocaleProvider>` — batas galat
 * pemasaran dan `global-error` (yang menggantikan seluruh root layout, jadi
 * provider-nya tidak ada).
 *
 * Bahasanya dibaca dari `<html lang>` — `RootDocument` menulisnya dari cookie
 * yang sama dengan server — dengan cookie `locale` sebagai cadangan untuk
 * `global-error`, yang menulis `<html>`-nya sendiri. Kamus dimuat DINAMIS
 * (`loadDictionary`), jadi hanya bahasa aktif yang diunduh, dan hanya saat
 * layar langka ini benar-benar tampil.
 */
import { useEffect, useState } from "react";

import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE, type Locale } from "@sai/core/i18n/config";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import { loadDictionary } from "@sai/core/i18n/load";

export function activeLocaleInBrowser(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const dariHtml = document.documentElement.lang;
  if (isLocale(dariHtml)) return dariHtml;
  const dariCookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return dariCookie && isLocale(dariCookie) ? dariCookie : DEFAULT_LOCALE;
}

/** `null` selama kamus belum termuat. */
export function useLoadedDictionary(): { locale: Locale; dictionary: Dictionary | null } {
  const [state, setState] = useState<{ locale: Locale; dictionary: Dictionary | null }>({
    locale: DEFAULT_LOCALE,
    dictionary: null,
  });
  useEffect(() => {
    const locale = activeLocaleInBrowser();
    let batal = false;
    loadDictionary(locale)
      .then((dictionary) => {
        if (!batal) setState({ locale, dictionary });
      })
      .catch(() => {
        /* Chunk kamus gagal diunduh — layar tetap tampil dengan bahasa bawaan
           lewat percobaan kedua; kalau itu pun gagal, pemanggil memakai kunci. */
        loadDictionary(DEFAULT_LOCALE)
          .then((dictionary) => {
            if (!batal) setState({ locale: DEFAULT_LOCALE, dictionary });
          })
          .catch(() => undefined);
      });
    return () => {
      batal = true;
    };
  }, []);
  return state;
}
