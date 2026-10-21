/**
 * Palet perintah tidak boleh menyimpang dari menu samping.
 *
 * Bahaya sebuah palet pencarian bukan pada mesin pencocokannya, melainkan pada
 * DAFTARNYA. Kalau palet menyusun daftarnya sendiri, cepat atau lambat ia akan:
 *
 *   • menawarkan halaman yang tidak ada di menu — pengguna menemukan "pintu"
 *     yang tak pernah terlihat, menekan Enter, lalu dipantulkan penjaga izin;
 *   • atau menyembunyikan halaman yang ADA di menu — pencarian terasa rusak.
 *
 * Keduanya lebih membingungkan daripada tidak punya palet sama sekali. Karena
 * itu palet memakai `visibleNavGroups()` yang sama persis dengan sidebar, dan
 * berkas ini menjaga janji tersebut tetap benar untuk berbagai kombinasi peran,
 * izin efektif, dan modul yang dimatikan.
 *
 * Yang diuji di sini adalah SUMBER DATANYA, bukan render-nya: komponennya
 * client + Radix + cmdk, sementara pertanyaan yang penting ("apa yang pantas
 * ditawarkan?") sepenuhnya ditentukan fungsi murni ini.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NAV_HOME, isNavItemVisible, visibleNavGroups, visibleNavHrefs, visibleReportShortcuts } from "@/lib/nav";
import { REPORTS } from "@/lib/report-catalog";
import { PERMISSIONS } from "@sai/core/authz";
import { ROLES } from "@sai/core/constants";
import { filterPermissionsByModules, BUSINESS_MODULES, type BusinessModule } from "@/lib/business-modules";

/** Persis cara palet menyusun daftarnya (lihat command-palette.tsx). */
function paletteHrefs(user: { role: string; accountantMode?: boolean | null }, allowed?: ReadonlySet<string>) {
  const groups = visibleNavGroups(user, allowed);
  const items = groups.flatMap((g) => g.items.map((i) => i.href));
  return isNavItemVisible(NAV_HOME, user, allowed) ? [NAV_HOME.href, ...items] : items;
}

const ROLES_UNDER_TEST = [
  ROLES.MANAGING_DIRECTOR,
  ROLES.FINANCE_MANAGER,
  ROLES.WAREHOUSE_HEAD,
  ROLES.ADMINISTRATOR,
];

describe("palet perintah memakai daftar yang sama dengan menu samping", () => {
  it("menawarkan persis href yang terlihat di menu, untuk setiap peran", () => {
    for (const role of ROLES_UNDER_TEST) {
      const user = { role, accountantMode: null };
      // `visibleNavHrefs` adalah yang dipakai sidebar untuk menandai menu aktif —
      // sumber kebenaran "apa yang terlihat".
      expect(paletteHrefs(user).sort(), role).toEqual([...visibleNavHrefs(user)].sort());
    }
  });

  it("mengikuti izin EFEKTIF, bukan hanya matriks bawaan", () => {
    const user = { role: ROLES.FINANCE_MANAGER, accountantMode: null };
    const full = paletteHrefs(user, new Set(PERMISSIONS));
    const none = paletteHrefs(user, new Set<string>());

    // Tanpa satu pun izin efektif hanya Beranda yang tersisa — `NAV_HOME`
    // memang tidak mendeklarasikan izin (selalu terjangkau), dan palet harus
    // meniru itu, bukan mengosongkan dirinya.
    expect(none).toEqual([NAV_HOME.href]);
    // Dengan semuanya, palet menawarkan lebih banyak daripada saat kosong.
    expect(full.length).toBeGreaterThan(0);
  });

  it("ikut menyaring modul yang dimatikan tanpa kode tambahan", () => {
    // Sejak #99 izin efektif sudah tersaring modul di server, jadi palet cukup
    // memakainya. Ini membuktikan rantainya nyambung: modul mati → izin hilang
    // → palet tidak menawarkan halamannya.
    const user = { role: ROLES.MANAGING_DIRECTOR, accountantMode: null };
    const withTrading = new Set(
      filterPermissionsByModules(PERMISSIONS, new Set(BUSINESS_MODULES) as ReadonlySet<BusinessModule>)
    );
    const withoutTrading = new Set(
      filterPermissionsByModules(
        PERMISSIONS,
        new Set(BUSINESS_MODULES.filter((m) => m !== "trading")) as ReadonlySet<BusinessModule>
      )
    );

    const before = paletteHrefs(user, withTrading);
    const after = paletteHrefs(user, withoutTrading);

    expect(after.length).toBeLessThan(before.length);
    expect(before).toContain("/contracts");
    expect(after).not.toContain("/contracts");
    // Buku besar tidak boleh ikut hilang — modul menggerbangi permukaan, bukan
    // buku besar (janji inti #99).
    expect(after).toContain("/ledger");
  });

  it("tidak pernah menawarkan href yang sama dua kali", () => {
    // Duplikat akan terlihat sebagai dua baris identik saat mengetik.
    for (const role of ROLES_UNDER_TEST) {
      const hrefs = paletteHrefs({ role, accountantMode: null });
      expect(new Set(hrefs).size, role).toBe(hrefs.length);
    }
  });
});

