/**
 * Minggu / Bulan / Tahun for Kartu Stok (issue #126).
 *
 * Weeks are the only genuinely new calendar logic in this codebase, and they are
 * where the bugs live: the turn of the year, month boundaries that fall
 * mid-week, and the "week 53" years. Those are pinned by example against the
 * ISO-8601 definition rather than against the implementation's own arithmetic.
 *
 * The second promise is that a bad URL can never poison a report. Every reader
 * downstream multiplies and sums these bounds, so an `Invalid Date` would not
 * throw — it would quietly produce an empty report that looks like a business
 * with no stock. Every malformed input below must land on a real period instead.
 */
import { describe, it, expect } from "vitest";
import {
  resolveStockPeriod,
  isoWeekNumber,
  startOfISOWeek,
  isStockPeriodGranularity,
} from "@/lib/stock-period";

const D = (iso: string) => new Date(`${iso}T12:00:00`);
/** The bounds as plain ISO dates — what the assertions below actually care about. */
const bounds = (p: { fromISO: string; toISO: string }) => [p.fromISO, p.toISO];

describe("startOfISOWeek — Monday starts the week", () => {
  it("maps every day of one week back to the same Monday", () => {
    // Mon 2026-07-27 … Sun 2026-08-02
    for (const day of ["2026-07-27", "2026-07-28", "2026-07-31", "2026-08-01", "2026-08-02"]) {
      expect(startOfISOWeek(D(day)).getDate()).toBe(27);
      expect(startOfISOWeek(D(day)).getMonth()).toBe(6); // July
    }
  });

  it("treats Sunday as the END of a week, not the start", () => {
    // The most common off-by-one: JS getDay() calls Sunday 0.
    const sunday = D("2026-08-02");
    expect(startOfISOWeek(sunday).getDate()).toBe(27);
  });
});

describe("isoWeekNumber — ISO-8601, anchored on Thursday", () => {
  it("puts 4 January in week 1 every year, by definition", () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      expect(isoWeekNumber(D(`${year}-01-04`))).toBe(1);
    }
  });

  it("gives 1 Jan 2026 week 1 — its week contains a Thursday in 2026", () => {
    // 2026-01-01 is a Thursday, so its week is week 1 of 2026.
    expect(isoWeekNumber(D("2026-01-01"))).toBe(1);
  });

  it("gives 1 Jan 2023 week 52 — it belongs to the PREVIOUS year's last week", () => {
    // 2023-01-01 is a Sunday; its Monday is 2022-12-26, whose Thursday is in 2022.
    // Counting days-since-January would wrongly call this week 1.
    expect(isoWeekNumber(D("2023-01-01"))).toBe(52);
  });

  it("gives 31 Dec 2025 week 1 — it belongs to the NEXT year's first week", () => {
    // 2025-12-31 is a Wednesday whose week's Thursday is 2026-01-01.
    expect(isoWeekNumber(D("2025-12-31"))).toBe(1);
  });

  it("recognises a 53-week year", () => {
    // 2020 is a long year: 2020-12-31 falls in week 53.
    expect(isoWeekNumber(D("2020-12-31"))).toBe(53);
  });
});

