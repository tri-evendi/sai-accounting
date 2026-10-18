import { createRequire } from "node:module";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/*
 * Versi aplikasi diambil dari `package.json` SAAT BUILD, lalu dititipkan
 * sebagai variabel lingkungan publik.
 *
 * Sebelum ini sidebar mencetak "v0.1.0" sebagai literal. Nomor versi yang
 * diketik tangan di komponen tidak pernah ikut naik saat rilis — ia hanya
 * membusuk diam-diam, dan justru dibaca orang ketika sedang melaporkan
 * masalah ("saya pakai v0.1.0") sehingga menyesatkan tepat pada saat ia paling
 * dipercaya.
 *
 * Diinjeksi lewat `env`, BUKAN diimpor dari komponen: `import pkg from
 * "../../package.json"` akan menyeret seluruh daftar dependensi ke bundel
 * client — jejak yang tidak perlu diberikan ke peramban.
 */
const { version: appVersion } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      /*
       * ── `script-src`: `'unsafe-eval'` DICABUT DI PRODUKSI ─────────────────
       *
       * Dokumentasi Next sendiri menyatakannya
       * (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):
       *
       *   "In development, `'unsafe-eval'` is required because React uses
       *    `eval` to provide enhanced debugging information, such as
       *    reconstructing server-side error stacks in the browser.
       *    `unsafe-eval` is not required for production. Neither React nor
       *    Next.js use `eval` in production by default."
       *
       * Diperiksa juga di repo ini, bukan sekadar dipercaya:
       *   • NOL `eval(` / `new Function(` di seluruh `src/` tulisan sendiri;
       *   • dari 204 berkas js di `.next/static`, TEPAT SATU memuat `eval(` —
       *     dan itu shim `vm` milik dependensi Next sendiri (`vm-browserify`),
       *     berisi DEFINISI `Script.prototype.runInThisContext`, tanpa satu
       *     pun tempat pemanggilan di dalam bundel.
       *
       * Tetap diizinkan di pengembangan: tanpa itu, jejak galat sisi-server
       * berhenti bisa direkonstruksi di peramban, dan yang hilang justru
       * perkakas yang dipakai saat memperbaiki galat.
       *
       * ⚠ Kalau suatu saat sebuah pustaka BARU menuntut `eval` di produksi,
       * gejalanya adalah galat CSP di konsol peramban pada fitur yang
       * memakainya — BUKAN layar putih. Jangan mengembalikan `'unsafe-eval'`
       * secara global sebagai jawaban; cari pustakanya.
       */
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
      /*
       * ── `style-src 'unsafe-inline'` WAJIB TINGGAL, dan itu STRUKTURAL ─────
       *
       * Ini bukan kelalaian dan bukan sesuatu yang bisa ditutup dengan nonce.
       * Sejak issue #203 seluruh gaya di repo ini ditulis SEBARIS
       * (`style={{...}}`) — terukur 2.618 kemunculan di 305 berkas .tsx.
       *
       * Dan di CSP, `style-src` mengatur DUA hal yang sering tertukar: elemen
       * `<style>` DAN atribut `style="..."`. Sebuah nonce hanya bisa menandai
       * yang pertama; atribut gaya sebaris tidak punya tempat untuk membawa
       * nonce, dan satu-satunya yang mengizinkannya adalah `'unsafe-inline'`
       * (atau `'unsafe-hashes'`, yang menuntut hash setiap nilai gaya — 2.618
       * hash yang berubah setiap kali ada yang menyunting satu angka).
       *
       * Jadi mencabutnya menuntut PEMBATALAN #203, bukan penyetelan CSP. Itu
       * pertukaran yang jauh lebih besar daripada yang dibeli, dan keputusannya
       * sudah diambil di arah sebaliknya dengan sadar.
       */
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
      // PDF pratinjau dokumen (faktur/kontrak/dll) dirender sebagai blob: di
      // dalam <iframe>/<embed> — izinkan blob: sesama-asal untuk frame/object,
      // tanpa membuka sumber luar apa pun (tetap 'self' selain blob:).
      "frame-src 'self' blob:",
      "object-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      /*
       * ── KENAPA `script-src` MASIH BER-`'unsafe-inline'` ───────────────────
       *
       * Next menyisipkan skrip bootstrap sebaris, jadi pilihannya hanya dua:
       * `'unsafe-inline'`, atau nonce per permintaan + `'strict-dynamic'`.
       * Yang kedua MUNGKIN, dan inilah yang dituntutnya — ditulis di sini
       * supaya pembaca berikutnya tahu ini sudah ditinjau, bukan terlewat:
       *
       *   1. CSP harus PINDAH dari `headers()` di berkas ini ke `proxy.ts`.
       *      Header di sini statis; nonce harus lahir ulang setiap permintaan.
       *   2. Setiap halaman harus dirender DINAMIS (syarat Next untuk nonce).
       *      Di repo ini hampir semuanya sudah `force-dynamic`, jadi ongkosnya
       *      kecil — tetapi "hampir" perlu dibuktikan satu per satu lebih dulu.
       *   3. CSS-in-JS Ant Design harus diberi nonce yang sama lewat
       *      `StyleProvider`, atau seluruh gaya komponennya diblokir.
       *   4. `'strict-dynamic'` harus diuji terhadap Recharts DAN pratinjau PDF
       *      blob — keduanya memuat/menyuntik di runtime, dan keduanya adalah
       *      permukaan yang kerusakannya HALUS: grafik yang kosong dan
       *      pratinjau yang gagal tidak menjatuhkan halaman.
       *
       * Jadi ia proyek tersendiri dengan permukaan uji yang nyata, bukan satu
       * baris di berkas ini. Yang dikerjakan sekarang adalah bagian yang bisa
       * DIBUKTIKAN tanpa itu: mencabut `'unsafe-eval'` di produksi.
       *
       * Catatan yang memudahkan kelak: begitu nonce + `'strict-dynamic'`
       * dipasang, peramban yang mendukung `strict-dynamic` MENGABAIKAN
       * `'unsafe-inline'` dengan sendirinya — jadi keduanya boleh hidup
       * bersama selama masa peralihan tanpa melemahkan yang baru.
       */
    ].join("; "),
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Paket workspace (`packages/*`) dikirim sebagai SUMBER TypeScript, tanpa
   * langkah build sendiri (dok 14 §5 Fase 1). Next tidak mentranspilasi isi
   * `node_modules` kecuali disebut di sini, dan tanpanya build gagal pada
   * sintaksis tipe pertama di `@sai/db`.
   */
  transpilePackages: ["@sai/db", "@sai/core"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  /**
   * Pemeriksaan tipe DIMATIKAN di `next build` — dan itu disengaja, bukan
   * kelalaian. Baca ini sebelum mengembalikannya ke `false`.
   *
   * Mesin produksi ini punya RAM ~1,9 GB yang sebagian besar sudah dipakai
   * container yang sedang melayani. Fase "Running TypeScript" milik `next build`
   * memeriksa ulang seluruh proyek DI DALAM container build, dan di sisa memori
   * yang ada ia hanya punya dua nasib:
   *   • tanpa batas heap → tumbuh sampai kernel membunuhnya (exit code 137);
   *   • dengan batas heap → lolos dari pembunuhan, tapi GC berputar di swap
   *     dan fase itu berjalan >1 jam tanpa selesai (terukur, 2026-07-27).
   *
   * Pemeriksaannya sendiri tidak hilang, hanya pindah ke tempat yang mampu
   * menjalankannya: `bun run typecheck` (tsc --noEmit dengan batas heap yang
   * sama) selesai dalam hitungan menit di host. Dokumentasi Next memang
   * mensyaratkan itu — "be sure you are running type checks as part of your
   * build or deploy process" — jadi gerbangnya sekarang eksplisit sebagai
   * `bun run verify` (typecheck + lint + test) dan WAJIB hijau sebelum deploy.
   *
   * Beban tipe melonjak sejak fondasi i18n: kunci kamus adalah dot-path
   * bertipe, sehingga TypeScript mengevaluasi union berisi ~2.400 literal
   * string. Kalau suatu saat mesinnya naik kelas (atau kamusnya dipecah),
   * setelan ini layak ditinjau ulang.
   */
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * `@ant-design/icons` TIDAK BOLEH diimpor lewat barrel-nya di lapisan RSC.
   * Baris ini yang membuat `next build` bisa selesai — jangan hapus tanpa
   * membaca alasannya, dan jangan menukarnya dengan `optimizePackageImports`.
   *
   * Barrel paket itu (`es/index.js`, dan padanan CJS-nya `lib/index.js` yang
   * dipakai lewat kondisi `node`) baris pertamanya memuat
   * `./components/Context`, dan `components/Context.js` memanggil
   * `createContext` DI TINGKAT MODUL tanpa `"use client"`. Build React untuk
   * server component tidak mengekspor `createContext` sama sekali (bandingkan
   * `react/react.react-server.js`: ada `forwardRef`, `memo`, `use`, `cache` —
   * tidak ada `createContext`). Jadi begitu satu server component menyentuh
   * barrel itu, modulnya dievaluasi di lapisan RSC dan mati sebagai
   * `TypeError: (0 , a.r(...).createContext) is not a function` — yang muncul
   * sebagai "Failed to collect page data for /setup-required", halaman pertama
   * yang kebetulan dikumpulkan, bukan halaman yang bersalah.
   *
   * Berkas ikonnya SENDIRI aman di server: `es/icons/PlusOutlined.js` hanya
   * memakai `React.createElement` + `React.forwardRef`, dan komponen dasarnya
   * (`components/AntdIconLight.js`) sudah memikul `"use client"` dari
   * paketnya — jadi ia berhenti sebagai DAUN client persis seperti primitif
   * kita sendiri. Yang beracun hanya barrel-nya. `modularizeImports` menulis
   * ulang setiap `import { PlusOutlined } from "@ant-design/icons"` menjadi
   * `import PlusOutlined from "@ant-design/icons/PlusOutlined"` (peta
   * `exports` paket: `"./*"` → `./es/icons/*.js`), sehingga barrel itu tidak
   * pernah dimuat oleh siapa pun.
   *
   * Yang sudah dicoba dan TIDAK menyembuhkan: `optimizePackageImports:
   * ["@ant-design/icons"]`. Optimasi itu hanya berlaku untuk berkas yang
   * SELURUH ekspornya adalah re-ekspor; begitu ada satu deklarasi lain, ia
   * menyerah dan mengembalikan `export * from "<barrel>"` (baca komentar
   * `build/webpack/loaders/next-barrel-loader.js`, bagian "Non-Barrel Files").
   * Barrel ikon ini punya dua-duanya sekaligus — `import Context from
   * "./components/Context"` dan `export const IconProvider = Context.Provider`
   * — jadi ia memang tidak memenuhi syarat, dan barrel-nya tetap dimuat utuh.
   * `modularizeImports` tidak menganalisis apa pun: transform sintaksis murni
   * di SWC, jadi bentuk barrel tidak relevan baginya. Terukur 2026-08-06:
   * tanpa baris ini build gagal di `/setup-required`, dengan baris ini build
   * hijau, tanpa satu pun perubahan lain.
   *
   * KONSEKUENSINYA di sisi kode: transform ini hanya mengenali impor BERNAMA.
   * `import Icon from "@ant-design/icons"` atau `import * as Icons from …`
   * lolos begitu saja dan mengembalikan bug ini diam-diam. Penjaganya ada di
   * `tests/icon-rsc-boundary.test.ts`: ia menolak kedua bentuk itu, dan
   * sekaligus memastikan setiap nama yang diimpor benar-benar punya berkas
   * `es/icons/<Nama>.js` untuk didarati transform.
   */
  modularizeImports: {
    "@ant-design/icons": { transform: "@ant-design/icons/{{member}}" },
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@tanstack/react-table",
      "date-fns",
    ],
  },
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  /**
   * `/harga` → `/pricing`. Alamat halaman harga publik kini `/pricing`;
   * `/harga` adalah alamat LAMANYA (#399/#413) dan sudah terlanjur dibagikan
   * serta terindeks, jadi ia tidak boleh menjadi 404. Pengalihan PERMANEN,
   * bukan rewrite: kanonik tetap SATU alamat (`alternates.canonical:
   * "/pricing"`, `sitemap.ts`), sehingga mesin pencari memindahkan peringkat
   * alamat lama ke alamat baru alih-alih melihat dua halaman berisi sama.
   * Redirect di sini dievaluasi SEBELUM sistem berkas dan sebelum `proxy.ts`,
   * jadi `/harga` tidak perlu masuk `isPublicPath`.
   */
  async redirects() {
    return [{ source: "/harga", destination: "/pricing", permanent: true }];
  },
};

export default nextConfig;
