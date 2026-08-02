import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Penjaga token warna (issue #54). Menolak kelas palet Tailwind mentah
 * (`bg-blue-600`, `text-gray-500`, `border-red-200`, …) di literal string mana
 * pun — pakai token semantik (`bg-primary`, `text-muted-foreground`,
 * `border-destructive`). Tanpa ini, kelas mentah merayap kembali lewat PR
 * berikutnya dan dark mode / rebranding kembali jadi pekerjaan ratusan file.
 *
 * Cakupan mencakup palet ber-angka (mis. `blue-600`) DAN `white`/`black`
 * telanjang: keduanya tidak mengikuti tema. `--card` sudah punya varian gelap,
 * jadi `bg-white` tetap putih saat mode gelap sementara sekelilingnya menggelap
 * (top bar pernah begini). Pakai token: `bg-card`/`bg-background` untuk
 * permukaan, `text-primary-foreground` untuk teks di atas `bg-primary`,
 * `bg-sidebar`/`text-sidebar-foreground` untuk permukaan gelap permanen. Untuk
 * scrim overlay yang memang harus hitam (mis. `bg-black/50`), matikan setempat
 * dengan `// eslint-disable-next-line no-restricted-syntax` beserta alasannya.
 */
const RAW_PALETTE =
  "(bg|text|border|ring|ring-offset|divide|from|to|via|placeholder|fill|stroke|outline|decoration|accent|caret|shadow)-((blue|gray|red|green|yellow|amber|slate|emerald|rose|sky|indigo|zinc|neutral|stone)-[0-9]|(white|black)\\b)";

const rawPaletteMessage =
  "Kelas palet Tailwind mentah dilarang (issue #54). Pakai token semantik: " +
  "biru→primary, merah→destructive, hijau→success, amber/kuning→warning, " +
  "abu→foreground/muted-foreground/muted/border, putih/hitam→card/background/" +
  "primary-foreground/sidebar. Lihat design-system/sai-accounting/MASTER.md.";

const noRawPalette = {
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // Literal string apa pun yang memuat kelas palet mentah.
        selector: `Literal[value=/(^|\\s)${RAW_PALETTE}/]`,
        message: rawPaletteMessage,
      },
      {
        // Bagian statis dari template literal (mis. cn(`... bg-gray-100`)).
        selector: `TemplateElement[value.raw=/(^|\\s)${RAW_PALETTE}/]`,
        message: rawPaletteMessage,
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  noRawPalette,
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
