/**
 * PENJAGA batas lisensi on-premise (tahap D) — batas ditegakkan di titik
 * PEMBUATAN, lewat satu pintu, dan tidak pernah menutup yang sudah ada.
 *
 * Sebelum ini `overLimit()` tidak punya pemanggil, dan route pembuatan PT
 * membaca `tenants.max_companies` — angka sisa pendaftaran yang di on-premise
 * tidak berarti apa-apa. Lisensi yang memuat "3 perusahaan" karena itu tidak
 * pernah membatasi apa pun, dan lisensi "10 perusahaan" bisa tertahan di 1.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creationQuota,
  entitlementFromLicence,
  entitlementFromPlan,
} from "@sai/core/entitlement";
import {
  licenceKeyInstalled,
  licenceNotices,
  versionBeyondLicence,
  type Licence,
} from "@sai/core/licence";

const baca = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const kode = (p: string) =>
  baca(p)
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
    .join("\n");

const LISENSI: Licence = {
  licenceId: "LIS-1",
  customer: "PT Contoh",
  issuedAt: "2026-10-01T00:00:00Z",
  supportEndsAt: "2027-10-01T00:00:00Z",
  maxCompanies: 10,
  maxUsers: 40,
  modules: "all",
  maxVersion: "0.10",
};

describe("creationQuota — satu pintu, dua sumber", () => {
  const tenant = { maxCompanies: 1, maxUsers: 3 };

  it("SaaS memakai snapshot paket TENANT ITU, dihitung per tenant (perilaku lama)", () => {
    const q = creationQuota(entitlementFromPlan({ maxCompanies: 99, maxUsers: 99 }), tenant);
    expect(q).toEqual({ maxCompanies: 1, maxUsers: 3, scope: "tenant", source: "saas" });
  });

  it("lisensi memakai angka LISENSI atas seluruh pemasangan", () => {
    const q = creationQuota(entitlementFromLicence(LISENSI), tenant);
    expect(q).toEqual({ maxCompanies: 10, maxUsers: 40, scope: "installation", source: "licence" });
  });
});

describe("pemberitahuan lisensi — fakta, bukan gerbang", () => {
  it("`maxVersion` dibandingkan sepanjang komponen yang ditulisnya", () => {
    expect(versionBeyondLicence("0.10.3", "0.10")).toBe(false);
    expect(versionBeyondLicence("0.11.0", "0.10")).toBe(true);
    expect(versionBeyondLicence("0.10.3", "0.10.2")).toBe(true);
    expect(versionBeyondLicence("0.9.9", "0.10.0")).toBe(false);
    expect(versionBeyondLicence("1.0.0", "0")).toBe(true);
    expect(versionBeyondLicence("v0.10.3", "0.10.3")).toBe(false);
  });

  it("bentuk tak terbaca TIDAK melahirkan pemberitahuan palsu", () => {
    expect(versionBeyondLicence("0.10.3", "seri-satu")).toBe(false);
    expect(versionBeyondLicence("dev", "0.1")).toBe(false);
    expect(versionBeyondLicence("9.9.9", null)).toBe(false);
  });

  it("dukungan berakhir & versi melampaui dilaporkan bersama", () => {
    const now = new Date("2028-01-01");
    expect(licenceNotices(LISENSI, "0.11.0", now)).toEqual([
      "support_ended",
      "version_beyond_licence",
    ]);
    expect(licenceNotices(LISENSI, "0.10.9", new Date("2027-01-01"))).toEqual([]);
    expect(licenceNotices({ supportEndsAt: null, maxVersion: null }, "9.0.0", now)).toEqual([]);
  });

  it("kunci publik placeholder terbaca sebagai BELUM ditanam", () => {
    expect(licenceKeyInstalled()).toBe(false);
    expect(licenceKeyInstalled("-----BEGIN PUBLIC KEY-----")).toBe(true);
  });
});

describe("titik pembuatan membaca batas dari pintu entitlement", () => {
  it("pembuatan PT: `creationQuotaFor`, bukan `tenants.max_companies` mentah", () => {
    const src = kode("src/app/api/companies/route.ts");
    expect(src).toContain("creationQuotaFor(tenantRow)");
    expect(src).toContain("maxCompanies: quota.maxCompanies");
    expect(src).not.toMatch(/refuseProvisioning\(\{\s*\.\.\.tenantRow/);
  });

  it("lingkup `installation` menghitung SELURUH PT pemasangan", () => {
    const src = kode("src/app/api/companies/route.ts");
    expect(src).toMatch(/quota\?\.scope === "installation" \? undefined/);
  });

  it.each([
    ["src/app/api/tenant/invitations/route.ts", "tenantSeatCount(result.tenant.tenantId, seatQuota)"],
    ["src/app/api/auth/accept-invitation/route.ts", "seatQuota\n  );"],
    [
      "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/users/page.tsx",
      "await seatQuotaOverride()",
    ],
  ])("%s meneruskan batas kursi dari pintu entitlement", (berkas, potongan) => {
    expect(kode(berkas)).toContain(potongan);
  });

  it("SaaS tidak berubah: tanpa override, paket memakai `tenants.max_users`", () => {
    const store = kode("packages/platform/src/invitation-store.ts");
    expect(store).toContain("quota?.maxUsers ?? tenant?.maxUsers ?? 0");
    const src = kode("src/lib/entitlement-source.ts");
    expect(src).toMatch(/seatQuotaOverride[\s\S]{0,120}if \(billingPlaneInstalled\(\)\) return undefined;/);
    expect(src).toMatch(
      /creationQuotaFor[\s\S]{0,160}if \(billingPlaneInstalled\(\)\) return creationQuota\(entitlementFromPlan\(tenant\), tenant\);/,
    );
  });
});

describe("batas TIDAK PERNAH menutup yang sudah ada", () => {
  it("pintunya tidak melempar dan tidak menghentikan proses", () => {
    for (const p of ["packages/core/src/entitlement.ts", "src/lib/entitlement-source.ts"]) {
      const src = kode(p);
      for (const kata of ["throw ", "process.exit"]) {
        expect(src, `${p} memuat ${kata}`).not.toContain(kata);
      }
    }
  });

  it("pemberitahuan lisensi di probe kesehatan tidak pernah jadi 503", () => {
    const src = baca("src/lib/health-report.ts");
    expect(src).toContain("licence: licenceStatus");
    // Satu-satunya cabang `error` tetap kendali & skema.
    expect(src).not.toMatch(/status: "error"[^\n]*licence/);
  });
});
