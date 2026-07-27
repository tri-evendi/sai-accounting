/**
 * Kepala halaman seragam — penjaga konvensi "Kepala Halaman & Breadcrumb"
 * di design-system/sai-accounting/MASTER.md.
 *
 * Aturan yang dijaga: semua halaman dashboard memakai `PageHeader`
 * (`src/components/ui/page-header.tsx`), tidak menulis `<h1>` atau memanggil
 * `<Breadcrumb>` sendiri — supaya judul, jejak lokasi, dan tombol aksi tampil
 * di tempat yang sama di seluruh app, dan halaman baru tidak menyimpang lagi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "..", "src", "app");

/**
 * Grup rute yang halamannya tunduk pada konvensi ini. `(setup)` ikut sejak
 * issue #103 — wizard penyiapan pindah ke grup rutenya sendiri demi kerangka
 * fokus, dan kepala halamannya tetap harus `PageHeader` seperti yang lain.
 */
const PAGE_GROUPS = ["(dashboard)", "(setup)"];

/**
 * File cadangan Next.js (`error`/`loading`/`not-found`/`global-error`) BUKAN
 * halaman dalam arti konvensi ini: mereka dirender di luar pohon halaman normal
 * (mis. `error.tsx` justru muncul saat render halaman gagal) dan tak bisa
 * memakai `PageHeader` yang butuh sesi/konteks. Karena itu dikecualikan dari
 * penjaga — judulnya boleh `<h1>` sendiri.
 */
const RESERVED = new Set(["error.tsx", "loading.tsx", "not-found.tsx", "global-error.tsx"]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") && !RESERVED.has(entry.name) ? [full] : [];
  });
}

describe("konvensi PageHeader di halaman aplikasi", () => {
  const files = PAGE_GROUPS.flatMap((group) => tsxFiles(join(APP_DIR, group)));
  const label = (f: string) => f.slice(APP_DIR.length + 1);

  it("menemukan halaman untuk diperiksa", () => {
    expect(files.length).toBeGreaterThan(50);
    // Penjaga bagi penjaga: grup yang salah tulis membuat telusurnya kosong.
    for (const group of PAGE_GROUPS) {
      expect(files.some((f) => label(f).startsWith(`${group}/`)), group).toBe(true);
    }
  });

  it("tidak ada <h1> manual — judul halaman lewat PageHeader", () => {
    const offenders = files.filter((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")));
    expect(offenders.map(label)).toEqual([]);
  });

  it("tidak ada <Breadcrumb> manual — jejak lokasi lewat prop breadcrumbs", () => {
    const offenders = files.filter((f) => /<Breadcrumb[\s/>]/.test(readFileSync(f, "utf8")));
    expect(offenders.map(label)).toEqual([]);
  });
});