/** Palet dibuka dengan fokus di kolom ketik, bukan di tombol tutup. */
describe("palet: fokus awal di kolom ketik", () => {
  const src = readFileSync(join(__dirname, "..", "src", "components", "layout", "command-palette.tsx"), "utf8");

  it("DialogContent memanggil kait fokus, dan kait itu memfokuskan kolom ketik", () => {
    expect(src).toMatch(/<DialogContent[^>]*onOpenAutoFocus=\{focusInput\}/);
    expect(src).toMatch(/<CommandInput[^>]*ref=\{inputRef\}/);
    expect(src).toContain("inputRef.current?.focus()");
  });
});

/** Laporan di palet diambil dari katalog Pusat Laporan dengan saringan yang sama. */
describe("palet: laporan dari katalog", () => {
  const md = { role: ROLES.MANAGING_DIRECTOR, accountantMode: true };
  const hrefs = (user: typeof md, allowed?: ReadonlySet<string>) =>
    visibleReportShortcuts(user, allowed).map((r) => r.href);

  it("Neraca dan Arus Kas bisa dicari", () => {
    expect(hrefs(md)).toContain("/reports/balance-sheet");
    expect(hrefs(md)).toContain("/reports/cash-flow");
  });

  it("hanya laporan yang tersedia, tanpa href ganda", () => {
    const all = hrefs(md, new Set(PERMISSIONS));
    const available = new Set(REPORTS.filter((r) => r.status === "available").map((r) => r.href));
    expect(all.every((h) => available.has(h))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it("laporan berbagi halaman digabung dalam satu baris dengan semua judulnya", () => {
    const budget = visibleReportShortcuts(md, new Set(PERMISSIONS)).find((r) => r.href === "/budget/report");
    expect(budget?.textKeys.length).toBe(2);
  });

  it("Neraca Saldo hilang saat Mode Akuntan mati, seperti di Pusat Laporan", () => {
    expect(hrefs(md)).toContain("/reports/trial-balance");
    expect(hrefs({ ...md, accountantMode: false })).not.toContain("/reports/trial-balance");
  });

  it("mengikuti izin efektif: tanpa izin, tanpa laporan", () => {
    expect(hrefs(md, new Set<string>())).toEqual([]);
  });

  it("modul Stok mati menyembunyikan laporan stok", () => {
    const withoutInventory = new Set(
      filterPermissionsByModules(
        PERMISSIONS,
        new Set(BUSINESS_MODULES.filter((m) => m !== "inventory")) as ReadonlySet<BusinessModule>
      )
    );
    expect(hrefs(md, new Set(PERMISSIONS))).toContain("/reports/stock-value");
    expect(hrefs(md, withoutInventory)).not.toContain("/reports/stock-value");
  });
});
