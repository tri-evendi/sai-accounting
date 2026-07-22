/**
 * Report catalogue + parameter validation (issue #19).
 *
 * Two things must hold. First, the catalogue is honest: an `available` report
 * always has a link, a `coming_soon` one never does, and ids are unique — a
 * broken link or a "ready" report with nowhere to go is exactly the dishonesty
 * the coming-soon state exists to avoid. Second, parameter parsing rejects
 * non-dates (`2026-02-30`, `garbage`, empty) and falls back to a sensible
 * default, so a hand-edited URL can never hand a reader an Invalid Date that
 * would poison every figure.
 */
import { describe, it, expect } from "vitest";
import {
  REPORTS,
  REPORT_CATEGORIES,
  reportsByCategory,
  isReportCategory,
  isValidISODate,
  resolvePeriod,
  resolveAsOf,
} from "@/lib/report-catalog";
import { toISODate } from "@/lib/dashboard-summary";

describe("catalogue integrity", () => {
  it("covers the six issue categories, in order", () => {
    expect([...REPORT_CATEGORIES]).toEqual([
      "keuangan",
      "penjualan",
      "pembelian",
      "stok",
      "kas_bank",
      "pajak",
    ]);
  });

  it("groups every report under exactly one known category", () => {
    const groups = reportsByCategory();
    expect(groups).toHaveLength(6);
    const grouped = groups.flatMap((g) => g.reports);
    expect(grouped).toHaveLength(REPORTS.length);
    for (const r of REPORTS) expect(isReportCategory(r.category)).toBe(true);
  });

  it("gives every available report a link and every coming-soon report none", () => {
    for (const r of REPORTS) {
      if (r.status === "available") expect(r.href, r.id).toBeTruthy();
      else expect(r.href, r.id).toBeUndefined();
    }
  });

  it("has unique report ids", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects an unknown category name", () => {
    expect(isReportCategory("keuangan")).toBe(true);
    expect(isReportCategory("marketing")).toBe(false);
  });
});

describe("isValidISODate", () => {
  it("accepts a real date", () => {
    expect(isValidISODate("2026-07-20")).toBe(true);
  });

  it("rejects an impossible day, which Date would silently roll forward", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("rejects unpadded, empty and non-date strings", () => {
    expect(isValidISODate("2026-7-1")).toBe(false);
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate("garbage")).toBe(false);
  });
});

describe("resolvePeriod", () => {
  const now = new Date(2026, 6, 20); // 20 Jul 2026

  it("defaults to year-to-date when no params are given", () => {
    const p = resolvePeriod(undefined, undefined, now);
    expect(p.fromISO).toBe("2026-01-01");
    expect(p.toISO).toBe("2026-07-20");
  });

  it("uses valid params and round-trips them to the exact Date bounds", () => {
    const p = resolvePeriod("2026-03-01", "2026-03-31", now);
    expect(p.fromISO).toBe("2026-03-01");
    expect(p.toISO).toBe("2026-03-31");
    expect(toISODate(p.from)).toBe("2026-03-01");
    expect(toISODate(p.to)).toBe("2026-03-31");
    expect(p.to.getHours()).toBe(23);
    expect(p.to.getMilliseconds()).toBe(999);
  });

  it("falls back to the default for an invalid date instead of Invalid Date", () => {
    const p = resolvePeriod("2026-02-30", "nope", now);
    expect(p.fromISO).toBe("2026-01-01");
    expect(p.toISO).toBe("2026-07-20");
    expect(Number.isNaN(p.from.getTime())).toBe(false);
    expect(Number.isNaN(p.to.getTime())).toBe(false);
  });
});

describe("resolveAsOf", () => {
  const now = new Date(2026, 6, 20);

  it("defaults to today", () => {
    expect(resolveAsOf(undefined, now).asOfISO).toBe("2026-07-20");
  });

  it("uses a valid date as an end-of-day bound", () => {
    const r = resolveAsOf("2026-05-15", now);
    expect(r.asOfISO).toBe("2026-05-15");
    expect(toISODate(r.asOf)).toBe("2026-05-15");
    expect(r.asOf.getHours()).toBe(23);
  });

  it("falls back to today for an invalid date", () => {
    expect(resolveAsOf("2026-02-30", now).asOfISO).toBe("2026-07-20");
  });
});
