import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MIGRATION_TERAKHIR } from "@/lib/migration-manifest";

describe("manifes migration = direktori migration terakhir", () => {
  it.each(Object.entries(MIGRATION_TERAKHIR))("%s", (jenis, terakhir) => {
    const dirs = readdirSync(join(process.cwd(), "prisma/postgresql", jenis), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory() && /^\d{4}_/.test(d.name))
      .map((d) => d.name)
      .sort();
    expect(dirs.length).toBeGreaterThan(0);
    expect(
      terakhir,
      `Migration baru di prisma/postgresql/${jenis}/ — perbarui src/lib/migration-manifest.ts`
    ).toBe(dirs.at(-1));
  });
});
