import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
describe("penjaga #565 benar-benar terpasang di jalur tulis", () => {
  it("closeYear menolak tahun yang belum berakhir SEBELUM menulis apa pun", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "year-close-service.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const close = src.slice(src.indexOf("export async function closeYear"));
    const guard = close.indexOf("FiscalYearNotEndedError");
    const write = close.indexOf("postJournal");
    expect(guard, "penjaga tidak ada di closeYear").toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
  });
});
