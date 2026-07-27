/**
 * Kebijakan otorisasi terpusat (audit RBAC fase 1) — keputusan murninya.
 *
 * Yang dijaga: matriks izin↔peran di `lib/authz.ts` mempertahankan kebijakan
 * yang diaudit 2026-07 (peran berakses penuh memegang semua; hapus master =
 * akses-penuh-saja; Kepala Gudang = stok + halaman bersama), `can()`
 * deny-by-default, dan enum peran satu sumber tidak menyimpang dari `ROLES`.
 *
 * Sejak migration 0032 peran berakses penuh ada DUA — `managing_director` dan
 * `administrator` — dan setiap invarian "bos-only" di bawah kini berarti
 * "persis kedua peran itu, tidak lebih".
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
import { FULL_ACCESS_ROLES, ROLES, ROLE_VALUES } from "@/lib/constants";
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

  it("managing_director (Direktur Utama) memegang SEMUA izin", () => {
    for (const permission of PERMISSIONS) {
      expect(can({ role: "managing_director" }, permission), permission).toBe(true);
    }
  });

  it("administrator memegang SEMUA izin — kembar Direktur Utama, tanpa kecuali", () => {
    // Kalau satu izin saja terlewat, "akses penuh" jadi janji kosong dan
    // Administrator terkunci dari halaman yang justru harus ia perbaiki.
    for (const permission of PERMISSIONS) {
      expect(can({ role: ROLES.ADMINISTRATOR }, permission), permission).toBe(true);
    }
  });

  it("kedua peran berakses penuh punya izin yang PERSIS sama", () => {
    for (const permission of PERMISSIONS) {
      expect(
        can({ role: ROLES.ADMINISTRATOR }, permission),
        `${permission}: administrator ≠ managing_director`
      ).toBe(can({ role: ROLES.MANAGING_DIRECTOR }, permission));
    }
  });

  it("hapus master data = akses-penuh-saja; advance.delete pengecualian yang disengaja", () => {
    const deletePermissions = PERMISSIONS.filter((p) => p.endsWith(".delete"));
    expect(deletePermissions.length).toBeGreaterThanOrEqual(5);
    for (const permission of deletePermissions) {
      if (permission === "advance.delete") continue; // koreksi kerja harian Manajer Keuangan
      expect(rolesFor(permission), permission).toEqual([...FULL_ACCESS_ROLES]);
    }
    expect(can({ role: "finance_manager" }, "advance.delete")).toBe(true);
    // Gudang tetap tidak boleh menghapus apa pun.
    expect(can({ role: "warehouse_head" }, "advance.delete")).toBe(false);
  });

  it("warehouse_head (Gudang) HANYA stok + halaman bersama — tidak pernah dokumen uang", () => {
    const ptgPermissions = PERMISSIONS.filter((p) => can({ role: "warehouse_head" }, p));
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

  it("finance_manager tidak menyentuh laporan, anggaran, jurnal, atau administrasi", () => {
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
      // ber-privilege; bawaannya akses-penuh-saja.
      "authz.manage",
    ] as Permission[]) {
      expect(can({ role: "finance_manager" }, permission), permission).toBe(false);
    }
    // Pengecualian terdokumentasi: form kas Manajer Keuangan butuh daftar akun.
    expect(can({ role: "finance_manager" }, "account.read")).toBe(true);
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

  it("permukaan akuntansi terdaftar dan akses-penuh-saja", () => {
    expect(ACCOUNTING_PERMISSIONS.size).toBeGreaterThanOrEqual(4);
    for (const permission of ACCOUNTING_PERMISSIONS) {
      expect(PERMISSIONS).toContain(permission);
      // Lapisan Mode Akuntan hanya masuk akal di atas izin akses-penuh-saja.
      expect(rolesFor(permission), permission).toEqual([...FULL_ACCESS_ROLES]);
    }
  });
});

describe("can() — deny by default", () => {
  it("menolak peran kosong, null, atau tak dikenal", () => {
    expect(can(null, "inventory.read")).toBe(false);
    expect(can(undefined, "inventory.read")).toBe(false);
    expect(can({ role: null }, "inventory.read")).toBe(false);
    expect(can({ role: "" }, "inventory.read")).toBe(false);
    expect(can({ role: "director" }, "inventory.read")).toBe(false); // salah ketik ≠ peran
    expect(can({ role: "admin" }, "inventory.read")).toBe(false); // ≠ administrator
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
    // Kunci peran LAMA (sebelum migration 0032) tidak boleh hidup kembali.
    for (const legacy of ["bos", "core", "ptg"]) {
      expect(roleEnum.safeParse(legacy).success, legacy).toBe(false);
      expect(can({ role: legacy }, "inventory.read"), legacy).toBe(false);
    }
  });

  it("FULL_ACCESS_ROLES = Direktur Utama + Administrator, keduanya peran sistem", () => {
    expect([...FULL_ACCESS_ROLES]).toEqual([ROLES.MANAGING_DIRECTOR, ROLES.ADMINISTRATOR]);
    for (const role of FULL_ACCESS_ROLES) expect(ROLE_VALUES).toContain(role);
  });
});
