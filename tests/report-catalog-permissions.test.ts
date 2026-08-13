/**
 * Izin katalog laporan (issue #355) — dan kenapa ia dibaca dari BERKASNYA.
 *
 * Pusat Laporan dulu menawarkan keenam belas kartu kepada semua orang. Untuk
 * perusahaan yang mematikan modul Stok, ketiga kartu "Stok" tetap terpampang
 * lengkap dengan ajakan "Buka laporan" — dan menekannya mendarat di layar
 * modul-tidak-aktif. Sejak #355 katalog menyatakan izinnya sendiri
 * (`ReportDefinition.permission`) dan halamannya menyaring lewat `canEffective`.
 *
 * Medan itu hanya berguna kalau ia JUJUR. Sebuah izin karangan — atau izin yang
 * benar hari ini lalu halamannya diperketat besok — menghasilkan tepat dua
 * kegagalan yang tak satu pun tes lain akan berteriak:
 *
 *   • izin katalog LEBIH LONGGAR dari halamannya → kartunya tampil, lalu
 *     halamannya menolak. Persis penyakit yang #355 obati, kembali lewat pintu
 *     belakang.
 *   • izin katalog LEBIH KETAT dari halamannya → laporan yang sebenarnya boleh
 *     dibuka hilang diam-diam dari Pusat Laporan. Tak ada galat, tak ada jejak;
 *     penggunanya hanya menyimpulkan fiturnya tidak ada.
 *
 * Karena itu tesnya tidak memuat daftar harapan yang ditulis tangan: ia MEMBACA
 * `requirePagePermission(...)` dari halaman `href` masing-masing laporan dan
 * menuntut keduanya sama persis. Daftar tangan akan menjadi salinan ketiga yang
 * ikut basi bersama yang lain.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PERMISSIONS } from "@/lib/authz";
import { REPORTS } from "@/lib/report-catalog";

const APP = join(__dirname, "..", "src", "app", "(dashboard)", "t", "[tenantSlug]", "[companySlug]");

/** Halaman tujuan sebuah `href` katalog ("/reports/cash-flow" → page.tsx-nya). */
function pageFileFor(href: string): string | null {
  const file = join(APP, href.replace(/^\//, ""), "page.tsx");
  return existsSync(file) ? file : null;
}

/** Izin yang BENAR-BENAR dijaga halaman itu, dibaca dari sumbernya. */
function guardedPermissionOf(file: string): string | null {
  const src = readFileSync(file, "utf8");
  return src.match(/requirePagePermission\(\s*"([a-z_.]+)"/)?.[1] ?? null;
}

describe("katalog laporan menyatakan izin yang benar", () => {
  it("setiap laporan punya izin, dan izinnya dikenal matriks", () => {
    const known = new Set<string>(PERMISSIONS as readonly string[]);
    for (const report of REPORTS) {
      expect(report.permission, `laporan "${report.id}" tanpa izin`).toBeTruthy();
      expect(
        known.has(report.permission),
        `laporan "${report.id}" memakai izin "${report.permission}" yang tidak ada di matriks`
      ).toBe(true);
    }
  });

  /*
   * Inti berkas ini. Dua sisi dibaca dari sumbernya masing-masing, lalu
   * disamakan — jadi memperketat sebuah halaman TANPA memperbarui katalognya
   * menjatuhkan tes ini, bukan menghasilkan kartu yang menolak dibuka.
   */
  it("izin katalog sama persis dengan penjaga halaman tujuannya", () => {
    const checked: string[] = [];
    const mismatched: string[] = [];

    for (const report of REPORTS) {
      if (!report.href) continue; // `coming_soon` memang belum punya halaman.
      const file = pageFileFor(report.href);
      if (!file) continue; // href ke luar (mis. hub) — bukan urusan tes ini.
      const guarded = guardedPermissionOf(file);
      if (!guarded) continue;

      checked.push(report.id);
      if (guarded !== report.permission) {
        mismatched.push(
          `${report.id}: katalog "${report.permission}" ≠ penjaga "${guarded}" (${report.href})`
        );
      }
    }

    expect(mismatched).toEqual([]);
    // Jaring pengaman: kalau pola pembacaan di atas rusak (halaman pindah,
    // penjaganya ditulis lain), `checked` akan mengempis dan tes ini lulus
    // tanpa memeriksa apa pun. Angkanya sengaja ambang bawah, bukan sama-dengan.
    expect(checked.length).toBeGreaterThanOrEqual(12);
  });

  it("ketiga laporan stok bergantung pada modul stok — bukan pada report.read", () => {
    // Regresi langsung dari audit produksi 13 Agustus 2026: inilah ketiga kartu
    // yang mendarat di layar modul-tidak-aktif. `report.read` di sini berarti
    // penyaringnya tidak akan pernah menyembunyikan mereka.
    for (const id of ["stock-value", "stock-movement", "opname-history"]) {
      const report = REPORTS.find((r) => r.id === id);
      expect(report?.permission, `laporan stok "${id}"`).toBe("inventory.read");
    }
  });
});

describe("permukaan yang memakai katalog benar-benar menyaring", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

  it("Pusat Laporan menyaring kartunya lewat canEffective", () => {
    const src = read("app/(dashboard)/t/[tenantSlug]/[companySlug]/reports/page.tsx");
    expect(src).toContain("canEffective(");
    expect(src).toContain("r.permission");
  });

  /*
   * Menyembunyikan kartunya saja hanya memindahkan pintunya: `report.export`
   * berarti "boleh mengekspor laporan", bukan "boleh mengekspor laporan INI".
   */
  it("route payload ekspor ikut memeriksa izin laporannya sendiri", () => {
    const src = read("app/api/reports/payload/route.ts");
    expect(src).toContain("canEffective(");
    expect(src).toContain("report.permission");
  });
});

/**
 * Mode Akuntan (issue #355) — janji dialognya ditepati di Pusat Laporan juga.
 *
 * Dialog toggle-nya berbunyi: mematikan Mode Akuntan menyembunyikan menu
 * akuntansi "dan label debit/kredit di formulir, sehingga tampilan jadi bahasa
 * sehari-hari saja". Audit produksi 13 Agustus 2026 menemukan janji itu hanya
 * ditepati separuh: menu Jurnal / Buku Besar / Daftar Akun memang hilang, tapi
 * Pusat Laporan tetap memajang Neraca Saldo — artefak PALING akuntan di
 * pembukuan berpasangan — lengkap dengan kalimat "Saldo debit/kredit seluruh
 * akun pada satu tanggal, harus seimbang".
 */
describe("Mode Akuntan menyaring laporan yang khusus akuntan", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

  it("Neraca Saldo ditandai accountingOnly", () => {
    expect(REPORTS.find((r) => r.id === "trial-balance")?.accountingOnly).toBe(true);
  });

  /*
   * Batas atasnya sama pentingnya dengan penandanya. Laba/Rugi, Neraca, dan
   * Arus Kas berbagi izin `report.read` dengan Neraca Saldo — kalau salah satu
   * dari ketiganya ikut tertandai, pemilik usaha yang mematikan Mode Akuntan
   * kehilangan justru laporan yang paling perlu ia baca, tanpa galat apa pun.
   */
  it("laporan untuk pemilik usaha TIDAK ikut tersembunyi", () => {
    for (const id of ["income-statement", "balance-sheet", "cash-flow", "receivables", "cash-bank"]) {
      expect(
        REPORTS.find((r) => r.id === id)?.accountingOnly ?? false,
        `laporan "${id}" seharusnya tetap terlihat tanpa Mode Akuntan`
      ).toBe(false);
    }
  });

  it("Pusat Laporan menyaring dengan effectiveAccountantMode, fungsi yang sama dengan menu", () => {
    const src = read("app/(dashboard)/t/[tenantSlug]/[companySlug]/reports/page.tsx");
    expect(src).toContain("effectiveAccountantMode(");
    expect(src).toContain("accountingOnly");
    // Menu memakai fungsi yang sama — kalau keduanya berbeda, katalog dan
    // sidebar bisa berselisih pendapat tentang pengguna yang sama.
    expect(read("lib/nav.ts")).toContain("effectiveAccountantMode(");
  });

  /*
   * Menyembunyikan kartunya tanpa menutup halamannya hanya menyembunyikan
   * PINTU-nya: alamat `/reports/trial-balance` tetap terbuka bagi siapa pun
   * yang pernah menyimpannya di bookmark.
   */
  it("halaman Neraca Saldo sendiri ikut tertutup saat Mode Akuntan OFF", () => {
    const src = read(
      "app/(dashboard)/t/[tenantSlug]/[companySlug]/reports/trial-balance/page.tsx"
    );
    expect(src).toContain("effectiveAccountantMode(");
    expect(src).toContain("redirect(");
  });
});
