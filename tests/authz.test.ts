/**
 * Kebijakan otorisasi terpusat (audit RBAC fase 1) — keputusan murninya.
 *
 * Yang dijaga: matriks izin↔peran di `lib/authz.ts` mempertahankan kebijakan
 * yang diaudit 2026-07 (bos memegang semua; hapus master = bos-only; ptg =
 * stok + halaman bersama), `can()` deny-by-default, dan enum peran satu
 * sumber tidak menyimpang dari `ROLES`.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_ROLES,
  can,
  rolesFor,
  type Permission,
} from "@/lib/authz";
import { ROLES, ROLE_VALUES } from "@/lib/constants";
import { roleEnum } from "@/lib/validations/common";

describe("matriks izin", () => {
  it("setiap izin punya minimal satu peran, dan semua perannya sah", () => {
    for (const permission of PERMISSIONS) {
      const roles = rolesFor(permission);
      expect(roles.length, permission).toBeGreaterThan(0);
      for (const role of roles) {
        expect(ROLE_VALUES, `${permission}: ${role}`).toContain(role);
      }
    }
  });

  it("bos (Pimpinan) memegang SEMUA izin", () => {
    for (const permission of PERMISSIONS) {
      expect(can({ role: "bos" }, permission), permission).toBe(true);
    }
  });

  it("hapus master data = bos-only; advance.delete pengecualian yang disengaja", () => {
    const deletePermissions = PERMISSIONS.filter((p) => p.endsWith(".delete"));
    expect(deletePermissions.length).toBeGreaterThanOrEqual(5);
    for (const permission of deletePermissions) {
      if (permission === "advance.delete") continue; // koreksi kerja harian core
      expect(rolesFor(permission), permission).toEqual([ROLES.BOS]);
    }
    expect(can({ role: "core" }, "advance.delete")).toBe(true);
  });

  it("ptg (Gudang) HANYA stok + halaman bersama — tidak pernah dokumen uang", () => {
    const ptgPermissions = PERMISSIONS.filter((p) => can({ role: "ptg" }, p));
    expect(ptgPermissions.sort()).toEqual(
      [
        "approval.view",
        "approval.decide",
        "inventory.read",
        "inventory.write",
        "glossary.read",
        "settings.view",
      ].sort()
    );
  });

  it("core tidak menyentuh laporan, anggaran, jurnal, atau administrasi", () => {
    for (const permission of [
      "report.read",
      "budget.manage",
      "journal.write",
      "ledger.read",
      "account.manage",
      "user.manage",
      "period.manage",
      "setup.manage",
      "audit.read",
      // issue #73 — mengubah matriks izin adalah administrasi paling
      // ber-privilege; bawaannya bos-only.
      "authz.manage",
    ] as Permission[]) {
      expect(can({ role: "core" }, permission), permission).toBe(false);
    }
    // Pengecualian terdokumentasi: form kas core butuh daftar akun.
    expect(can({ role: "core" }, "account.read")).toBe(true);
  });

  it("aksi lebih berbahaya tidak pernah lebih longgar: delete ⊆ write ⊆ read", () => {
    const resources = new Set(PERMISSIONS.map((p) => p.split(".")[0]));
    for (const resource of resources) {
      const get = (action: string) =>
        (PERMISSION_ROLES as Record<string, readonly string[]>)[`${resource}.${action}`];
      const read = get("read");
      const write = get("write");
      const del = get("delete");
      if (write && read) {
        for (const role of write) expect(read, `${resource}.write ⊆ read`).toContain(role);
      }
      if (del && (write ?? read)) {
        for (const role of del) {
          expect(write ?? read, `${resource}.delete ⊆ write/read`).toContain(role);
        }
      }
    }
  });

  it("permukaan akuntansi terdaftar dan bos-only", () => {
    expect(ACCOUNTING_PERMISSIONS.size).toBeGreaterThanOrEqual(4);
    for (const permission of ACCOUNTING_PERMISSIONS) {
      expect(PERMISSIONS).toContain(permission);
      // Lapisan Mode Akuntan hanya masuk akal di atas izin bos-only.
      expect(rolesFor(permission), permission).toEqual([ROLES.BOS]);
    }
  });
});

describe("can() — deny by default", () => {
  it("menolak peran kosong, null, atau tak dikenal", () => {
    expect(can(null, "inventory.read")).toBe(false);
    expect(can(undefined, "inventory.read")).toBe(false);
    expect(can({ role: null }, "inventory.read")).toBe(false);
    expect(can({ role: "" }, "inventory.read")).toBe(false);
    expect(can({ role: "boss" }, "inventory.read")).toBe(false); // salah ketik ≠ bos
    expect(can({ role: "tamu" }, "glossary.read")).toBe(false);
  });

  it("hasilnya konsisten dengan matriks mentah", () => {
    for (const [permission, roles] of Object.entries(PERMISSION_ROLES)) {
      for (const role of ROLE_VALUES) {
        expect(can({ role }, permission as Permission), `${role} × ${permission}`).toBe(
          (roles as readonly string[]).includes(role)
        );
      }
    }
  });
});

describe("enum peran satu sumber", () => {
  it("ROLE_VALUES persis nilai-nilai ROLES", () => {
    expect([...ROLE_VALUES].sort()).toEqual(Object.values(ROLES).sort());
  });

  it("roleEnum menerima semua peran sah dan menolak yang lain", () => {
    for (const role of ROLE_VALUES) {
      expect(roleEnum.safeParse(role).success).toBe(true);
    }
    expect(roleEnum.safeParse("admin").success).toBe(false);
    expect(roleEnum.safeParse("boss").success).toBe(false);
  });
});
