/**
 * PPh Final UMKM (PP 55/2022) — perkiraan, pembebasan orang pribadi, batas
 * waktu per bentuk usaha, dan sakelar di Pengaturan (bawaan MATI, diaudit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  estimatePphFinal,
  PPH_FINAL_TIME_LIMITS,
  pphFinalGroupFor,
  pphFinalTimeLimit,
} from "@/lib/pph-final-umkm";
import { businessProfileSchema } from "@/lib/validations/legal-form";
import { AKAR_REPO } from "./akar-sumber";

const tahun = (bulanan: number) => Array.from({ length: 12 }, () => bulanan);

describe("perkiraan bulanan 0,5% × peredaran bruto", () => {
  it("badan (CV): tanpa pembebasan; dibulatkan ke bawah ke rupiah", () => {
    const e = estimatePphFinal("cv", [100_000_001, ...tahun(0).slice(1)]);
    expect(e.months[0]).toEqual({ month: 1, gross: 100_000_001, cumulative: 100_000_001, taxable: 100_000_001, tax: 500_000 });
    expect(e.totalTax).toBe(500_000);
    expect(e.personalExemption).toBe(false);
  });

  it("orang pribadi (UD): Rp 500 juta pertama setahun bebas, dihitung kumulatif", () => {
    const e = estimatePphFinal("perorangan", tahun(60_000_000)); // 720 jt setahun
    // Jan–Agu kumulatif 480 jt: bebas. Sep: 540 jt → 40 jt kena. Okt–Des: 60 jt penuh.
    expect(e.months.slice(0, 8).every((m) => m.tax === 0)).toBe(true);
    expect(e.months[8]).toMatchObject({ taxable: 40_000_000, tax: 200_000 });
    expect(e.months[9]).toMatchObject({ taxable: 60_000_000, tax: 300_000 });
    expect(e.totalTaxable).toBe(220_000_000);
    expect(e.totalTax).toBe(1_100_000);
    expect(e.personalExemption).toBe(true);
  });

  it("bulan dengan retur melebihi penjualan tidak memberi pajak negatif", () => {
    const e = estimatePphFinal("pt", [10_000_000, -2_000_000, ...tahun(0).slice(2)]);
    expect(e.months[1]).toMatchObject({ gross: -2_000_000, taxable: 0, tax: 0 });
    expect(e.totalGross).toBe(8_000_000);
  });

  it("peredaran bruto > Rp 4,8 miliar ditandai", () => {
    expect(estimatePphFinal("pt", tahun(400_000_001)).overGrossLimit).toBe(true);
    expect(estimatePphFinal("pt", tahun(400_000_000)).overGrossLimit).toBe(false);
  });
});

describe("batas waktu PP 55/2022 Pasal 59 ayat (1)", () => {
  it("orang pribadi 7, CV/Firma/PT Perorangan 4, PT 3; lainnya tidak ditebak", () => {
    expect(pphFinalGroupFor("perorangan")).toBe("orang_pribadi");
    expect(pphFinalGroupFor("cv")).toBe("badan_4");
    expect(pphFinalGroupFor("firma")).toBe("badan_4");
    expect(pphFinalGroupFor("pt_perorangan")).toBe("badan_4");
    expect(pphFinalGroupFor("pt")).toBe("pt_3");
    expect(pphFinalGroupFor("lainnya")).toBeNull();
    expect(PPH_FINAL_TIME_LIMITS.orang_pribadi.years).toBe(7);
    expect(PPH_FINAL_TIME_LIMITS.badan_4.years).toBe(4);
    expect(PPH_FINAL_TIME_LIMITS.pt_3.years).toBe(3);
    expect(PPH_FINAL_TIME_LIMITS.badan_4.rule).toMatch(/perseroan perorangan/);
  });

  it("tahun terakhir = mulai + masa − 1; pengingat tahun terakhir, peringatan sesudahnya", () => {
    expect(pphFinalTimeLimit("pt", 2024, 2025)).toMatchObject({ lastYear: 2026, status: "active" });
    expect(pphFinalTimeLimit("pt", 2024, 2026).status).toBe("last_year");
    expect(pphFinalTimeLimit("pt", 2024, 2027).status).toBe("expired");
    expect(pphFinalTimeLimit("cv", 2023, 2026)).toMatchObject({ lastYear: 2026, status: "last_year" });
    expect(pphFinalTimeLimit("perorangan", 2020, 2026)).toMatchObject({ lastYear: 2026, status: "last_year" });
    expect(pphFinalTimeLimit("pt", 2027, 2026).status).toBe("not_started");
    expect(pphFinalTimeLimit("pt", null, 2026).status).toBe("unknown");
  });
});

describe("migration & skema profil usaha", () => {
  it("company 0007: sakelar bawaan FALSE, identitas nullable", () => {
    const sql = readFileSync(join(AKAR_REPO, "prisma/postgresql/company/0008_company_identity_pph_final/migration.sql"), "utf8");
    expect(sql).toMatch(/"pph_final_umkm" BOOLEAN NOT NULL DEFAULT false/);
    for (const c of ["nib", "deed_number", "ministry_decree_number", "established_on", "pph_final_umkm_start_year"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS "${c}" [A-Z]`));
    }
  });

  it("menyalakan PPh Final wajib menyebut tahun mulai; NIB 13 digit; teks kosong = hapus", () => {
    expect(businessProfileSchema.safeParse({ pphFinal: { enabled: true, startYear: null } }).success).toBe(false);
    expect(businessProfileSchema.safeParse({ pphFinal: { enabled: false, startYear: null } }).success).toBe(true);
    expect(businessProfileSchema.safeParse({ identity: { nib: "123" } }).success).toBe(false);
    expect(businessProfileSchema.parse({ identity: { nib: "", deedNumber: " " } }).identity).toEqual({ nib: null, deedNumber: null });
  });
});

/* ── Route: perubahan sakelar diaudit ─────────────────────────────────────── */

