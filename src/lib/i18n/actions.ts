"use server";

/**
 * Server action pengganti bahasa.
 *
 * Dipilih ketimbang API route karena inilah satu-satunya efeknya: menulis satu
 * cookie tampilan. Route handler baru akan menuntut deklarasi izin
 * (`requireApiPermission`, dijaga `tests/authz-coverage.test.ts`) untuk sesuatu
 * yang memang TIDAK berizin — bahasa adalah preferensi tampilan, bukan data.
 *
 * Sengaja tanpa penjaga sesi: halaman login pun berhak berganti bahasa, dan
 * cookie ini tidak membuka apa pun. Nilai asing ditolak lebih dulu oleh
 * `isLocale`, jadi cookie tidak pernah berisi apa pun di luar `LOCALES`.
 */

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "./config";

export async function setLocale(locale: string): Promise<Locale> {
  const next: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Bukan rahasia dan tidak dipakai untuk otorisasi — biarkan terbaca skrip
    // sisi klien, sama seperti preferensi tampilan lain.
    httpOnly: false,
  });

  return next;
}
