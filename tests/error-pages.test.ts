/**
 * HALAMAN GALAT & 404 DI KEDUA APLIKASI (18 Okt 2026).
 *
 * Sebelumnya hanya dua batas galat yang ada (dasbor & `/platform`); halaman
 * masuk, dokumentasi, wisaya, pemasaran, dan seluruh konsol yang gagal render
 * melompat ke layar bawaan Next — polos, berbahasa Inggris, tanpa jalan
 * kembali — dan alamat yang salah ketik mendapat 404 bawaan yang sama.
 *
 * Yang dijaga di sini adalah KEBERADAAN dan BENTUKNYA, karena keduanya gagal
 * tanpa bunyi: berkas yang terhapus tidak memerahkan build, dan layar galat yang
 * menyalin tata letaknya sendiri menyimpang dari kembarannya (persis yang
 * terjadi pada dua salinan sebelumnya).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = process.cwd();
const baca = (p: string) => readFileSync(join(AKAR, p), "utf8");
/** Kode tanpa komentar — kepala berkas MENJELASKAN `reset()`/`RootDocument`, dan penjelasan bukan pemakaian. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Batas galat route-level: [berkas, rute pulangnya]. */
const BATAS_GALAT: [string, string][] = [
  ["src/app/(app)/error.tsx", "/dashboard"],
  ["src/app/(app)/(dashboard)/error.tsx", "/dashboard"],
  ["src/app/(app)/(tenant)/(panel)/platform/error.tsx", "/platform"],
  ["src/app/(marketing)/error.tsx", "/"],
  ["apps/operator/src/app/(operator)/error.tsx", "/"],
];
const GALAT_GLOBAL = ["src/app/global-error.tsx", "apps/operator/src/app/global-error.tsx"];
const TIDAK_DITEMUKAN = [
  "src/app/(app)/not-found.tsx",
  "src/app/(marketing)/not-found.tsx",
  "src/app/global-not-found.tsx",
  "apps/operator/src/app/not-found.tsx",
];

describe("halaman galat & 404", () => {
  it.each([...BATAS_GALAT.map(([f]) => f), ...GALAT_GLOBAL, ...TIDAK_DITEMUKAN])("%s ada", (f) => {
    expect(existsSync(join(AKAR, f))).toBe(true);
  });

  it.each(BATAS_GALAT)("%s: client, StatusScreen, `unstable_retry`, pulang ke %s", (f, pulang) => {
    const src = baca(f);
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@sai/ui/status-screen"');
    /* `reset()` merender ulang TANPA mengambil ulang data — galat dari server
       component tidak pernah pulih lewatnya. */
    expect(src).toContain("unstable_retry");
    expect(kode(f)).not.toMatch(/\breset\(\)/);
    expect(src).toContain(`href: "${pulang}"`);
  });

  it.each(GALAT_GLOBAL)("%s memakai GlobalErrorDocument (tanpa provider, <html> sendiri)", (f) => {
    const src = baca(f);
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@sai/ui/global-error-document"');
    expect(src).toContain("unstable_retry");
  });

  it("GlobalErrorDocument TIDAK bergantung pada provider yang mungkin barusan meledak", () => {
    const src = kode("packages/ui/src/components/global-error-document.tsx");
    expect(src).toContain("<html");
    for (const p of ["RootDocument", "AntdProvider", "ThemeProvider", "LocaleProvider", "useT("]) {
      expect(src, p).not.toContain(p);
    }
  });

  it.each(TIDAK_DITEMUKAN)("%s: StatusScreen ber-`kind=\"notFound\"`, teks dari server", (f) => {
    const src = baca(f);
    expect(src).toContain('from "@sai/ui/status-screen"');
    expect(src).toContain('kind="notFound"');
    expect(src).toContain("getT()");
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("aplikasi pelanggan (dua root layout) menyalakan `globalNotFound`; konsol (satu root) tidak butuh", () => {
    expect(baca("next.config.ts")).toMatch(/globalNotFound:\s*true/);
    expect(existsSync(join(AKAR, "src/app/layout.tsx"))).toBe(false);
    expect(existsSync(join(AKAR, "apps/operator/src/app/layout.tsx"))).toBe(true);
  });

  it("tidak ada layar galat yang menyalin tata letaknya sendiri", () => {
    /* Penanda tata letak lama: lingkaran ikon 48px. Hanya StatusScreen yang boleh memilikinya. */
    for (const f of [...BATAS_GALAT.map(([x]) => x), ...GALAT_GLOBAL, ...TIDAK_DITEMUKAN]) {
      expect(baca(f), f).not.toMatch(/width:\s*48/);
    }
  });
});
