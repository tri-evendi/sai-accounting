import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/client";
import { getDictionary, getLocale } from "@/lib/i18n/server";

// Inter (MASTER.md) — dipilih karena dukungan `tabular-nums` untuk angka keuangan.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Aksara Han (bahasa Mandarin) SENGAJA tidak memakai webfont.
 *
 * Inter hanya memuat subset `latin`, jadi aksara Tionghoa memang harus datang
 * dari font lain — tapi font itu font SISTEM, bukan unduhan (lihat tumpukan
 * `html:lang(zh)` di globals.css). Alasannya biaya build: `next/font/google`
 * mengunduh font saat BUILD, dan Noto Sans SC dipecah Google menjadi **101
 * berkas woff2** terpisah (terukur, bukan perkiraan). Build produksi di mesin
 * ini sudah ~10 menit dengan RAM ~1 GB dan berjalan di dalam
 * `docker compose up --build -d`; menambah 101 pengambilan jaringan ke jalur
 * itu berarti satu unduhan gagal = deploy gagal — harga yang mahal untuk
 * perbedaan yang nyaris tak terlihat.
 *
 * Yang hilang kecil: setiap perangkat nyata sudah punya font UI CJK berkualitas
 * (PingFang SC di Mac/iOS, Microsoft YaHei di Windows, Noto Sans CJK di
 * Android/Linux). Pembaca Mandarin justru mendapat font yang sudah familier,
 * tanpa FOUT dan tanpa mengunduh berkas Han berukuran megabita.
 */

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getLocale());
  return {
    title: "SAI Management",
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

  return (
    <html lang={locale} className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
