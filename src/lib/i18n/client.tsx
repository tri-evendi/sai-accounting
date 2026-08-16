"use client";

/**
 * Sisi CLIENT dari fondasi multibahasa.
 *
 * `LocaleProvider` TIDAK memuat kamus sendiri — ia menerima kamus yang SUDAH
 * dipilih server (root layout). Itu yang menjaga janji "hanya bahasa aktif yang
 * sampai ke browser": kamus ikut sebagai data di payload RSC, bukan tiga berkas
 * JSON di dalam bundel JavaScript.
 *
 * Pemakaian di komponen client:
 *
 * ```tsx
 * const t = useT();
 * <span>{t("userMenu.signOut")}</span>
 * <p>{t("table.page", { page: 2, pages: 7 })}</p>
 * ```
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { translate, type Dictionary, type DictionaryKey, type TranslationValues } from "./dictionary";

export type TranslateFn = (key: DictionaryKey, values?: TranslationValues) => string;

interface LocaleContextValue {
  locale: Locale;
  dictionary: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  // Nilai konteks distabilkan supaya seluruh pohon tidak ikut render ulang
  // setiap kali layout dirender — kamus hanya berubah saat bahasanya berganti.
  const value = useMemo(() => ({ locale, dictionary }), [locale, dictionary]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Bahasa aktif + kamusnya. Tanpa provider, nilainya `null` — pemanggilnya
 * (`useLocale`/`useT`) yang memutuskan cara jatuh dengan aman.
 */
function useLocaleContext(): LocaleContextValue | null {
  return useContext(LocaleContext);
}

/** Bahasa aktif; di luar provider jatuh ke bahasa bawaan (tidak melempar). */
export function useLocale(): Locale {
  return useLocaleContext()?.locale ?? DEFAULT_LOCALE;
}

/** Kamus aktif; `null` di luar provider. Dipakai peta label bertipe penuh. */
export function useDictionary(): Dictionary | null {
  return useLocaleContext()?.dictionary ?? null;
}

/**
 * Fungsi penerjemah. Di luar `LocaleProvider` ia mengembalikan kuncinya sendiri
 * (dan berteriak di console saat pengembangan) — komponen yang lupa dibungkus
 * tampak salah, tetapi tidak pernah menjatuhkan halaman produksi.
 */
export function useT(): TranslateFn {
  const context = useLocaleContext();
  const dictionary = context?.dictionary ?? null;

  return useCallback(
    (key, values) => {
      if (!dictionary && process.env.NODE_ENV !== "production") {
        console.error(
          `[i18n] useT() dipanggil di luar <LocaleProvider> (kunci: "${key}"). ` +
            "Provider dipasang di src/app/(app)/layout.tsx (root layout aplikasi); " +
            "halaman pemasaran di src/app/(marketing) SENGAJA tanpa provider ini — " +
            "di sana teks diberikan lewat prop (#399)."
        );
      }
      return translate(dictionary, key, values);
    },
    [dictionary]
  );
}