describe("resolveStockPeriod — bounds per granularity", () => {
  it("widens a week to Monday–Sunday, inclusive", () => {
    const p = resolveStockPeriod("week", "2026-07-30");
    expect(bounds(p)).toEqual(["2026-07-27", "2026-08-02"]);
    expect(p.weekNumber).toBe(31);
    expect(p.from.getHours()).toBe(0);
    expect(p.to.getHours()).toBe(23);
    expect(p.to.getMilliseconds()).toBe(999);
  });

  it("widens a week that straddles a month end without clipping it", () => {
    // The week must not stop at the month boundary — that would drop three days
    // of movement from the report while still calling itself a week.
    const p = resolveStockPeriod("week", "2026-08-01");
    expect(bounds(p)).toEqual(["2026-07-27", "2026-08-02"]);
  });

  it("widens a month to its real last day, including February in a leap year", () => {
    expect(bounds(resolveStockPeriod("month", "2026-07-15"))).toEqual(["2026-07-01", "2026-07-31"]);
    expect(bounds(resolveStockPeriod("month", "2026-02-10"))).toEqual(["2026-02-01", "2026-02-28"]);
    expect(bounds(resolveStockPeriod("month", "2024-02-10"))).toEqual(["2024-02-01", "2024-02-29"]);
  });

  it("widens a year to 1 Jan – 31 Dec", () => {
    expect(bounds(resolveStockPeriod("year", "2026-07-15"))).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("uses from/to for a custom range", () => {
    const p = resolveStockPeriod("custom", "2026-07-15", "2026-03-05", "2026-04-20");
    expect(bounds(p)).toEqual(["2026-03-05", "2026-04-20"]);
  });
});

describe("resolveStockPeriod — stepping keeps the anchor meaningful", () => {
  it("steps a week by exactly seven days", () => {
    const p = resolveStockPeriod("week", "2026-07-30");
    expect(p.prevAnchorISO).toBe("2026-07-20");
    expect(p.nextAnchorISO).toBe("2026-08-03");
  });

  it("steps a month across a year boundary", () => {
    const jan = resolveStockPeriod("month", "2026-01-15");
    expect(jan.prevAnchorISO).toBe("2025-12-01");
    const dec = resolveStockPeriod("month", "2026-12-15");
    expect(dec.nextAnchorISO).toBe("2027-01-01");
  });

  it("offers no stepper for a custom range — there is no next range to guess", () => {
    const p = resolveStockPeriod("custom", "2026-07-15", "2026-03-05", "2026-04-20");
    expect(p.prevAnchorISO).toBeNull();
    expect(p.nextAnchorISO).toBeNull();
  });

  it("keeps the anchor when granularity changes, so switching does not lose the place", () => {
    const month = resolveStockPeriod("month", "2026-03-18");
    const week = resolveStockPeriod("week", month.anchorISO);
    expect(week.anchorISO).toBe("2026-03-18");
    expect(bounds(week)).toEqual(["2026-03-16", "2026-03-22"]);
  });
});

describe("resolveStockPeriod — bad input falls back, never poisons", () => {
  const NOW = D("2026-07-15");

  it("falls back to the month containing today when nothing is supplied", () => {
    const p = resolveStockPeriod(undefined, undefined, undefined, undefined, NOW);
    expect(p.granularity).toBe("month");
    expect(bounds(p)).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it.each(["garbage", "2026-13-01", "2026-02-30", "", "2026-7-1"])(
    "falls back to today for the invalid anchor %j",
    (anchor) => {
      const p = resolveStockPeriod("month", anchor, undefined, undefined, NOW);
      expect(bounds(p)).toEqual(["2026-07-01", "2026-07-31"]);
      expect(Number.isNaN(p.from.getTime())).toBe(false);
      expect(Number.isNaN(p.to.getTime())).toBe(false);
    }
  );

  it("falls back to month for an unknown granularity", () => {
    expect(resolveStockPeriod("fortnight", "2026-07-15", undefined, undefined, NOW).granularity).toBe(
      "month"
    );
  });

  it("swaps a reversed custom range rather than reporting nothing", () => {
    const p = resolveStockPeriod("custom", "2026-07-15", "2026-04-20", "2026-03-05");
    expect(bounds(p)).toEqual(["2026-03-05", "2026-04-20"]);
    expect(p.from.getTime()).toBeLessThan(p.to.getTime());
  });

  it("fills a half-supplied custom range from the anchor's month", () => {
    const p = resolveStockPeriod("custom", "2026-07-15", "2026-07-10", undefined);
    expect(bounds(p)).toEqual(["2026-07-10", "2026-07-31"]);
  });

  it("narrows granularity strings safely", () => {
    expect(isStockPeriodGranularity("week")).toBe(true);
    expect(isStockPeriodGranularity("decade")).toBe(false);
  });
});

/**
 * Rentang tanpa granularitas (issue laporan: dialog parameter).
 *
 * Penyaring di halaman selalu mengirim `g`, jadi bawaan "month" tak pernah
 * terlihat salah. Dialog parameter mengirim `?from=&to=` seperti laporan lain —
 * dan tanpa aturan ini pilihan periodenya dibuang tanpa satu pun tanda di layar.
 */
describe("granularitas tersirat dari rentang", () => {
  const now = new Date(2026, 6, 20);

  it("menganggap rentang tanpa `g` sebagai custom", () => {
    const p = resolveStockPeriod(undefined, undefined, "2026-05-01", "2026-05-31", now);
    expect(p.granularity).toBe("custom");
    expect(p.fromISO).toBe("2026-05-01");
    expect(p.toISO).toBe("2026-05-31");
  });

  it("tetap bulan berjalan bila tak ada rentang sama sekali", () => {
    expect(resolveStockPeriod(undefined, undefined, undefined, undefined, now).granularity).toBe(
      "month"
    );
  });

  it("granularitas yang disebut eksplisit tetap menang atas rentangnya", () => {
    expect(resolveStockPeriod("year", undefined, "2026-05-01", "2026-05-31", now).granularity).toBe(
      "year"
    );
  });
});
