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
  mustChangePassword: false,
  sessionVersion: 3,
};

/** Keanggotaan di perusahaan yang sedang dibuka (issue #104). */
const membership = { role: "finance_manager", accountantMode: null };

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

/**
 * issue #104 — keanggotaan ikut menentukan nasib token.
 *
 * Yang dijaga di sini adalah pembedaan yang mudah salah: kehilangan akses ke
 * SATU perusahaan bukan alasan mengusir orang dari aplikasi. Ia mungkin masih
 * memegang PT lain, dan melempar seluruh sesinya berarti menghukumnya untuk
 * perubahan yang tidak ada hubungannya dengan perusahaan lain itu.
 */
describe("evaluateSession — keanggotaan perusahaan", () => {
  it("token tanpa perusahaan aktif tetap sah (pengguna belum memilih)", () => {
    expect(evaluateSession({ sessionVersion: 3, companyId: null }, dbUser, null)).toBe("refresh");
    expect(evaluateSession({ sessionVersion: 3 }, dbUser, null)).toBe("refresh");
  });

  it("melepas perusahaan saat keanggotaannya dicabut — BUKAN mencabut sesi", () => {
    expect(evaluateSession({ sessionVersion: 3, companyId: 7 }, dbUser, null)).toBe("clearCompany");
  });

  it("menyegarkan saat keanggotaannya masih ada", () => {
    expect(evaluateSession({ sessionVersion: 3, companyId: 7 }, dbUser, membership)).toBe(
      "refresh"
    );
  });

  it("pengguna dihapus tetap MENCABUT, sekalipun keanggotaannya masih terbaca", () => {
    // Urutan pemeriksaan penting: identitas dulu, baru keanggotaan. Kalau
    // dibalik, akun yang sudah dihapus masih bisa membuka satu perusahaan
    // sampai keanggotaannya ikut dibersihkan.
    expect(evaluateSession({ sessionVersion: 3, companyId: 7 }, null, membership)).toBe("revoke");
  });

  it("versi sesi yang tidak cocok tetap MENCABUT, bukan sekadar melepas perusahaan", () => {
    expect(evaluateSession({ sessionVersion: 2, companyId: 7 }, dbUser, membership)).toBe("revoke");
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