const row = vi.hoisted(() => ({
  current: {
    id: 1,
    nib: null as string | null,
    deedNumber: null as string | null,
    ministryDecreeNumber: null as string | null,
    establishedOn: null as Date | null,
    pphFinalUmkm: false,
    pphFinalUmkmStartYear: null as number | null,
  } as Record<string, unknown> & { id: number },
}));
const writeAuditLog = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySetting: {
      findFirst: async () => ({ ...row.current }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row.current, data);
        return row.current;
      },
    },
  },
}));
vi.mock("@/lib/auth-guard", () => ({
  requireApiPermission: async () => ({ authorized: true, session: { user: { id: "5", name: "Pemilik", role: "managing_director" } } }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog }));
vi.mock("@sai/platform/i18n/server", () => ({ getRequestI18n: async () => ({ dictionary: null, t: (k: string) => k }) }));
vi.mock("@/lib/legal-form-server", () => ({ getCompanyLegalForm: async () => "cv" }));

const route = await import("@/app/api/company-settings/business-profile/route");
const put = (body: unknown) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });

describe("PUT /api/company-settings/business-profile", () => {
  beforeEach(() => writeAuditLog.mockClear());

  it("menyalakan PPh Final: tersimpan + jejak sebelum/sesudah", async () => {
    const res = await route.PUT(put({ pphFinal: { enabled: true, startYear: 2024 } }));
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ pphFinalUmkm: true, pphFinalUmkmStartYear: 2024 });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company_setting.pph_final.update",
        details: { before: { enabled: false, startYear: null }, after: { enabled: true, startYear: 2024 } },
      })
    );
  });

  it("identitas: tanggal pendirian disimpan sebagai tanggal, jejak terpisah", async () => {
    const res = await route.PUT(put({ identity: { nib: "1234567890123", establishedOn: "2021-03-04" } }));
    const body = await res.json();
    expect(body.profile).toMatchObject({ nib: "1234567890123", establishedOn: "2021-03-04" });
    expect(writeAuditLog.mock.calls.map((c) => c[0].action)).toEqual(["company_setting.identity.update"]);
  });
});
