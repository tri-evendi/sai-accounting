/**
 * `<html>` + `<body>` + lapisan tema — bagian root layout yang SAMA untuk
 * kedua akar aplikasi ini (issue #399).
 *
 * ══ KENAPA ADA DUA ROOT LAYOUT, DAN KENAPA BERKAS INI ══════════════════════
 * Sampai #399 seluruh aplikasi berdiri di bawah SATU root layout, dan root
 * layout itu memikul segalanya: `AntdRegistry`, `ThemeProvider`,
 * `LocaleProvider` (yang menyerialkan seluruh kamus ~2.500 kunci ke payload
 * RSC), `AntdProvider`, dan `CompanyIdentityProvider` (yang memanggil
 * `/api/company/identity` pada setiap muatan). Untuk app internal itu memang
 * harganya. Untuk halaman pendaratan `/` — permukaan yang dibaca orang TANPA
 * akun — itu berarti setiap pengunjung anonim mengunduh kamus lengkap dan
 * memicu satu query identitas perusahaan yang tidak pernah ia lihat.
 *
 * Next hanya punya satu cara memisahkan keduanya: dua root layout, masing-
 * masing di route group-nya sendiri (`app/(marketing)` dan `app/(app)`),
 * tanpa `app/layout.tsx` di atasnya (docs `route-groups.md` §Use cases). Root
 * layout WAJIB merender `<html>` dan `<body>`, jadi tanpa berkas ini kedua
 * layout itu akan menyalin ~90 baris yang sama — font, kelas pemikul token,
 * skrip tema sebelum-cat, registri gaya AntD — dan salinan itu menyimpang pada
 * hari salah satunya disunting. Yang membedakan keduanya HANYA yang mereka
 * taruh di dalam `children`: `(app)` menambah kamus & identitas perusahaan,
 * `(marketing)` tidak menambah apa pun.
 *
 * ══ YANG TETAP DI SINI, DAN KENAPA TIDAK BISA LEBIH TIPIS ══════════════════
 * `AntdRegistry` + `AntdProvider` (dan `ThemeProvider` yang dibaca
 * `AntdProvider`) ikut ke akar pemasaran juga, bukan karena kelalaian:
 * `AntdProvider`-lah yang lewat `cssVar: { key: ANTD_CSS_VAR_KEY }` menulis
 * blok `.sai-tokens{--ant-…}` yang dipikul `<html>` — dan seluruh halaman
 * pendaratan berwarna lewat `var(--ant-…)`. Tanpa provider itu tidak ada satu
 * pun galat; halamannya hanya kehilangan seluruh warnanya. `AntdRegistry`
 * yang menyisipkan blok itu (dan gaya `Button`/`Card`/`Segmented` yang
 * dipakai pendaratan) ke HTML pertama, sebelum hidrasi.
 *
 * ══ Aksara Han (bahasa Mandarin) SENGAJA tidak memakai webfont ═════════════
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
import { Inter } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";

import "@/app/globals.css";
import { AntdProvider } from "@/components/providers/antd-provider";
import type { Locale } from "@/lib/i18n/config";
import { ANTD_CSS_VAR_KEY } from "@/lib/theme/antd-tokens";
import { colorScheme, themeClass, themeScript, type Theme } from "@/lib/theme/config";
import { ThemeProvider } from "@/lib/theme/client";

// Inter (MASTER.md) — dipilih karena dukungan `tabular-nums` untuk angka keuangan.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export function RootDocument({
  locale,
  theme,
  children,
}: {
  /** Bahasa aktif — dibaca root layout dari cookie (`getLocale()`), SEKALI. */
  locale: Locale;
  /**
   * Tema — ikut dibaca DI SERVER dari cookie yang sama-sama tampilan-saja,
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
  theme: Theme;
  children: React.ReactNode;
}) {
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
            {/* Di dalam ThemeProvider dengan sengaja: jembatan AntD membaca
                tema dari konteks itu supaya toggle tema mengubah komponen AntD
                tanpa muat ulang (alasan lengkapnya di antd-provider.tsx).
                Bahasanya tetap datang sebagai prop dari server. */}
            <AntdProvider locale={locale}>{children}</AntdProvider>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
