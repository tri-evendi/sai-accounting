import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { AntdProvider } from "@/components/providers/antd-provider";
import { LocaleProvider } from "@/lib/i18n/client";
import { CompanyIdentityProvider } from "@/lib/company-identity-client";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { ANTD_CSS_VAR_KEY } from "@/lib/theme/antd-tokens";
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
   * Tema ikut dibaca DI SERVER, dari cookie yang sama-sama tampilan-saja —
   * jadi algoritma AntD yang benar sudah dipilih sebelum HTML pertama dikirim,
   * dan tidak ada ketidakcocokan hydrate yang lahir dari membaca localStorage
   * setelah render pertama.
   *
   * Sejak #203 kelas `.dark` yang ikut terpasang di bawah bukan lagi pemikul
   * palet: seluruh warna datang dari blok token AntD. Yang tersisa untuknya
   * hanya dua variabel di `globals.css`, dan satu-satunya keadaan yang
   * benar-benar membutuhkannya adalah pilihan "ikut sistem" — lihat blok
   * `html.dark` di sana sebelum menghapusnya.
   */
  const theme = await getTheme();

  return (
    <html
      lang={locale}
      /*
       * `ANTD_CSS_VAR_KEY` (issue #227) — bukan kelas Tailwind, dan bukan
       * hiasan. Ia PEMIKUL blok variabel token AntD: `AntdProvider` memberi
       * `ConfigProvider` kunci yang sama, `AntdRegistry` di bawah menyisipkan
       * bloknya (`.sai-tokens{--ant-…}`) ke HTML pertama, dan kelas di sini
       * yang membuat seluruh dokumen mewarisinya — termasuk server component
       * yang tidak punya satu pun komponen AntD di atasnya.
       *
       * Menghapusnya tidak menghasilkan galat apa pun: `var(--ant-…)` hanya
       * berhenti teratasi dan warnanya jatuh diam-diam ke warisan, di seluruh
       * pohon sekaligus. Alasan lengkap + urutan penyisipannya di
       * `lib/theme/antd-tokens.ts`.
       *
       * Tiga kelas, dan tak satu pun kelas GAYA — sejak #203 tidak ada lagi
       * lembar utilitas yang bisa memaknainya. `inter.variable` menaruh
       * `--font-inter`; `ANTD_CSS_VAR_KEY` memikul blok token; `themeClass`
       * menyalakan satu-satunya sisa `.dark` di `globals.css`, yang isinya
       * hanya dua variabel dan alasannya tertulis di sana. Tinggi penuh
       * (`h-full` lama) juga pindah ke `globals.css`, karena ia berpasangan
       * dengan `min-height` milik `<body>`.
       */
      className={`${inter.variable} ${ANTD_CSS_VAR_KEY} ${themeClass(theme)}`}
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
      <body>
        {/*
         * AntdRegistry mengumpulkan gaya CSS-in-JS yang dipakai render ini dan
         * menyisipkannya ke HTML lewat `useServerInsertedHTML` — sebelum
         * markup yang memakainya. Tanpa itu gaya AntD baru muncul setelah
         * hydrate: layar berkedip tanpa gaya di setiap muatan pertama, dan
         * pada koneksi lambat kedipannya cukup panjang untuk membuat orang
         * menekan tombol dua kali. Ia harus MEMBUNGKUS semua yang merender
         * komponen AntD, karena itu letaknya paling luar di dalam <body>.
         */}
        <AntdRegistry>
        <ThemeProvider theme={theme}>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {/* Di dalam ThemeProvider dengan sengaja: jembatan AntD membaca tema
              dari konteks itu supaya toggle tema mengubah komponen AntD tanpa
              muat ulang (alasan lengkapnya di antd-provider.tsx). Bahasanya
              tetap datang sebagai prop dari server. */}
          <AntdProvider locale={locale}>
            {/* Identitas perusahaan diambil di sisi client (lihat
                company-identity-client.tsx): membacanya di server SINI berarti
                satu query Prisma di root layout, yang ikut berjalan saat
                `next build` menghasilkan 49 halaman statis — padahal build
                memakai DATABASE_URL placeholder tanpa koneksi. */}
            <CompanyIdentityProvider>{children}</CompanyIdentityProvider>
          </AntdProvider>
        </LocaleProvider>
        </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
