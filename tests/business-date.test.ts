/** Batas hari laporan mengikuti jam Jakarta, apa pun zona waktu prosesnya. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { businessDayEnd, businessDayStart, businessISODate } from "@sai/core/business-date";
import { resolveAsOf, resolvePeriod } from "@/lib/report-catalog";
import { monthRange } from "@/lib/dashboard-summary";

describe("tanggal bisnis = jam Jakarta (WIB, UTC+7)", () => {
  it("awal dan akhir hari ber-offset +07:00", () => {
    expect(businessDayStart("2026-06-30").toISOString()).toBe("2026-06-29T17:00:00.000Z");
    expect(businessDayEnd("2026-06-30").toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });

  it("tanggal hari ini berganti pukul 00.00 WIB, bukan 00.00 UTC", () => {
    expect(businessISODate(new Date("2026-06-30T16:59:59.999Z"))).toBe("2026-06-30");
    expect(businessISODate(new Date("2026-06-30T17:00:00.000Z"))).toBe("2026-07-01");
  });

  it("per tanggal dan periode laporan memakai batas Jakarta", () => {
    expect(resolveAsOf("2026-06-30").asOf.toISOString()).toBe("2026-06-30T16:59:59.999Z");
    expect(resolveAsOf(undefined, new Date("2026-06-30T18:00:00Z")).asOfISO).toBe("2026-07-01");
    const p = resolvePeriod("2026-01-01", "2026-06-30");
    expect(p.from.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });

  it("bulan berjalan beranda mengikuti tanggal Jakarta", () => {
    const r = monthRange(new Date("2026-06-30T18:00:00Z")); // 1 Juli 01.00 WIB
    expect(r.fromISO).toBe("2026-07-01");
    expect(r.toISO).toBe("2026-07-31");
    expect(r.to.toISOString()).toBe("2026-07-31T16:59:59.999Z");
  });

  it("formulir penjualan, pembelian, dan stok tidak memakai tanggal UTC sebagai bawaan", () => {
    const D = join(__dirname, "..", "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]");
    for (const f of ["sales/new/sales-wizard.tsx", "purchases/new/purchase-wizard.tsx", "inventory/update/stock-form.tsx"]) {
      const src = readFileSync(join(D, f), "utf8");
      expect(src, f).toContain("businessISODate(new Date())");
      expect(src, f).not.toMatch(/todayISO[^\n]*toISOString\(\)/);
    }
  });
});
