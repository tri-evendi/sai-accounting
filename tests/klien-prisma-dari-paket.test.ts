/**
 * KLIEN PRISMA HANYA LEWAT `@sai/db/client/*` (monorepo Fase 1b, 17 Okt 2026).
 *
 * Skema dan klien hasil bangkitan pindah dari `prisma/` + `src/generated/` ke
 * `packages/db`. Jalur lama tidak gagal dengan sopan: `src/generated/` yang
 * tersisa di checkout lama (ia gitignored) membuat `@/generated/...` tetap
 * lolos `tsc` di mesin itu, lalu patah di CI dan di image yang mulai dari nol.
 * Dan skema yang muncul lagi di `prisma/schema.prisma` akan diam-diam diabaikan
 * — ketiga `prisma*.config.ts` menunjuk ke `packages/db/prisma/`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = process.cwd();

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

const JALUR_LAMA = /["'](?:@\/generated\/|(?:\.\.?\/)+(?:src\/)?generated\/(?:prisma|control|platform))[^"']*["']/;
const SKEMA = ["company", "control", "platform"] as const;

describe("klien Prisma dari paket @sai/db", () => {
  const berkas = [...berkasTs("src"), ...berkasTs("scripts"), ...berkasTs("tests"), ...berkasTs("prisma")].filter(
    (f) => f !== "tests/klien-prisma-dari-paket.test.ts"
  );

  it("ada pengimpor untuk diperiksa — penjaga atas tes ini sendiri", () => {
    const pemakai = berkas.filter((f) => readFileSync(join(AKAR, f), "utf8").includes("@sai/db/client/"));
    expect(pemakai.length).toBeGreaterThan(50);
  });

  it("nol impor lewat `@/generated/…` atau `…/src/generated/…`", () => {
    const pelanggar = berkas.filter((f) => JALUR_LAMA.test(readFileSync(join(AKAR, f), "utf8")));
    expect(pelanggar).toEqual([]);
  });

  it.each(SKEMA)("skema %s ada di packages/db, dan configs menunjuknya", (s) => {
    expect(existsSync(join(AKAR, `packages/db/prisma/${s}/schema.prisma`))).toBe(true);
    const skema = readFileSync(join(AKAR, `packages/db/prisma/${s}/schema.prisma`), "utf8");
    expect(skema).toContain(`output   = "../../generated/${s}"`);
    const config = s === "company" ? "prisma.config.ts" : `prisma.${s}.config.ts`;
    expect(readFileSync(join(AKAR, config), "utf8")).toContain(`schema: "packages/db/prisma/${s}/schema.prisma"`);
  });

  it("tidak ada skema yatim di jalur lama", () => {
    for (const p of ["prisma/schema.prisma", "prisma/control/schema.prisma", "prisma/platform/schema.prisma"]) {
      expect(existsSync(join(AKAR, p)), p).toBe(false);
    }
  });

  it("subpath klien diekspor manifes paket", () => {
    const { exports } = JSON.parse(readFileSync(join(AKAR, "packages/db/package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    for (const s of SKEMA) expect(exports[`./client/${s}`]).toBe(`./generated/${s}/client.ts`);
  });
});
