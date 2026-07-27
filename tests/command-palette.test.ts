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

import { NAV_HOME, isNavItemVisible, visibleNavGroups, visibleNavHrefs } from "@/lib/nav";
import { PERMISSIONS } from "@/lib/authz";
import { ROLES } from "@/lib/constants";
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
