import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { LocaleProvider } from "@/lib/i18n/client";
import { CompanyIdentityProvider } from "@/lib/company-identity-client";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { colorScheme, themeClass, themeScript } from "@/lib/theme/config";
import { ThemeProvider } from "@/lib/theme/client";
import { getTheme } from "@/lib/theme/server";

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
  /*
   * Tema ikut dibaca DI SERVER, dari cookie yang sama-sama tampilan-saja.
   * Kelas `.dark` karena itu sudah menempel pada HTML pertama — tidak ada
   * kedipan terang sebelum hydrate, dan tidak ada ketidakcocokan hydrate yang
   * lahir dari membaca localStorage setelah render pertama.
   */
  const theme = await getTheme();

  return (
    <html
      lang={locale}
      className={`${inter.variable} h-full ${themeClass(theme)}`}
      // Ikut mewarnai kontrol BAWAAN peramban (pemilih tanggal wizard, menu
      // select, bilah geser) — bagian yang tidak kita gambar sendiri dan
      // karena itu paling sering tertinggal terang di halaman gelap.
      style={{ colorScheme: colorScheme(theme) }}
      suppressHydrationWarning={theme === "system"}
    >
      <head>
        {/*
         * Hanya untuk pilihan "ikut sistem": preferensi OS hidup di browser
         * dan tak terlihat dari server. Skrip sinkron sebelum cat pertama
         * adalah satu-satunya cara memasang kelasnya tanpa kedipan. Untuk
         * pilihan terang/gelap yang eksplisit, tidak ada skrip sama sekali —
         * kelasnya sudah datang dari server di atas.
         */}
        {theme === "system" && (
          <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
        )}
      </head>
      <body className="min-h-full">
        <ThemeProvider theme={theme}>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {/* Identitas perusahaan diambil di sisi client (lihat
              company-identity-client.tsx): membacanya di server SINI berarti
              satu query Prisma di root layout, yang ikut berjalan saat
              `next build` menghasilkan 49 halaman statis — padahal build
              memakai DATABASE_URL placeholder tanpa koneksi. */}
          <CompanyIdentityProvider>{children}</CompanyIdentityProvider>
        </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
