/**
 * Matriks izin TINGKAT TENANT + anti-lockout owner terakhir (issue #135).
 *
 * Menjaga kontrak §6 docs/MULTI-TENANT.md:
 *   owner  — semuanya, termasuk penagihan;
 *   admin  — buat perusahaan & undang orang, TANPA penagihan;
 *   member — hanya `tenant.home` (halaman akun /platform, issue #172);
 * dan dua sifat lintas-matriks: deny-by-default, serta kunci izin tenant yang
 * SALING LEPAS dari kunci izin perusahaan (aturan "izin tenant tidak boleh
 * diperiksa penjaga perusahaan" ditegakkan tipe, dan tes ini membuktikan
 * himpunannya memang tidak beririsan).
 */
import { describe, expect, it } from "vitest";

import {
  TENANT_PERMISSIONS,
  TENANT_PERMISSION_ROLES,
  isTenantPermission,
  tenantCan,
  tenantPermissionsForRole,
  validateTenantMembershipChange,
} from "@/lib/tenant-authz";
import { PERMISSIONS } from "@/lib/authz";
import { TENANT_ROLES, TENANT_ROLE_VALUES } from "@/lib/constants";

describe("matriks izin tenant", () => {
  it("setiap izin punya minimal satu peran, dan semua perannya sah", () => {
    for (const permission of TENANT_PERMISSIONS) {
      const roles = TENANT_PERMISSION_ROLES[permission];
      expect(roles.length, permission).toBeGreaterThan(0);
      for (const role of roles) {
        expect(TENANT_ROLE_VALUES).toContain(role);
      }
    }
  });

  it("owner memegang SEMUA izin tenant", () => {
    for (const permission of TENANT_PERMISSIONS) {
      expect(tenantCan({ role: TENANT_ROLES.OWNER }, permission), permission).toBe(true);
    }
  });

  it("admin boleh membuat perusahaan & mengundang, TANPA penagihan/pengaturan tenant", () => {
    expect(tenantCan({ role: TENANT_ROLES.ADMIN }, "company.create")).toBe(true);
    expect(tenantCan({ role: TENANT_ROLES.ADMIN }, "tenant.member.invite")).toBe(true);
    expect(tenantCan({ role: TENANT_ROLES.ADMIN }, "tenant.billing")).toBe(false);
    expect(tenantCan({ role: TENANT_ROLES.ADMIN }, "tenant.settings")).toBe(false);
  });

  it("member memegang TEPAT SATU izin tenant: membuka halaman akun (issue #172)", () => {
    /*
     * Sisa aksesnya tetap murni per-PT. `tenant.home` ada karena `/platform`
     * menjadi pendaratan pasca-masuk SETIAP anggota: menjaganya dengan izin
     * owner akan memantulkan hampir seluruh pengguna pada langkah pertamanya.
     * Yang dijaga di sini adalah batasnya — satu baris, bukan dua.
     */
    expect(tenantPermissionsForRole(TENANT_ROLES.MEMBER)).toEqual(["tenant.home"]);
  });

  it("member TIDAK melihat langganan, ekspor, penghapusan, pembuatan PT, atau undangan", () => {
    // Pemisahan isi halaman /platform berdiri di atas baris-baris ini; kalau
    // salah satunya bocor ke `member`, halamannya merender bagian owner.
    for (const permission of [
      "tenant.billing",
      "tenant.settings",
      "tenant.export",
      "tenant.deletion",
      "company.create",
      "tenant.member.invite",
    ] as const) {
      expect(tenantCan({ role: TENANT_ROLES.MEMBER }, permission), permission).toBe(false);
    }
  });

  it("admin ikut memegang tenant.home — pendaratan itu untuk semua peran tenant", () => {
    for (const role of TENANT_ROLE_VALUES) {
      expect(tenantCan({ role }, "tenant.home"), role).toBe(true);
    }
  });

  it("company.create hidup di matriks TENANT dan sudah TIDAK ada di matriks perusahaan", () => {
    // Inilah pemecah ayam-dan-telur (#135): kalau baris ini kembali muncul di
    // matriks perusahaan, pemilik tenant tanpa PT kehilangan pintunya lagi.
    expect(isTenantPermission("company.create")).toBe(true);
    expect(PERMISSIONS as readonly string[]).not.toContain("company.create");
  });

  it("kunci izin tenant SALING LEPAS dari kunci izin perusahaan", () => {
    const company = new Set<string>(PERMISSIONS);
    for (const permission of TENANT_PERMISSIONS) {
      expect(company.has(permission), permission).toBe(false);
    }
  });

  it("deny-by-default: peran kosong, null, atau tak dikenal selalu ditolak", () => {
    const cases = [null, undefined, { role: null }, { role: "" }, { role: "managing_director" }];
    for (const membership of cases) {
      for (const permission of TENANT_PERMISSIONS) {
        expect(tenantCan(membership, permission)).toBe(false);
      }
    }
  });

  it("tenantPermissionsForRole konsisten dengan tenantCan", () => {
    for (const role of TENANT_ROLE_VALUES) {
      const set = new Set(tenantPermissionsForRole(role));
      for (const permission of TENANT_PERMISSIONS) {
        expect(set.has(permission)).toBe(tenantCan({ role }, permission));
      }
    }
  });
});

describe("anti-lockout owner terakhir", () => {
  const owner = { userId: 1, role: TENANT_ROLES.OWNER };
  const secondOwner = { userId: 2, role: TENANT_ROLES.OWNER };
  const admin = { userId: 3, role: TENANT_ROLES.ADMIN };

  it("owner TERAKHIR tidak bisa dihapus", () => {
    const refusal = validateTenantMembershipChange([owner, admin], {
      userId: 1,
      role: null,
    });
    expect(refusal).toMatch(/[Oo]wner terakhir/);
  });

  it("owner TERAKHIR tidak bisa diturunkan perannya", () => {
    const refusal = validateTenantMembershipChange([owner, admin], {
      userId: 1,
      role: TENANT_ROLES.MEMBER,
    });
    expect(refusal).toMatch(/[Oo]wner terakhir/);
  });

  it("owner boleh turun/keluar selama masih ada owner LAIN", () => {
    expect(
      validateTenantMembershipChange([owner, secondOwner], { userId: 1, role: null })
    ).toBeNull();
    expect(
      validateTenantMembershipChange([owner, secondOwner], {
        userId: 1,
        role: TENANT_ROLES.ADMIN,
      })
    ).toBeNull();
  });

  it("bukan-owner bebas diubah/dihapus — anti-lockout hanya menjaga owner", () => {
    expect(validateTenantMembershipChange([owner, admin], { userId: 3, role: null })).toBeNull();
    expect(
      validateTenantMembershipChange([owner, admin], { userId: 3, role: TENANT_ROLES.OWNER })
    ).toBeNull();
  });

  it("owner tetap owner = bukan penurunan, selalu sah", () => {
    expect(
      validateTenantMembershipChange([owner], { userId: 1, role: TENANT_ROLES.OWNER })
    ).toBeNull();
  });

  it("orang di luar tenant dan peran tak dikenal ditolak dengan alasan yang jelas", () => {
    expect(validateTenantMembershipChange([owner], { userId: 99, role: null })).toMatch(
      /bukan anggota/
    );
    expect(
      validateTenantMembershipChange([owner, admin], {
        userId: 3,
        role: "superuser" as unknown as (typeof TENANT_ROLE_VALUES)[number],
      })
    ).toMatch(/tidak dikenal/);
  });
});
