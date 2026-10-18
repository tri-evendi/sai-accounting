/**
 * MODUL YANG PINDAH KE `@sai/core` (monorepo Fase 2a, 18 Okt 2026) HANYA
 * DIIMPOR LEWAT PAKETNYA.
 *
 * Salinan yang tertinggal di `src/lib/` — atau yang dibuat ulang karena
 * seseorang mengira modulnya hilang — akan lolos `tsc` dan diam-diam menjadi
 * sumber kebenaran KEDUA: matriks izin yang berbeda di dua tempat adalah
 * persis kegagalan yang `docs/RBAC.md` larang.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = process.cwd();
const PINDAH = ["authz", "constants", "control-db", "money-format", "utils"] as const;

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

describe("@sai/core", () => {
  const berkas = ["src", "scripts", "tests", "prisma", "packages"].flatMap(berkasTs);

  it.each(PINDAH)("%s hidup di packages/core, tidak di src/lib", (m) => {
    expect(existsSync(join(AKAR, `packages/core/src/${m}.ts`))).toBe(true);
    expect(existsSync(join(AKAR, `src/lib/${m}.ts`))).toBe(false);
    expect(existsSync(join(AKAR, `src/lib/${m}.tsx`))).toBe(false);
  });

  it("ada pengimpor untuk diperiksa — penjaga atas tes ini sendiri", () => {
    const pemakai = berkas.filter((f) => readFileSync(join(AKAR, f), "utf8").includes("@sai/core/"));
    expect(pemakai.length).toBeGreaterThan(200);
  });

  it("nol impor ke jalur lamanya (`@/lib/<m>` atau relatif ke `src/lib/<m>`)", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      for (const m of readFileSync(join(AKAR, f), "utf8").matchAll(IMPOR)) {
        const spec = m[1];
        const tuju = spec.startsWith(".") ? join(f, "..", spec).replace(/\.(js|ts|tsx)$/, "") : spec;
        for (const p of PINDAH) {
          if (tuju === `@/lib/${p}` || tuju === `src/lib/${p}`) pelanggar.push(`${f} → ${spec}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });
});
