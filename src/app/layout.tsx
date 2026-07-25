import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
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
 * Aksara Han untuk bahasa Mandarin (fondasi i18n).
 *
 * Inter hanya memuat subset `latin`: satu pun aksara Tionghoa tidak ada di
 * dalamnya, jadi tanpa font ini seluruh UI Mandarin jatuh ke font cadangan
 * sistem — tampilannya berbeda mesin per mesin dan sering rusak.
 *
 * Dua rincian yang disengaja:
 *  • `preload: false` — berkas Han berukuran besar dan dipecah menjadi puluhan
 *    blok `unicode-range`. Tanpa ini, pembaca Indonesia/Inggris ikut menanggung
 *    preload font yang tak pernah mereka pakai; dengan ini browser baru
 *    mengambil blok yang benar-benar dibutuhkan halaman Mandarin.
 *  • Urutan tumpukan di `globals.css` menaruh Inter DULU, Noto Sans SC sesudahnya
 *    (lihat `html:lang(zh)`), sehingga angka & huruf Latin tetap dari Inter —
 *    aturan `tabular-nums` MASTER.md tetap berlaku di ketiga bahasa — dan hanya
 *    aksara Han yang jatuh ke Noto.
 */
const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

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
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansSC.variable} h-full`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
