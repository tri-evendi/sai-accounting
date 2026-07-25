/**
 * Aturan kelola peran (peran dinamis) — validasi & guard murni.
 */
import { describe, it, expect } from "vitest";
import {
  validateNewRole,
  validateRoleLabel,
  canDeactivateRole,
  roleDeletionBlock,
  SYSTEM_ROLE_KEYS,
} from "@/lib/roles-admin";

describe("validateNewRole", () => {
  it("menerima key & label yang sah, dinormalkan", () => {
    const r = validateNewRole("  Kasir ", "  Kasir Toko ");
    expect(r).toEqual({ ok: true, value: { key: "kasir", label: "Kasir Toko" } });
  });

  it("menolak key kosong / berspasi / diawali angka / terlalu panjang", () => {
    expect(validateNewRole("", "X").ok).toBe(false);
    expect(validateNewRole("kas ir", "X").ok).toBe(false);
    expect(validateNewRole("1kasir", "X").ok).toBe(false);
    expect(validateNewRole("k".repeat(21), "X").ok).toBe(false);
  });

  it("menolak key yang bentrok dengan peran sistem", () => {
    for (const k of SYSTEM_ROLE_KEYS) {
      expect(validateNewRole(k, "X").ok).toBe(false);
    }
  });

  it("menolak label kosong / >50 char", () => {
    expect(validateNewRole("kasir", "").ok).toBe(false);
    expect(validateNewRole("kasir", "L".repeat(51)).ok).toBe(false);
  });
});

describe("validateRoleLabel", () => {
  it("menerima label sah, tolak kosong", () => {
    expect(validateRoleLabel("Auditor")).toEqual({ ok: true, label: "Auditor" });
    expect(validateRoleLabel("   ").ok).toBe(false);
  });
});

describe("canDeactivateRole", () => {
  it("peran sistem tak bisa dinonaktifkan; peran kustom bisa", () => {
    expect(canDeactivateRole({ isSystem: true })).toBe(false);
    expect(canDeactivateRole({ isSystem: false })).toBe(true);
  });
});

describe("roleDeletionBlock", () => {
  it("blokir peran sistem", () => {
    expect(roleDeletionBlock({ isSystem: true }, 0)).toMatch(/sistem/i);
  });
  it("blokir peran yang masih dipakai pengguna", () => {
    expect(roleDeletionBlock({ isSystem: false }, 3)).toMatch(/3 pengguna/);
  });
  it("izinkan hapus peran kustom tanpa pengguna", () => {
    expect(roleDeletionBlock({ isSystem: false }, 0)).toBeNull();
  });
});
