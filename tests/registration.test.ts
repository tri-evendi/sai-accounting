/**
 * Pendaftaran mandiri (issue #138) — sifat yang dikunci:
 *   • token verifikasi: mentah ≠ tersimpan (SHA-256), berbatas 24 jam,
 *     sekali pakai (semantik yang sama dengan token atur-ulang #136);
 *   • verifikasi melahirkan tenant berstatus `trialing` dengan masa uji coba
 *     sepanjang `TRIAL_DAYS` (snapshot bawaan paket, bukan pembacaan basis
 *     data platform);
 *   • slug tenant: dinormalkan, tidak pernah kosong, kandidat anti-tabrakan
 *     deterministik lalu acak;
 *   • gerbang penyediaan: kuota `max_companies` & status tenant diputuskan
 *     fungsi murni yang dipanggil SERVER (`POST /api/companies`).
 */
import { describe, expect, it } from "vitest";

import {
  STATUS_AFTER_VERIFICATION,
  TRIAL_DAYS,
  VERIFICATION_TTL_MS,
  hashVerificationToken,
  mintVerificationToken,
  refuseProvisioning,
  tenantSlugCandidates,
  tenantSlugFrom,
  trialEndsAtFrom,
  usernameFromEmail,
  verdictForVerification,
} from "@/lib/registration";
import { TENANT_STATUSES } from "@/lib/constants";

describe("token verifikasi", () => {
  it("mentah 64 hex, tersimpan hanya hash-nya, dan keduanya BERBEDA", () => {
    const minted = mintVerificationToken();
    expect(minted.token).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.tokenHash).not.toBe(minted.token);
    expect(hashVerificationToken(minted.token)).toBe(minted.tokenHash);
  });

  it("berlaku 24 jam dari penerbitan", () => {
    const now = new Date("2026-08-01T10:00:00Z");
    expect(mintVerificationToken(now).expiresAt.getTime() - now.getTime()).toBe(
      VERIFICATION_TTL_MS
    );
    expect(VERIFICATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("verdict: tidak ada → not_found; terpakai → used; lewat/tepat batas → expired; selainnya valid", () => {
    const now = new Date("2026-08-01T10:00:00Z");
    const future = new Date(now.getTime() + 1);
    const past = new Date(now.getTime() - 1);
    expect(verdictForVerification(null, now)).toBe("not_found");
    expect(verdictForVerification({ expiresAt: future, usedAt: past }, now)).toBe("used");
    expect(verdictForVerification({ expiresAt: past, usedAt: null }, now)).toBe("expired");
    expect(verdictForVerification({ expiresAt: now, usedAt: null }, now)).toBe("expired");
    expect(verdictForVerification({ expiresAt: future, usedAt: null }, now)).toBe("valid");
  });
});

describe("kelahiran tenant", () => {
  it("status hasil verifikasi = trialing (transisi §7.4 dimulai dari sana), dan sah di enum", () => {
    expect(STATUS_AFTER_VERIFICATION).toBe("trialing");
    expect(TENANT_STATUSES).toContain(STATUS_AFTER_VERIFICATION);
  });

  it("masa uji coba = TRIAL_DAYS hari, dihitung dari saat verifikasi", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    /* Angkanya TIDAK diketik ulang di sini. Tes yang menuliskan `14` akan
     * merah setiap kali keputusan komersialnya berubah — dan yang ia laporkan
     * bukan cacat melainkan bahwa seseorang mengubah harga jual. Yang layak
     * dikunci adalah HUBUNGANNYA: tanggal berakhir mengikuti konstanta yang
     * sama yang dipublikasikan halaman harga dan FAQ. */
    expect(trialEndsAtFrom(now).getTime() - now.getTime()).toBe(
      TRIAL_DAYS * 24 * 60 * 60 * 1000
    );
    // Yang tetap dijaga sebagai ANGKA: uji coba harus benar-benar ada.
    expect(TRIAL_DAYS).toBeGreaterThan(0);
  });
});

describe("slug tenant & username", () => {
  it("dinormalkan: huruf kecil/angka/tanda hubung, tanpa tepi menggantung", () => {
    expect(tenantSlugFrom("PT Bumi Baru")).toBe("pt-bumi-baru");
    expect(tenantSlugFrom("  Budi & Rekan!! ")).toBe("budi-rekan");
  });

  it("nama yang tak menyisakan apa pun jatuh ke 'tenant', bukan string kosong", () => {
    expect(tenantSlugFrom("!!!")).toBe("tenant");
    expect(tenantSlugFrom("小明")).toBe("tenant");
  });

  it("kandidat anti-tabrakan: basis, basis-2..basis-9, lalu akhiran acak — dan muat di kolom 50", () => {
    const candidates = tenantSlugCandidates("Budi", "abc123");
    expect(candidates[0]).toBe("budi");
    expect(candidates[1]).toBe("budi-2");
    expect(candidates[8]).toBe("budi-9");
    expect(candidates[9]).toBe("budi-abc123");
    for (const c of tenantSlugCandidates("x".repeat(200), "abcdef")) {
      expect(c.length).toBeLessThanOrEqual(50);
    }
  });

  it("username dari bagian lokal email; tak pernah kosong", () => {
    expect(usernameFromEmail("Budi.Santoso@contoh.co.id")).toBe("budi.santoso");
    expect(usernameFromEmail("@contoh.co.id")).toBe("pengguna");
  });
});

describe("gerbang penyediaan (kuota & status — issue #138)", () => {
  it("trialing/active di bawah kuota → boleh", () => {
    expect(refuseProvisioning({ status: "trialing", maxCompanies: 1, companyCount: 0 })).toBeNull();
    expect(refuseProvisioning({ status: "active", maxCompanies: 3, companyCount: 2 })).toBeNull();
  });

  it("kuota terpakai penuh → company_quota_reached (dan tak bisa dilampaui)", () => {
    expect(refuseProvisioning({ status: "active", maxCompanies: 1, companyCount: 1 })).toBe(
      "company_quota_reached"
    );
    expect(refuseProvisioning({ status: "trialing", maxCompanies: 1, companyCount: 5 })).toBe(
      "company_quota_reached"
    );
  });

  it("status non-aktif TIDAK menumbuhkan buku baru — suspended = hanya-baca (§7.4)", () => {
    for (const status of ["pending_verification", "past_due", "suspended", "cancelled"]) {
      expect(refuseProvisioning({ status, maxCompanies: 10, companyCount: 0 })).toBe(
        "tenant_not_active"
      );
    }
  });

  it("status di luar enum ditolak — deny-by-default, bukan diloloskan diam-diam", () => {
    expect(refuseProvisioning({ status: "ACTIVE", maxCompanies: 10, companyCount: 0 })).toBe(
      "tenant_not_active"
    );
    expect(refuseProvisioning({ status: "", maxCompanies: 10, companyCount: 0 })).toBe(
      "tenant_not_active"
    );
  });
});
