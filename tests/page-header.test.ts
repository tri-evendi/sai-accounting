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

const DASHBOARD_DIR = join(__dirname, "..", "src", "app", "(dashboard)");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("konvensi PageHeader di halaman dashboard", () => {
  const files = tsxFiles(DASHBOARD_DIR);

  it("menemukan halaman dashboard untuk diperiksa", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("tidak ada <h1> manual — judul halaman lewat PageHeader", () => {
    const offenders = files.filter((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(DASHBOARD_DIR.length + 1))).toEqual([]);
  });

  it("tidak ada <Breadcrumb> manual — jejak lokasi lewat prop breadcrumbs", () => {
    const offenders = files.filter((f) => /<Breadcrumb[\s/>]/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(DASHBOARD_DIR.length + 1))).toEqual([]);
  });
});
