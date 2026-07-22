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
 * Cakupan warna sengaja dibatasi ke palet yang PUNYA padanan token; `white`/
 * `black` (tanpa angka) tidak ditolak. Bila suatu kasus sah butuh warna mentah
 * (mis. brand pihak ketiga), matikan setempat dengan
 * `// eslint-disable-next-line no-restricted-syntax` beserta alasannya.
 */
const RAW_PALETTE =
  "(bg|text|border|ring|ring-offset|divide|from|to|via|placeholder|fill|stroke|outline|decoration|accent|caret|shadow)-(blue|gray|red|green|yellow|amber|slate|emerald|rose|sky|indigo|zinc|neutral|stone)-[0-9]";

const rawPaletteMessage =
  "Kelas palet Tailwind mentah dilarang (issue #54). Pakai token semantik: " +
  "biru→primary, merah→destructive, hijau→success, amber/kuning→warning, " +
  "abu→foreground/muted-foreground/muted/border. Lihat design-system/sai-accounting/MASTER.md.";

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
    // Agent tooling scripts, not application source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
