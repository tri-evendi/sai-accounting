/**
 * Plain-language dashboard summary helpers (issue #3).
 *
 * Two hazards are worth asserting here, because both fail silently rather than
 * loudly. First, a period that does not survive the round trip into a link and
 * back: the card would show one month and its "Lihat detail" link would open
 * another, which is exactly the traceability the issue demands. Second, the
 * mixed-currency sum — a per-currency breakdown is the natural place to
 * accidentally start adding USD to rupiah, so the tests pin down that a group's
 * total stays IDR base and that a row with no rate is counted, never valued.
 */
import { describe, it, expect } from "vitest";
import { monthRange, summarizeByCurrency, toISODate } from "@/lib/dashboard-summary";

/**
 * How `/reports/income-statement` turns its `?from=&to=` params back into dates.
 * Copied verbatim from that page so the round-trip test is meaningful.
 */
function parseLikeIncomeStatementPage(fromStr: string, toStr: string) {
  return {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59.999`),
  };
}

describe("toISODate", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 6, 20))).toBe("2026-07-20");
  });

  it("zero-pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("keeps the local day late in the evening, where toISOString() would roll over", () => {
    // 23:30 local is already tomorrow in UTC for any positive offset (WIB is +7).
    expect(toISODate(new Date(2026, 6, 20, 23, 30))).toBe("2026-07-20");
  });
});

describe("monthRange — bounds of the calendar month", () => {
  it("spans the first to the last day of the month containing the date", () => {
    const r = monthRange(new Date(2026, 6, 20));
    expect(r.fromISO).toBe("2026-07-01");
    expect(r.toISO).toBe("2026-07-31");
  });

  it("is unchanged whichever day of the month you ask from", () => {
    const first = monthRange(new Date(2026, 6, 1));
    const last = monthRange(new Date(2026, 6, 31));
    expect(first.fromISO).toBe(last.fromISO);
    expect(first.toISO).toBe(last.toISO);
  });

  it("handles a 30-day month", () => {
    expect(monthRange(new Date(2026, 8, 15)).toISO).toBe("2026-09-30");
  });

  it("handles February in a leap year", () => {
    expect(monthRange(new Date(2024, 1, 10)).toISO).toBe("2024-02-29");
  });

  it("handles February in a non-leap year", () => {
    expect(monthRange(new Date(2025, 1, 10)).toISO).toBe("2025-02-28");
  });

  it("does not spill into the next year in December", () => {
    const r = monthRange(new Date(2026, 11, 9));
    expect(r.fromISO).toBe("2026-12-01");
    expect(r.toISO).toBe("2026-12-31");
  });

  it("covers the whole first and last day, not just midnight", () => {
    const r = monthRange(new Date(2026, 6, 20));
    expect(r.from.getHours()).toBe(0);
    expect(r.from.getMinutes()).toBe(0);
    expect(r.to.getHours()).toBe(23);
    expect(r.to.getMinutes()).toBe(59);
    expect(r.to.getMilliseconds()).toBe(999);
  });

  it("round-trips: the link params reproduce the exact dates the card queried", () => {
    // This is the traceability guarantee. If it ever fails, a card and the
    // report behind its link are showing different periods.
    const r = monthRange(new Date(2026, 6, 20));
    const reparsed = parseLikeIncomeStatementPage(r.fromISO, r.toISO);
    expect(reparsed.from.getTime()).toBe(r.from.getTime());
    expect(reparsed.to.getTime()).toBe(r.to.getTime());
  });

  it("labels the month in Indonesian", () => {
    expect(monthRange(new Date(2026, 6, 20)).label).toBe("Juli 2026");
  });
});

describe("summarizeByCurrency — grouping without mixing currencies", () => {
  it("returns nothing for no documents", () => {
    expect(summarizeByCurrency([])).toEqual([]);
  });

  it("groups documents by the currency they were written in", () => {
    const out = summarizeByCurrency([
      { currency: "IDR", outstandingBase: 1_000_000 },
      { currency: "IDR", outstandingBase: 500_000 },
      { currency: "USD", outstandingBase: 16_000_000 },
    ]);
    expect(out).toEqual([
      { currency: "USD", count: 1, outstandingBase: 16_000_000, unresolved: 0 },
      { currency: "IDR", count: 2, outstandingBase: 1_500_000, unresolved: 0 },
    ]);
  });

  it("totals a foreign group in IDR base, never in its own currency", () => {
    // Two USD invoices worth $1,000 each at 16,000: the group total is the IDR
    // value, 32,000,000 — not 2,000. Reporting 2,000 here would be the bug the
    // receivables header exists to prevent.
    const out = summarizeByCurrency([
      { currency: "USD", outstandingBase: 16_000_000 },
      { currency: "USD", outstandingBase: 16_000_000 },
    ]);
    expect(out[0].outstandingBase).toBe(32_000_000);
  });

  it("counts an unrated document but does not fold it into the total", () => {
    const out = summarizeByCurrency([
      { currency: "USD", outstandingBase: 16_000_000 },
      { currency: "USD", outstandingBase: null },
    ]);
    expect(out).toEqual([
      { currency: "USD", count: 2, outstandingBase: 16_000_000, unresolved: 1 },
    ]);
  });

  it("still lists a currency whose documents are all unrated, so it cannot hide", () => {
    const out = summarizeByCurrency([
      { currency: "CNY", outstandingBase: null },
      { currency: "CNY", outstandingBase: null },
    ]);
    expect(out).toEqual([{ currency: "CNY", count: 2, outstandingBase: 0, unresolved: 2 }]);
  });

  it("orders by IDR value, biggest first", () => {
    const out = summarizeByCurrency([
      { currency: "IDR", outstandingBase: 100 },
      { currency: "USD", outstandingBase: 300 },
      { currency: "CNY", outstandingBase: 200 },
    ]);
    expect(out.map((r) => r.currency)).toEqual(["USD", "CNY", "IDR"]);
  });

  it("breaks ties by currency code, so the order is stable between renders", () => {
    const out = summarizeByCurrency([
      { currency: "USD", outstandingBase: 500 },
      { currency: "CNY", outstandingBase: 500 },
      { currency: "IDR", outstandingBase: 500 },
    ]);
    expect(out.map((r) => r.currency)).toEqual(["CNY", "IDR", "USD"]);
  });

  it("rounds away floating-point accumulation error", () => {
    const out = summarizeByCurrency([
      { currency: "IDR", outstandingBase: 0.1 },
      { currency: "IDR", outstandingBase: 0.2 },
    ]);
    expect(out[0].outstandingBase).toBe(0.3);
  });
});
