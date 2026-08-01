import "server-only";

/**
 * Pembacaan tema di sisi server.
 *
 * Dipisah dari `config.ts` (murni) karena menyentuh `next/headers` — batas yang
 * sama dengan `lib/i18n/server.ts`, dan dijaga `tests/server-only-boundary.test.ts`:
 * komponen client tidak boleh menyeret modul ini ke bundelnya.
 */

import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type Theme } from "./config";

/** Tema pilihan pembaca. Cookie kosong/rusak → bawaan terang. */
export async function getTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  return parseTheme(cookieStore.get(THEME_COOKIE)?.value);
}
