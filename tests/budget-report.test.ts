/**
 * Realisasi vs Anggaran assembly (issue #29) — `@/lib/budget-report`.
 *
 * The binding acceptance criterion is that "actual" reconciles with the P&L.
 * These tests drive the assembly through the SAME read-side fake the report
 * modules use (`createFakeReportClient`) over ONE seed of journals, then assert
 * that the realisation the budget report shows is byte-for-byte the figure
 * `getIncomeStatement` derives from those journals — proving there is no second
 * aggregator that could drift from the income statement.
 */
import { describe, it, expect } from "vitest";
import { createFakeReportClient, type FakeAccount, type FakeSeedJournal } from "./fake-client";
import { getIncomeStatement } from "@/lib/reports";
import {
  getBudgetReport,
  getSalesTargetRealization,
  getActualsByCode,
} from "@/lib/budget-report";
import { DEFAULT_VARIANCE_THRESHOLD_PCT } from "@/lib/budget";

const ACCOUNTS: FakeAccount[] = [
  { id: 1, code: "1101", name: "Kas", type: "cash_bank" },
  { id: 2, code: "4101", name: "Penjualan", type: "revenue" },
  { id: 3, code: "6101", name: "Beban Operasional", type: "expense" },
  { id: 4, code: "6102", name: "Beban Sewa", type: "expense" },
];

// March 2026: one sale of 12,000,000 and one opex of 1,300,000.
const JOURNALS: FakeSeedJournal[] = [
  {
    date: new Date("2026-03-10"),
    lines: [
      { accountId: 1, debit: 12_000_000 },
      { accountId: 2, credit: 12_000_000 },
    ],
  },
  {
    date: new Date("2026-03-15"),
    lines: [
      { accountId: 3, debit: 1_300_000 },
      { accountId: 1, credit: 1_300_000 },
    ],
  },
];

/** A client whose journal/account reads come from the report fake, plus in-memory
 *  budgets/targets. `account.findMany` honours the `id.in` / `type` filters that
 *  budget-report relies on (the report fake alone ignores `where`). */
function fakeClient(opts: {
  budgets?: { accountId: number; year: number; month: number; amount: number }[];
  salesTargets?: { year: number; month: number; amount: number }[];
}) {
  const report = createFakeReportClient({ accounts: ACCOUNTS, journals: JOURNALS });
  const budgets = opts.budgets ?? [];
  const salesTargets = opts.salesTargets ?? [];

  const inPeriod = (row: { year: number; month: number }, where: { year: number; month?: number }) =>
    row.year === where.year && (where.month === undefined || row.month === where.month);

  return {
    journalLine: (report as unknown as { journalLine: unknown }).journalLine,
    account: {
      findMany: async (args?: { where?: { id?: { in: number[] }; type?: string } }) => {
        const all = await report.account.findMany();
        let rows = all as unknown as FakeAccount[];
        const ids = args?.where?.id?.in;
        const type = args?.where?.type;
        if (ids) rows = rows.filter((a) => ids.includes(a.id));
        if (type) rows = rows.filter((a) => a.type === type);
        return rows;
      },
    },
    budget: {
      findMany: async ({ where }: { where: { year: number; month?: number } }) =>
        budgets.filter((b) => inPeriod(b, where)),
    },
    salesTarget: {
      findMany: async ({ where }: { where: { year: number; month?: number } }) =>
        salesTargets.filter((t) => inPeriod(t, where)),
    },
  } as unknown as typeof import("@/lib/prisma").prisma;
}

describe("getActualsByCode reuses the income statement", () => {
  it("returns exactly the P&L amounts per code for the month", async () => {
    const client = fakeClient({});
    const actuals = await getActualsByCode(2026, 3, client);
    const is = await getIncomeStatement(
      new Date(2026, 2, 1, 0, 0, 0, 0),
      new Date(2026, 2, 31, 23, 59, 59, 999),
      client
    );

    // Same numbers the Laba/Rugi shows — not a re-aggregation.
    expect(actuals.get("4101")).toBe(is.revenue.find((l) => l.code === "4101")!.amount);
    expect(actuals.get("6101")).toBe(is.expense.find((l) => l.code === "6101")!.amount);
    expect(actuals.get("4101")).toBe(12_000_000);
    expect(actuals.get("6101")).toBe(1_300_000);
  });
});

