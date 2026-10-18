/**
 * MODUL YANG PINDAH KE PAKET WORKSPACE (monorepo Fase 2) HANYA DIIMPOR LEWAT
 * PAKETNYA.
 *
 *   2a (18 Okt 2026) — fondasi ke `@sai/core`: authz, constants, control-db,
 *       money-format, utils.
 *   2b — i18n inti ke `@sai/core/i18n/*`. `server.ts`, `actions.ts`,
 *       `labels.ts` TETAP di `src/lib/i18n` (bergantung pada modul aplikasi).
 *   2c — primitif desain ke `@sai/ui`: `components/ui/*` (kecuali enam yang
 *       bergantung pada server action / konteks perusahaan / domain), tema,
 *       skala jarak, lambang; `labels` & `tenant-routes` ke `@sai/core`.
 *
 * Salinan yang tertinggal di jalur lama — atau yang dibuat ulang karena
 * seseorang mengira modulnya hilang — lolos `tsc` dan diam-diam menjadi sumber
 * kebenaran KEDUA: matriks izin atau token warna yang berbeda di dua tempat.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = process.cwd();

/** [jalur lama, jalur baru] relatif akar repo. */
const PINDAH: ReadonlyArray<readonly [string, string]> = [
  ["src/components/ui/alert-dialog.tsx", "packages/ui/src/components/alert-dialog.tsx"],
  ["src/components/ui/app-link.tsx", "packages/ui/src/components/app-link.tsx"],
  ["src/components/ui/badge.tsx", "packages/ui/src/components/badge.tsx"],
  ["src/components/ui/brand-lockup.tsx", "packages/ui/src/components/brand-lockup.tsx"],
  ["src/components/ui/brand-mark.tsx", "packages/ui/src/components/brand-mark.tsx"],
  ["src/components/ui/button.tsx", "packages/ui/src/components/button.tsx"],
  ["src/components/ui/card.tsx", "packages/ui/src/components/card.tsx"],
  ["src/components/ui/checkbox.tsx", "packages/ui/src/components/checkbox.tsx"],
  ["src/components/ui/command.tsx", "packages/ui/src/components/command.tsx"],
  ["src/components/ui/data-table.tsx", "packages/ui/src/components/data-table.tsx"],
  ["src/components/ui/dialog.tsx", "packages/ui/src/components/dialog.tsx"],
  ["src/components/ui/empty-state.tsx", "packages/ui/src/components/empty-state.tsx"],
  ["src/components/ui/form.tsx", "packages/ui/src/components/form.tsx"],
  ["src/components/ui/input.tsx", "packages/ui/src/components/input.tsx"],
  ["src/components/ui/item-name-input.tsx", "packages/ui/src/components/item-name-input.tsx"],
  ["src/components/ui/label.tsx", "packages/ui/src/components/label.tsx"],
  ["src/components/ui/learn-more.tsx", "packages/ui/src/components/learn-more.tsx"],
  ["src/components/ui/loading.tsx", "packages/ui/src/components/loading.tsx"],
  ["src/components/ui/money-column.tsx", "packages/ui/src/components/money-column.tsx"],
  ["src/components/ui/money-input-format.ts", "packages/ui/src/components/money-input-format.ts"],
  ["src/components/ui/money-input.tsx", "packages/ui/src/components/money-input.tsx"],
  ["src/components/ui/money.tsx", "packages/ui/src/components/money.tsx"],
  ["src/components/ui/page-header.tsx", "packages/ui/src/components/page-header.tsx"],
  ["src/components/ui/pagination.tsx", "packages/ui/src/components/pagination.tsx"],
  ["src/components/ui/password-input.tsx", "packages/ui/src/components/password-input.tsx"],
  ["src/components/ui/popover.tsx", "packages/ui/src/components/popover.tsx"],
  ["src/components/ui/progress.tsx", "packages/ui/src/components/progress.tsx"],
  ["src/components/ui/quota-meter.tsx", "packages/ui/src/components/quota-meter.tsx"],
  ["src/components/ui/searchable-select.tsx", "packages/ui/src/components/searchable-select.tsx"],
  ["src/components/ui/select.tsx", "packages/ui/src/components/select.tsx"],
  ["src/components/ui/stat-card.tsx", "packages/ui/src/components/stat-card.tsx"],
  ["src/components/ui/stat-tile.ts", "packages/ui/src/components/stat-tile.ts"],
  ["src/components/ui/static-table.tsx", "packages/ui/src/components/static-table.tsx"],
  ["src/components/ui/table-columns.tsx", "packages/ui/src/components/table-columns.tsx"],
  ["src/components/ui/table.tsx", "packages/ui/src/components/table.tsx"],
  ["src/components/ui/term-tooltip.tsx", "packages/ui/src/components/term-tooltip.tsx"],
  ["src/components/ui/textarea.tsx", "packages/ui/src/components/textarea.tsx"],
  ["src/components/ui/toast.tsx", "packages/ui/src/components/toast.tsx"],
  ["src/components/ui/wizard-steps.tsx", "packages/ui/src/components/wizard-steps.tsx"],
  ["src/lib/authz.ts", "packages/core/src/authz.ts"],
  ["src/lib/brand/mark.ts", "packages/ui/src/brand/mark.ts"],
  ["src/lib/constants.ts", "packages/core/src/constants.ts"],
  ["src/lib/control-db.ts", "packages/core/src/control-db.ts"],
  ["src/lib/i18n/client.tsx", "packages/core/src/i18n/client.tsx"],
  ["src/lib/i18n/config.ts", "packages/core/src/i18n/config.ts"],
  ["src/lib/i18n/dictionaries/en.json", "packages/core/src/i18n/dictionaries/en.json"],
  ["src/lib/i18n/dictionaries/id.json", "packages/core/src/i18n/dictionaries/id.json"],
  ["src/lib/i18n/dictionaries/zh.json", "packages/core/src/i18n/dictionaries/zh.json"],
  ["src/lib/i18n/dictionary.ts", "packages/core/src/i18n/dictionary.ts"],
  ["src/lib/i18n/load.ts", "packages/core/src/i18n/load.ts"],
  ["src/lib/i18n/locale-cookie.ts", "packages/core/src/i18n/locale-cookie.ts"],
  ["src/lib/i18n/validation.ts", "packages/core/src/i18n/validation.ts"],
  ["src/lib/icons.ts", "packages/ui/src/icons.ts"],
  ["src/lib/labels.ts", "packages/core/src/labels.ts"],
  ["src/lib/layout-scale.ts", "packages/ui/src/layout-scale.ts"],
  ["src/lib/money-format.ts", "packages/core/src/money-format.ts"],
  ["src/lib/table-sort.ts", "packages/ui/src/table-sort.ts"],
  ["src/lib/tenant-routes.ts", "packages/core/src/tenant-routes.ts"],
  ["src/lib/theme/antd-tokens.ts", "packages/ui/src/theme/antd-tokens.ts"],
  ["src/lib/theme/config.ts", "packages/ui/src/theme/config.ts"],
  ["src/lib/theme/tone-recipe.ts", "packages/ui/src/theme/tone-recipe.ts"],
  ["src/lib/utils.ts", "packages/core/src/utils.ts"],
];

