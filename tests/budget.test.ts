/**
 * Anggaran & Target variance math (issue #29) — the pure helper `@/lib/budget`.
 *
 * The report's accuracy is the acceptance criterion, and all of it lives in this
 * pure module, so the hazards worth pinning are the arithmetic edges: an exact
 * on-budget row must NOT alarm; a zero-budget account with real spend must be
 * flagged WITHOUT dividing by zero; and the over/under alert must key off the
 * threshold band, not the raw sign. Favourability is category-dependent — over on
 * revenue is good, over on expense is bad — so both directions are asserted.
 */
import { describe, it, expect } from "vitest";
import {
  computeVariance,
  classifyVariance,
  isFavorable,
  buildBudgetReport,
  buildTargetRealization,
  sumBudgetsByPeriod,
  DEFAULT_VARIANCE_THRESHOLD_PCT,
  type BudgetPeriodEntry,
} from "@/lib/budget";

describe("computeVariance", () => {
  it("is positive when actual is over budget", () => {
    // budget 1,000,000; actual 1,200,000 → +200,000 = +20%
    expect(computeVariance(1_000_000, 1_200_000)).toEqual({
      variance: 200_000,
      variancePct: 20,
    });
  });

  it("is negative when actual is under budget", () => {
    // budget 1,000,000; actual 750,000 → −250,000 = −25%
    expect(computeVariance(1_000_000, 750_000)).toEqual({
      variance: -250_000,
      variancePct: -25,
    });
  });

  it("is exactly zero on budget", () => {
    expect(computeVariance(500_000, 500_000)).toEqual({ variance: 0, variancePct: 0 });
  });

  it("returns a null percentage for a zero budget (no divide-by-zero)", () => {
    const v = computeVariance(0, 340_000);
    expect(v.variance).toBe(340_000);
    expect(v.variancePct).toBeNull();
  });

  it("rounds to the cent", () => {
    expect(computeVariance(100.005, 200.004)).toEqual({ variance: 100, variancePct: 100 });
  });
});

describe("classifyVariance — over / under / on-target", () => {
  it("flags over when actual exceeds budget beyond the threshold", () => {
    // +20% is beyond the default ±10% band.
    expect(classifyVariance(1_000_000, 1_200_000)).toBe("over");
  });

  it("flags under when actual falls short beyond the threshold", () => {
    // −25% is beyond the band.
    expect(classifyVariance(1_000_000, 750_000)).toBe("under");
  });

  it("is on target exactly on budget", () => {
    expect(classifyVariance(1_000_000, 1_000_000)).toBe("on_target");
  });

  it("is on target inside the threshold band (both sides)", () => {
    // +5% and −5% are within ±10%.
    expect(classifyVariance(1_000_000, 1_050_000)).toBe("on_target");
    expect(classifyVariance(1_000_000, 950_000)).toBe("on_target");
  });

  it("respects a custom threshold", () => {
    // +5% breaches a ±2% band but not the default ±10%.
    expect(classifyVariance(1_000_000, 1_050_000, 2)).toBe("over");
    expect(classifyVariance(1_000_000, 1_050_000)).toBe("on_target");
  });

  it("treats a threshold boundary as still on target (strict > / <)", () => {
    // Exactly +10% is NOT beyond a ±10% band; +10.2% (past the 2-dp rounding) is.
    expect(classifyVariance(1_000_000, 1_100_000, 10)).toBe("on_target");
    expect(classifyVariance(1_000_000, 1_102_000, 10)).toBe("over");
  });

  describe("zero budget", () => {
    it("flags any spend against a zero budget as over", () => {
      expect(classifyVariance(0, 250_000)).toBe("over");
    });

    it("is on target when zero budget meets zero actual", () => {
      expect(classifyVariance(0, 0)).toBe("on_target");
    });

    it("flags a negative actual against a zero budget as under", () => {
      // e.g. a contra-revenue that net-reversed below a zero plan.
      expect(classifyVariance(0, -50_000)).toBe("under");
    });
  });
});

describe("isFavorable — direction depends on category", () => {
  it("revenue over target is favourable, under is not", () => {
    expect(isFavorable("revenue", "over")).toBe(true);
    expect(isFavorable("revenue", "under")).toBe(false);
  });

  it("expense under budget is favourable, over is not", () => {
    expect(isFavorable("expense", "under")).toBe(true);
    expect(isFavorable("expense", "over")).toBe(false);
  });

  it("on target is neither (null)", () => {
    expect(isFavorable("revenue", "on_target")).toBeNull();
    expect(isFavorable("expense", "on_target")).toBeNull();
  });
});

