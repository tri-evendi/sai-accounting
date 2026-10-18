/**
 * ROOT LAYOUT konsol operator (monorepo Fase 3d).
 *
 * Kerangkanya SAMA dengan aplikasi pelanggan — `RootDocument` (<html>, font,
 * registry AntD, tema) dan `LocaleProvider` — karena keduanya kini di paket.
 * Yang SENGAJA tidak ada: `StatusBanner` dan `CompanyIdentityProvider`. Banner
 * itu kabar untuk pelanggan, dan operator menulisnya sendiri; identitas
 * perusahaan adalah permukaan buku, dan konsol tidak membuka buku.
 */
import type { Metadata } from "next";
export { viewport } from "@sai/ui/viewport";
import { APP_NAME } from "@sai/core/constants";
import { LocaleProvider } from "@sai/core/i18n/client";
import { getDictionary, getLocale } from "@sai/platform/i18n/server";
import { RootDocument } from "@sai/ui/providers/root-document";
import { getTheme } from "@sai/ui/theme/server";
import { activeBrandMarkSrc } from "@sai/platform/brand-routes";

export const metadata: Metadata = {
  title: `${APP_NAME} · Operator`,
  // Konsol tidak pernah boleh terindeks, apa pun yang dikatakan robots.txt host-nya.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const [dictionary, theme, brandMarkSrc] = await Promise.all([getDictionary(locale), getTheme(), activeBrandMarkSrc()]);
  return (
    <RootDocument locale={locale} theme={theme} brandMarkSrc={brandMarkSrc}>
      <LocaleProvider locale={locale} dictionary={dictionary}>
        {children}
      </LocaleProvider>
    </RootDocument>
  );
}