describe("getBudgetReport", () => {
  it("compares each budgeted account against its realised P&L figure", async () => {
    const client = fakeClient({
      budgets: [
        { accountId: 2, year: 2026, month: 3, amount: 10_000_000 }, // Penjualan
        { accountId: 3, year: 2026, month: 3, amount: 1_000_000 }, // Beban Operasional
      ],
    });

    const { report, hasBudgets } = await getBudgetReport(
      2026,
      3,
      DEFAULT_VARIANCE_THRESHOLD_PCT,
      client
    );
    expect(hasBudgets).toBe(true);

    const sales = report.rows.find((r) => r.code === "4101")!;
    expect(sales.budget).toBe(10_000_000);
    expect(sales.actual).toBe(12_000_000);
    expect(sales.variance).toBe(2_000_000);
    expect(sales.status).toBe("over");
    expect(sales.favorable).toBe(true); // beat the revenue plan

    const opex = report.rows.find((r) => r.code === "6101")!;
    expect(opex.budget).toBe(1_000_000);
    expect(opex.actual).toBe(1_300_000);
    expect(opex.status).toBe("over");
    expect(opex.favorable).toBe(false); // overspent

    // Only the two budgeted accounts appear — a non-budgeted P&L account (6102)
    // is not conjured into the report.
    expect(report.rows.map((r) => r.code).sort()).toEqual(["4101", "6101"]);
  });

  it("shows a budgeted account with no activity as fully under budget", async () => {
    const client = fakeClient({
      budgets: [{ accountId: 4, year: 2026, month: 3, amount: 800_000 }], // Beban Sewa, no journal
    });
    const { report } = await getBudgetReport(2026, 3, DEFAULT_VARIANCE_THRESHOLD_PCT, client);
    const rent = report.rows.find((r) => r.code === "6102")!;
    expect(rent.actual).toBe(0);
    expect(rent.variance).toBe(-800_000);
    expect(rent.status).toBe("under");
    expect(rent.favorable).toBe(true); // spent nothing against an expense budget
  });

  it("reports no budgets for an empty period", async () => {
    const client = fakeClient({});
    const { hasBudgets, report } = await getBudgetReport(
      2026,
      3,
      DEFAULT_VARIANCE_THRESHOLD_PCT,
      client
    );
    expect(hasBudgets).toBe(false);
    expect(report.rows).toEqual([]);
  });

  it("sums monthly plans for a whole-year view", async () => {
    const client = fakeClient({
      budgets: [
        { accountId: 2, year: 2026, month: 3, amount: 4_000_000 },
        { accountId: 2, year: 2026, month: 4, amount: 5_000_000 },
      ],
    });
    // No month → whole year; the two monthly plans collapse to one 9,000,000 figure.
    const { report } = await getBudgetReport(2026, undefined, DEFAULT_VARIANCE_THRESHOLD_PCT, client);
    const sales = report.rows.find((r) => r.code === "4101")!;
    expect(sales.budget).toBe(9_000_000);
    expect(sales.actual).toBe(12_000_000); // all-year actual sales
  });
});

describe("getSalesTargetRealization", () => {
  it("compares total targets against actual net sales from the P&L", async () => {
    const client = fakeClient({
      salesTargets: [{ year: 2026, month: 3, amount: 10_000_000 }],
    });
    const result = await getSalesTargetRealization(
      2026,
      3,
      DEFAULT_VARIANCE_THRESHOLD_PCT,
      client
    );
    expect(result.hasTargets).toBe(true);
    expect(result.totalTarget).toBe(10_000_000);
    expect(result.actualSales).toBe(12_000_000); // revenue-type accounts only
    expect(result.row.status).toBe("over");
    expect(result.row.favorable).toBe(true);
    expect(result.row.variance).toBe(2_000_000);
  });

  it("has no targets when none are set", async () => {
    const client = fakeClient({});
    const result = await getSalesTargetRealization(
      2026,
      3,
      DEFAULT_VARIANCE_THRESHOLD_PCT,
      client
    );
    expect(result.hasTargets).toBe(false);
    expect(result.totalTarget).toBe(0);
  });
});