describe("buildBudgetReport", () => {
  it("classifies each row, sorts by code, and totals plan vs actual", () => {
    const { rows, totals } = buildBudgetReport([
      { code: "6101", name: "Beban Operasional", category: "expense", budget: 1_000_000, actual: 1_300_000 },
      { code: "4101", name: "Penjualan", category: "revenue", budget: 2_000_000, actual: 2_400_000 },
      { code: "6102", name: "Beban Sewa", category: "expense", budget: 500_000, actual: 500_000 },
    ]);

    // sorted by code
    expect(rows.map((r) => r.code)).toEqual(["4101", "6101", "6102"]);

    const sales = rows.find((r) => r.code === "4101")!;
    expect(sales.status).toBe("over");
    expect(sales.favorable).toBe(true); // beating a sales target is good
    expect(sales.alert).toBe(true);

    const opex = rows.find((r) => r.code === "6101")!;
    expect(opex.status).toBe("over");
    expect(opex.favorable).toBe(false); // overspending is bad
    expect(opex.alert).toBe(true);

    const rent = rows.find((r) => r.code === "6102")!;
    expect(rent.status).toBe("on_target");
    expect(rent.favorable).toBeNull();
    expect(rent.alert).toBe(false);

    expect(totals.budget).toBe(3_500_000);
    expect(totals.actual).toBe(4_200_000);
    expect(totals.variance).toBe(700_000);
    expect(totals.alertCount).toBe(2);
  });

  it("handles an empty input", () => {
    const { rows, totals } = buildBudgetReport([]);
    expect(rows).toEqual([]);
    expect(totals).toEqual({
      budget: 0,
      actual: 0,
      variance: 0,
      variancePct: null,
      alertCount: 0,
    });
  });

  it("flags a zero-budget account that had actual spend", () => {
    const { rows } = buildBudgetReport([
      { code: "6103", name: "Beban tak dianggarkan", category: "expense", budget: 0, actual: 90_000 },
    ]);
    expect(rows[0].status).toBe("over");
    expect(rows[0].variancePct).toBeNull();
    expect(rows[0].favorable).toBe(false);
    expect(rows[0].alert).toBe(true);
  });
});

describe("sumBudgetsByPeriod — period filtering", () => {
  const entries: BudgetPeriodEntry[] = [
    { accountCode: "6101", year: 2026, month: 1, amount: 100 },
    { accountCode: "6101", year: 2026, month: 2, amount: 150 },
    { accountCode: "4101", year: 2026, month: 1, amount: 500 },
    { accountCode: "6101", year: 2025, month: 1, amount: 999 }, // different year
  ];

  it("filters to a single month", () => {
    const jan = sumBudgetsByPeriod(entries, 2026, 1);
    expect(jan.get("6101")).toBe(100);
    expect(jan.get("4101")).toBe(500);
    expect(jan.size).toBe(2);
  });

  it("sums every month of the year when month is omitted", () => {
    const year = sumBudgetsByPeriod(entries, 2026);
    expect(year.get("6101")).toBe(250); // Jan 100 + Feb 150
    expect(year.get("4101")).toBe(500);
  });

  it("ignores entries from other years", () => {
    const year = sumBudgetsByPeriod(entries, 2026);
    expect(year.get("6101")).toBe(250); // the 2025 row (999) is excluded
    const y2025 = sumBudgetsByPeriod(entries, 2025);
    expect(y2025.get("6101")).toBe(999);
  });

  it("returns an empty map for a period with no entries", () => {
    expect(sumBudgetsByPeriod(entries, 2024).size).toBe(0);
  });
});

describe("buildTargetRealization", () => {
  it("marks a beaten sales target as favourable over", () => {
    const row = buildTargetRealization({ target: 10_000_000, actual: 12_000_000 });
    expect(row.status).toBe("over");
    expect(row.favorable).toBe(true);
    expect(row.variance).toBe(2_000_000);
    expect(row.variancePct).toBe(20);
  });

  it("marks a missed sales target as unfavourable under", () => {
    const row = buildTargetRealization({ target: 10_000_000, actual: 8_000_000 });
    expect(row.status).toBe("under");
    expect(row.favorable).toBe(false);
  });

  it("uses the default threshold", () => {
    // A ±10% band means 9,500,000 against 10,000,000 (−5%) is on target.
    const row = buildTargetRealization({ target: 10_000_000, actual: 9_500_000 });
    expect(row.status).toBe("on_target");
    expect(DEFAULT_VARIANCE_THRESHOLD_PCT).toBe(10);
  });
});
