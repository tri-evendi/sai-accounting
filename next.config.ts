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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
   * menjalankannya: `npm run typecheck` (tsc --noEmit dengan batas heap yang
   * sama) selesai dalam hitungan menit di host. Dokumentasi Next memang
   * mensyaratkan itu — "be sure you are running type checks as part of your
   * build or deploy process" — jadi gerbangnya sekarang eksplisit sebagai
   * `npm run verify` (typecheck + lint + test) dan WAJIB hijau sebelum deploy.
   *
   * Beban tipe melonjak sejak fondasi i18n: kunci kamus adalah dot-path
   * bertipe, sehingga TypeScript mengevaluasi union berisi ~2.400 literal
   * string. Kalau suatu saat mesinnya naik kelas (atau kamusnya dipecah),
   * setelan ini layak ditinjau ulang.
   */
  typescript: {
    ignoreBuildErrors: true,
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
};

export default nextConfig;
