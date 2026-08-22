/**
 * Root layout PEMASARAN — `/` dan `/pricing`, dan tidak ada yang lain.
 *
 * ══ KENAPA AKARNYA SENDIRI (issue #399) ════════════════════════════════════
 * Halaman di grup ini dibaca orang yang BELUM punya akun. Di bawah root layout
 * aplikasi (`app/(app)/layout.tsx`) setiap pengunjung anonim ikut membayar
 * dua hal yang hanya berguna sesudah masuk: kamus lengkap ~2.500 kunci yang
 * diserialkan `LocaleProvider` ke payload RSC, dan satu `GET
 * /api/company/identity` yang dipicu `CompanyIdentityProvider` pada setiap
 * muatan. Keduanya TIDAK ada di sini — dan itulah seluruh perbedaan layout ini
 * dari saudaranya. Yang sama (`<html>`, font, tema, `AntdRegistry`,
 * `AntdProvider`) datang dari `RootDocument`, satu berkas untuk kedua akar,
 * supaya keduanya tidak menyimpang.
 *
 * `AntdProvider` tetap ada dengan sengaja: ialah yang menulis blok
 * `.sai-tokens{--ant-…}` yang mewarnai seluruh pendaratan lewat
 * `var(--ant-…)`; tanpa itu halamannya tidak gagal — ia hanya kehilangan
 * warnanya. Angka sebelum/sesudah pemisahan ini tercatat di
 * `design-system/sai-accounting/pages/landing.md` §Layout akar pemasaran.
 *
 * ══ DUA DAUN CLIENT PENDARATAN BEKERJA TANPA `LocaleProvider` ═════════════
 * `LocaleToggle` dan `ThemeToggle` menerima bahasa & labelnya sebagai PROP
 * dari komponen server pendaratan (`landing-nav.tsx`, `landing-footer.tsx`),
 * jadi ketiadaan `LocaleProvider` di sini bukan lubang: yang di dalam app
 * tetap membaca konteks, yang di pendaratan membaca prop. Kalau sebuah daun
 * client baru dipasang di pendaratan dan memanggil `useT()`, ia mendapat
 * KUNCInya sendiri sebagai teks (`lib/i18n/client.tsx`) — pasang propnya,
 * jangan pasang providernya.
 */
import type { Metadata } from "next";

import { RootDocument } from "@/components/providers/root-document";
import { APP_NAME } from "@/lib/constants";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme/server";

/* Cadangan bila sebuah halaman pemasaran lupa metadata-nya sendiri; `/` dan
   `/pricing` masing-masing menimpanya dengan judul, deskripsi & kanoniknya. */
export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  return {
    title: APP_NAME,
    description: dictionary.app.description,
  };
}

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const theme = await getTheme();

  return (
    <RootDocument locale={locale} theme={theme}>
      {children}
    </RootDocument>
  );
}
