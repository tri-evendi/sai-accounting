"use server";

/**
 * Server action pengganti tema.
 *
 * Bentuknya sengaja sama persis dengan `lib/i18n/actions.ts`, dan alasannya
 * sama: satu-satunya efeknya adalah menulis satu cookie TAMPILAN. Route
 * handler baru akan menuntut deklarasi izin (`requireApiPermission`, dijaga
 * `tests/authz-coverage.test.ts`) untuk sesuatu yang memang tidak berizin.
 *
 * Tanpa penjaga sesi — halaman masuk pun berhak berganti tema, dan cookie ini
 * tidak membuka apa pun. Nilai asing ditolak `parseTheme`, jadi cookie tidak
 * pernah berisi apa pun di luar `THEMES`.
 */

import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "./config";

export async function setTheme(theme: string): Promise<Theme> {
  const next = parseTheme(theme);

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, next, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Bukan rahasia dan tidak dipakai untuk otorisasi — biarkan terbaca skrip
    // sisi klien, sama seperti preferensi tampilan lain.
    httpOnly: false,
  });

  return next;
}
