/**
 * Pencabutan sesi (audit RBAC fase 3) — keputusan murninya.
 *
 * Yang dijaga: token dicabut saat pengguna dihapus, versinya dinaikkan admin
 * (ganti peran / reset kata sandi), atau token lahir sebelum fase 3 (tanpa
 * versi); token sehat disegarkan — bukan dibiarkan basi. Pengecekan DB
 * berjeda `SESSION_RECHECK_MS`, jadi jendela maksimum token tercabut masih
 * terpakai = interval itu.
 */
import { describe, expect, it } from "vitest";
import {
  SESSION_RECHECK_MS,
  evaluateSession,
  shouldRecheckSession,
} from "@/lib/session-guard";

const dbUser = {
  role: "core",
  status: 0,
  sessionVersion: 3,
  accountantMode: null,
};

describe("evaluateSession", () => {
  it("mencabut saat baris pengguna hilang (akun dihapus)", () => {
    expect(evaluateSession({ sessionVersion: 3 }, null)).toBe("revoke");
    expect(evaluateSession({ sessionVersion: 3 }, undefined)).toBe("revoke");
  });

  it("mencabut token lama tanpa versi (sekali login ulang pasca-rilis)", () => {
    expect(evaluateSession({}, dbUser)).toBe("revoke");
    expect(evaluateSession({ sessionVersion: undefined }, dbUser)).toBe("revoke");
    expect(evaluateSession({ sessionVersion: "3" }, dbUser)).toBe("revoke");
  });

  it("mencabut saat versi DB sudah dinaikkan admin", () => {
    expect(evaluateSession({ sessionVersion: 2 }, dbUser)).toBe("revoke");
    expect(evaluateSession({ sessionVersion: 4 }, dbUser)).toBe("revoke");
  });

  it("menyegarkan token yang versinya cocok", () => {
    expect(evaluateSession({ sessionVersion: 3 }, dbUser)).toBe("refresh");
  });
});

describe("shouldRecheckSession", () => {
  const now = 1_000_000_000;

  it("token tanpa stempel selalu dicek", () => {
    expect(shouldRecheckSession({}, now)).toBe(true);
    expect(shouldRecheckSession({ checkedAt: "kemarin" }, now)).toBe(true);
  });

  it("baru dicek lagi setelah intervalnya lewat", () => {
    expect(shouldRecheckSession({ checkedAt: now - SESSION_RECHECK_MS + 1 }, now)).toBe(false);
    expect(shouldRecheckSession({ checkedAt: now - SESSION_RECHECK_MS }, now)).toBe(true);
    expect(shouldRecheckSession({ checkedAt: now - SESSION_RECHECK_MS * 5 }, now)).toBe(true);
  });

  it("stempel segar tidak memicu query DB", () => {
    expect(shouldRecheckSession({ checkedAt: now }, now)).toBe(false);
  });
});
