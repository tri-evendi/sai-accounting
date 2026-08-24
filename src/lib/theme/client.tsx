"use client";

/**
 * Sisi CLIENT tema — penyimpan pilihan + penerapnya ke DOM.
 *
 * Polanya mengikuti `LocaleProvider`: nilai awal datang dari SERVER (cookie
 * sudah dibaca root layout), jadi provider ini tidak pernah menebak pada
 * render pertama — ia hanya meneruskan apa yang sudah benar, lalu mengurus
 * perubahan sesudahnya.
 *
 * ── Kenapa kelasnya diterapkan di sini, bukan menunggu server ──────────────
 * Mengganti tema hanya menulis cookie; tanpa penerapan langsung, layarnya baru
 * berubah pada navigasi berikutnya — sebuah tombol yang tampak rusak. Karena
 * itu `changeTheme` menyentuh `documentElement` lebih dulu (perubahan terlihat
 * seketika), baru menitipkan pilihannya ke cookie lewat server action supaya
 * pemuatan berikutnya sudah benar sejak HTML pertama.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DARK_CLASS,
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  colorScheme,
  type ResolvedTheme,
  type Theme,
} from "./config";
import { setTheme as persistTheme } from "./actions";

interface ThemeContextValue {
  /** Pilihan pengguna, termasuk `system`. */
  theme: Theme;
  /** Yang benar-benar tampil sekarang — `system` sudah diselesaikan. */
  resolved: ResolvedTheme;
  changeTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolved: "light",
  changeTheme: () => {},
});

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

/** `system` → terang/gelap menurut OS. Di server selalu terang (lihat config). */
function resolve(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return prefersDark() ? "dark" : "light";
}

function apply(resolved: ResolvedTheme, theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, resolved === "dark");
  root.style.colorScheme = colorScheme(theme);
}

export function ThemeProvider({
  theme: initial,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initial);
  /*
   * Nilai awalnya DITURUNKAN, bukan diukur: `resolve()` memanggil `matchMedia`
   * yang tidak ada di server, jadi mengukurnya saat render pertama akan
   * menghasilkan markup client yang berbeda dari server. Untuk `system`,
   * angka yang benar dipasang oleh skrip sebelum-cat di root layout dan
   * disamakan oleh efek di bawah.
   */
  const [resolved, setResolved] = useState<ResolvedTheme>(
    initial === "system" ? "light" : initial
  );

  // Samakan keadaan React dengan apa yang sudah dilakukan skrip sebelum-cat,
  // lalu ikuti perubahan preferensi OS selama pilihannya `system`.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next: ResolvedTheme = media.matches ? "dark" : "light";
      setResolved(next);
      apply(next, "system");
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  const changeTheme = useCallback((next: Theme) => {
    const nextResolved = resolve(next);
    setThemeState(next);
    setResolved(nextResolved);
    apply(nextResolved, next);
    /*
     * Cookie menyusul; layarnya sudah berubah. Kegagalan menulisnya hanya
     * berarti pilihannya tidak bertahan sampai pemuatan berikutnya — bukan
     * alasan menahan perubahan yang diminta pengguna.
     *
     * Sejak 24 Agu 2026 kegagalan itu punya sebab yang KITA tahu namanya: tab
     * yang terbuka sejak sebelum sebuah deploy memegang id server action yang
     * server barunya tidak kenali lagi. Jadi cookienya ditulis sendiri —
     * tanpa muat ulang, sebab di sini layarnya memang sudah berpindah.
     * (Kembarannya di `i18n/locale-cookie.ts` HARUS memuat ulang, karena
     * kamusnya dipilih di server.)
     */
    void persistTheme(next).catch(() => {
      document.cookie =
        `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, changeTheme }),
    [theme, resolved, changeTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
