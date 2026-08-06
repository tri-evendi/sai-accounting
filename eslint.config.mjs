import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * ── Penjaga `RAW_PALETTE` DICABUT di issue #203 ────────────────────────────
 *
 * Aturan itu menolak kelas palet Tailwind mentah (`bg-blue-600`,
 * `text-gray-500`, `border-l-red-500`, `bg-white`) di literal string mana pun,
 * dan ia berguna selama tiga tahun karena kelas semantik (`bg-primary`,
 * `text-muted-foreground`) adalah cara aplikasi ini mewarnai dirinya.
 *
 * Sejak #203 tidak ada satu pun dari keduanya: Tailwind, `globals.css`, dan
 * seluruh token semantiknya dicabut, dan `src/` tidak menyisakan satu pun
 * kelas gaya. Sebuah penjaga yang menjaga kosakata yang tak lagi bisa ditulis
 * bukan penjaga — ia hanya membuat orang berikutnya percaya bahwa warna masih
 * dijaga di sini, padahal yang perlu dijaga sekarang adalah hal yang berbeda:
 * nilai warna MENTAH (hex, `rgb()`) di dalam `style` sebaris, alih-alih
 * `var(--ant-…)` atau token `theme.useToken()`.
 *
 * Penjaga baru itu adalah issue #204 dan sengaja TIDAK dirakit di sini:
 * membuatnya berarti memutuskan apa yang boleh dikecualikan (permukaan gelap
 * permanen `#001529`, dua nilai `html.dark` di `globals.css`, tangga palet di
 * `lib/theme/antd-tokens.ts` yang justru SUMBER kebenarannya), dan keputusan
 * itu terlalu lebar untuk diselipkan ke dalam PR pencabutan.
 *
 * Jangan menghidupkan kembali aturan lama di sini: kelasnya sudah tidak
 * dikompilasi siapa pun, jadi ia tidak akan pernah menangkap apa pun.
 */

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Keluaran package-standalone.sh (#159 temuan 5) — hasil build, bukan
    // sumber. Tanpa ini `bun run lint` tenggelam dalam ±950 galat bundel
    // ter-minify dan gerbang lint kehilangan artinya.
    "dist/**",
    // Agent tooling scripts, not application source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
