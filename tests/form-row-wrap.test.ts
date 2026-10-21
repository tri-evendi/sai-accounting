/**
 * Baris formulir mendatar (`<Flex component="form">` tanpa `vertical`) WAJIB
 * `wrap`.
 *
 * Sapuan visual 21 Okt 2026, Chromium 375px: filter "Per Tanggal" di Neraca
 * tanpa `wrap` — isian tanggal terjepit ~48px, labelnya pecah dua baris, dan
 * tombol Tampilkan terpotong di tepi layar. Saudaranya di berkas yang sama
 * (filter periode) sudah `wrap`; yang satu ini tertinggal tanpa satu galat pun.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { akarSumber, relSumber } from "./akar-sumber";

function tsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "generated" ? [] : tsx(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

const berkas = akarSumber().flatMap(tsx);

describe("baris formulir mendatar membungkus", () => {
  it("pemindainya menemukan formulir Flex (daftar kosong = lulus diam-diam)", () => {
    const ada = berkas.filter((f) => /<Flex\b[^>]*component="form"/.test(readFileSync(f, "utf8")));
    expect(ada.length).toBeGreaterThan(2);
  });

  it("tidak ada <Flex component=\"form\"> mendatar tanpa wrap", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      const kode = readFileSync(f, "utf8");
      for (const m of kode.matchAll(/<Flex\b([^>]*?)>/g)) {
        const attrs = m[1];
        if (!attrs.includes('component="form"')) continue;
        if (/\bvertical\b/.test(attrs) || /\bwrap\b/.test(attrs)) continue;
        pelanggar.push(`${relSumber(f)}:${kode.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(pelanggar, "tambahkan `wrap` — di 375px baris ini menggulung halaman").toEqual([]);
  });
});
