/**
 * SETIAP POHON MIGRATION MASUK KE IMAGE.
 *
 * `.dockerignore` menyaring `**\/*.sql` (dump produksi tidak boleh terbangun ke
 * image) lalu mengecualikan pohon migration satu per satu. Pohon yang lupa
 * dikecualikan masuk ke image sebagai direktori KOSONG, dan `migrate deploy`
 * berhenti dengan P3015 — hanya saat menggelar, tidak pernah di `verify` atau
 * `bun run build`. Itu terjadi dua kali: pohon kendali/platform (#151), lalu
 * `prisma/postgresql` (gelar 17 Okt 2026).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Direktori yang anak langsungnya berisi `<nama>/migration.sql`. */
function pohonMigration(dir: string): string[] {
  const entri = readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((e) => e.isDirectory());
  const punya = entri.some((e) => existsSync(join(ROOT, dir, e.name, "migration.sql")));
  return [...(punya ? [dir] : []), ...entri.flatMap((e) => pohonMigration(`${dir}/${e.name}`))];
}

describe(".dockerignore tidak membuang SQL migration", () => {
  const baris = readFileSync(join(ROOT, ".dockerignore"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const pengecualian = baris.filter((l) => l.startsWith("!") && l.endsWith("/**/*.sql")).map((l) => l.slice(1, -"/**/*.sql".length));
  const saringSql = baris.lastIndexOf("**/*.sql");

  it("pola penyaring `.sql` masih ada (kalau hilang, tes ini kehilangan maknanya)", () => {
    expect(saringSql).toBeGreaterThanOrEqual(0);
  });

  const pohon = pohonMigration("prisma");
  it("menemukan pohon migration PostgreSQL yang diterapkan", () => {
    expect(pohon).toEqual(expect.arrayContaining(["prisma/postgresql/company", "prisma/postgresql/control", "prisma/postgresql/platform"]));
  });

  it.each(pohon)("%s dikecualikan SESUDAH `**/*.sql`", (p) => {
    const cocok = pengecualian.find((e) => p === e || p.startsWith(`${e}/`));
    expect(cocok, `tambahkan \`!${p}/**/*.sql\` ke .dockerignore`).toBeDefined();
    expect(baris.indexOf(`!${cocok}/**/*.sql`)).toBeGreaterThan(saringSql);
  });
});
