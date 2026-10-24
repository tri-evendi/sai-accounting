/**
 * TENANT DEMO (alur demo-first, 24 Okt 2026) — pagar `demo:seed`/`demo:reset`.
 *
 * Yang berbahaya dari skrip demo bukan angka contohnya, melainkan kemungkinan
 * ia MENGISI atau MENGOSONGKAN buku tenant sungguhan. Pagarnya keputusan murni
 * (`demoSeedRefusal`), dan skripnya diperiksa dari SUMBERNYA — mengimpornya akan
 * menjalankan `main()` (gaya `tests/seed-demo.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEMO_COMPANIES,
  demoDate,
  demoFiscalYearStart,
  demoSeedRefusal,
} from "@sai/core/demo-tenant";
import { businessISODate } from "@sai/core/business-date";

const root = join(__dirname, "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = readFileSync(join(root, "scripts", "demo-seed.ts"), "utf8");
const code = strip(src);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("demoSeedRefusal — hanya tenant DEMO yang boleh diisi/dikosongkan", () => {
  const demo = { slug: "demo-andalas", isDemo: true, status: "active" };

  it("tenant tak dikenal / bukan demo DITOLAK, apa pun statusnya", () => {
    expect(demoSeedRefusal(null, { reset: false, confirm: null })).toBe("not_found");
    for (const status of ["active", "trialing", "trial_ended", "past_due"]) {
      expect(demoSeedRefusal({ ...demo, isDemo: false, status }, { reset: false, confirm: null })).toBe("not_demo");
      expect(
        demoSeedRefusal({ ...demo, isDemo: false, status }, { reset: true, confirm: demo.slug }),
        "konfirmasi yang benar tidak membuka buku tenant sungguhan"
      ).toBe("not_demo");
    }
  });

  it("tenant demo yang berhenti/dihapus/pindah tidak diisi ulang", () => {
    for (const status of ["cancelled", "suspended", "migrated_out", "trial_ended", "pending_verification"]) {
      expect(demoSeedRefusal({ ...demo, status }, { reset: false, confirm: null })).toBe("inactive");
    }
  });

  it("reset menuntut slug yang DIKETIK ULANG persis", () => {
    expect(demoSeedRefusal(demo, { reset: true, confirm: null })).toBe("confirm_mismatch");
    expect(demoSeedRefusal(demo, { reset: true, confirm: "demo" })).toBe("confirm_mismatch");
    expect(demoSeedRefusal(demo, { reset: true, confirm: "demo-andalas" })).toBeNull();
    expect(demoSeedRefusal(demo, { reset: false, confirm: null })).toBeNull();
    expect(demoSeedRefusal({ ...demo, status: "trialing" }, { reset: false, confirm: null })).toBeNull();
  });
});

describe("profil tiga PT contoh", () => {
  it("tiga PT, slug unik, NPWP 16 digit & NITKU 22 digit (bentuk sah Coretax), fiktif berawalan 0099", () => {
    expect(DEMO_COMPANIES).toHaveLength(3);
    expect(new Set(DEMO_COMPANIES.map((c) => c.slug)).size).toBe(3);
    for (const c of DEMO_COMPANIES) {
      expect(c.npwp).toMatch(/^0099\d{12}$/);
      expect(c.nitku).toMatch(/^\d{22}$/);
      for (const cust of c.customers) {
        expect(cust.npwp).toMatch(/^0099\d{12}$/);
        expect(cust.nitku).toBe(`${cust.npwp}000000`);
      }
      for (const it of c.items) expect(it.price).toBeGreaterThan(it.unitCost);
    }
  });

  it("bulan contoh = bulan PENUH sebelum hari ini (kalender Jakarta), hari dipotong ke akhir bulan", () => {
    const today = new Date("2026-10-24T05:00:00Z");
    expect(businessISODate(demoDate(today, 5))).toBe("2026-09-05");
    expect(businessISODate(demoDate(today, 31))).toBe("2026-09-30");
    expect(businessISODate(demoDate(new Date("2026-01-10T05:00:00Z"), 15))).toBe("2025-12-15");
    expect(businessISODate(demoFiscalYearStart(today))).toBe("2026-01-01");
  });
});

describe("scripts/demo-seed.ts — pagar baris perintah", () => {
  it("menolak lewat demoSeedRefusal SEBELUM menyentuh buku mana pun", () => {
    const refusalAt = code.indexOf("demoSeedRefusal(tenant");
    expect(refusalAt).toBeGreaterThan(-1);
    expect(code.indexOf("runWithCompany(")).toBeGreaterThan(refusalAt);
    expect(code.indexOf("provisionCompany(tenant.slug")).toBeGreaterThan(refusalAt);
  });

  it("tenant WAJIB disebut; tidak ada mode semua-tenant dan tidak ada --force", () => {
    expect(src).toContain("Sebutkan tenant demonya");
    expect(code.toLowerCase()).not.toContain("--all");
    expect(code).not.toContain("--force");
  });

  it("hanya PT milik tenant itu (tenantId + slug profil) yang dibuka", () => {
    expect(code).toMatch(/where: \{ tenantId: tenant\.id, slug: profile\.slug \}/);
  });

  it("TRUNCATE hanya di jalur --reset dan riwayat migration dipertahankan", () => {
    expect(code).toContain("tablename <> '_prisma_migrations'");
    const truncateCall = code.indexOf("await truncateBook()");
    expect(truncateCall).toBeGreaterThan(-1);
    expect(code.lastIndexOf("if (args.reset)", truncateCall)).toBeGreaterThan(-1);
  });

  it("deterministik — tanpa Math.random", () => {
    expect(code).not.toContain("Math.random");
  });

  it("package.json: demo:seed & demo:reset berdomain, memakai --conditions=react-server", () => {
    expect(pkg.scripts["demo:seed"]).toContain("scripts/demo-seed.ts");
    expect(pkg.scripts["demo:seed"]).toContain("--conditions=react-server");
    expect(pkg.scripts["demo:reset"]).toContain("scripts/demo-seed.ts --reset");
  });
});
