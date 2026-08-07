import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import warnaTokenAntd from "./eslint-rules/warna-token-antd.mjs";

/*
 * ── `RAW_PALETTE` (dicabut #203) → `sai/warna-token-antd` (#204) ───────────
 *
 * Aturan lama menolak kelas palet Tailwind mentah (`bg-blue-600`,
 * `text-gray-500`, `border-l-red-500`, `bg-white`) di literal string mana pun.
 * Ia dicabut bersama Tailwind: kelas yang dijaganya sudah tidak dikompilasi
 * siapa pun, jadi ia tidak akan pernah menangkap apa pun lagi. JANGAN
 * menghidupkannya kembali.
 *
 * Penggantinya menjaga kosakata yang menggantikan kelas itu — nilai warna
 * MENTAH di dalam `style` sebaris — dan alasan lengkapnya ada di kepala
 * `eslint-rules/warna-token-antd.mjs`. Termasuk pelajaran yang melahirkannya:
 * `RAW_PALETTE` tidak mengenal `border-l-`, dan satu kelas mentah karena itu
 * lolos berbulan-bulan di beranda.
 */

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    /*
     * Dua berkas yang MEMANG menulis nilai warna, dan hanya dua:
     *
     *  • `antd-tokens.ts` — sumber kebenarannya. Setiap hex di aplikasi ini
     *    berdiri di sana beserta rasio kontras terhitungnya, dan angka itu
     *    dihitung ulang dari paket `antd` yang terpasang setiap kali suite
     *    berjalan (`tests/antd-tokens.test.ts`).
     *  • `lib/pdf/brand.ts` — warna DOKUMEN CETAK. Kertas tidak punya tema
     *    gelap dan tidak melihat satu pun variabel CSS; nilainya juga sudah
     *    ditulis sebagai triplet RGB, bukan string.
     *
     * `src/generated/**` adalah keluaran `prisma generate`, bukan kode kita.
     */
    ignores: [
      "src/generated/**",
      "src/lib/theme/antd-tokens.ts",
      "src/lib/pdf/brand.ts",
    ],
    plugins: { sai: { rules: { "warna-token-antd": warnaTokenAntd } } },
    rules: { "sai/warna-token-antd": "error" },
  },
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