const tanpaEkstensi = (p: string) => p.replace(/\.(tsx?|js)$/, "");
const LAMA = new Set(PINDAH.map(([lama]) => tanpaEkstensi(lama)));

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  for (const e of readdirSync(join(AKAR, dir), { withFileTypes: true })) {
    const anak = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      keluar.push(...berkasTs(anak));
    } else if (/\.(ts|tsx|mts)$/.test(e.name)) {
      keluar.push(anak);
    }
  }
  return keluar;
}

const IMPOR = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:do)?[mM]ock\(\s*)["']([^"']+)["']/g;

describe("modul pindahan monorepo Fase 2", () => {
  const berkas = ["src", "scripts", "tests", "prisma", "packages"].flatMap(berkasTs);

  it.each(PINDAH)("%s → %s", (lama, baru) => {
    expect(existsSync(join(AKAR, baru)), baru).toBe(true);
    expect(existsSync(join(AKAR, lama)), lama).toBe(false);
    for (const ext of [".ts", ".tsx"]) expect(existsSync(join(AKAR, tanpaEkstensi(lama) + ext))).toBe(false);
  });

  it("ada pengimpor paket untuk diperiksa — penjaga atas tes ini sendiri", () => {
    const pemakai = berkas.filter((f) => /["']@sai\/(core|ui)\//.test(readFileSync(join(AKAR, f), "utf8")));
    expect(pemakai.length).toBeGreaterThan(400);
  });

  it("nol impor ke jalur lama (`@/…` atau relatif)", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      for (const m of readFileSync(join(AKAR, f), "utf8").matchAll(IMPOR)) {
        const spec = m[1];
        let tuju: string | null = null;
        if (spec.startsWith("@/")) tuju = `src/${spec.slice(2)}`;
        else if (spec.startsWith(".")) tuju = join(f, "..", spec);
        if (tuju && LAMA.has(tanpaEkstensi(tuju))) pelanggar.push(`${f} → ${spec}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });
});
