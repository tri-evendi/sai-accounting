/**
 * Root layout APLIKASI — semua yang bukan halaman pemasaran: masuk/daftar,
 * dasbor, panel tenant, wisaya penyiapan, konsol operator, dokumentasi.
 *
 * ══ KENAPA INI SALAH SATU DARI DUA ROOT LAYOUT (issue #399) ════════════════
 * Sampai #399 berkas ini adalah `app/layout.tsx` dan membungkus SELURUH
 * aplikasi, termasuk halaman pendaratan `/`. Akibatnya setiap pengunjung
 * anonim pendaratan menerima kamus lengkap ~2.500 kunci di payload RSC
 * (`LocaleProvider`) dan memicu `GET /api/company/identity`
 * (`CompanyIdentityProvider`) — dua hal yang hanya berguna SESUDAH masuk.
 *
 * Kini ada dua akar: `app/(marketing)/layout.tsx` untuk `/` dan `/pricing`, dan
 * berkas ini untuk sisanya. Keduanya berbagi `<html>`/`<body>`/font/tema/
 * registri AntD lewat `RootDocument` (`components/providers/root-document.tsx`
 * — alasan lengkapnya di kepala berkas itu); yang ditambahkan DI SINI adalah
 * dua provider yang memang milik aplikasi bersesi.
 *
 * ⚠ Navigasi dari `/` ke `/login` (dan sebaliknya) kini pemuatan halaman
 * PENUH, bukan navigasi sisi-klien — konsekuensi wajar dua root layout
 * (`route-groups.md` §Caveats). Untuk tombol "Masuk"/"Daftar" di pendaratan
 * itu memang yang terjadi juga sebelumnya bagi pengunjung tanpa cache.
 */
import type { Metadata } from "next";

import { APP_NAME } from "@/lib/constants";
import { RootDocument } from "@/components/providers/root-document";
import { LocaleProvider } from "@/lib/i18n/client";
import { CompanyIdentityProvider } from "@/lib/company-identity-client";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme/server";

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  return {
    // Dari konstanta, bukan literal: judul tab adalah permukaan merek juga, dan
    // literal di sini sudah sekali tertinggal saat produknya berganti nama.
    title: APP_NAME,
    description: dictionary.app.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Bahasa ditentukan di SATU tempat: cookie `locale` (lihat lib/i18n/config.ts
  // untuk alasan cookie ketimbang segmen rute `[lang]`). Kamus yang sudah
  // terpilih diteruskan ke provider client, jadi hanya bahasa aktif yang
  // menyeberang ke browser.
  const locale = await getLocale();
  const dictionary = await getDictionary(locale);
  const theme = await getTheme();

  return (
    <RootDocument locale={locale} theme={theme}>
      <LocaleProvider locale={locale} dictionary={dictionary}>
        {/* Identitas perusahaan diambil di sisi client (lihat
            company-identity-client.tsx): membacanya di server SINI berarti
            satu query Prisma di root layout, yang ikut berjalan saat
            `next build` menghasilkan 49 halaman statis — padahal build
            memakai DATABASE_URL placeholder tanpa koneksi. */}
        <CompanyIdentityProvider>{children}</CompanyIdentityProvider>
      </LocaleProvider>
    </RootDocument>
  );
}
