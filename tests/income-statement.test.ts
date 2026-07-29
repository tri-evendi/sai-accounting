/**
 * Laba/Rugi bertingkat — the multi-step income statement (issue #123).
 *
 * Two kinds of promise are tested here, and they fail in different ways:
 *
 *  1. **The banding rule is TOTAL over P&L accounts.** Every account whose
 *     category is revenue or expense must land in exactly one band. If it did
 *     not, the report would keep showing the right net income while quietly
 *     dropping a line from the breakdown above it — a statement that no longer
 *     adds up, which is far harder to notice than a wrong total.
 *
 *  2. **The stepped view and the flat view are ONE addition, not two.** Sections
 *     regroup the same lines the flat `revenue`/`expense` arrays carry, so
 *     Σ bands must equal Σ flat, and the ladder (Penjualan − HPP = Laba Kotor,
 *     − Beban Operasional = Laba Usaha, ± lain-lain = Laba Bersih) must land on
 *     the same `netIncome` as `totalRevenue − totalExpense`. `budget-report.ts`
 *     still reads the flat arrays, so the two really are consumed side by side.
 *
 * Everything runs on the in-memory read fake, so the figures asserted below are
 * derived from seeded journal lines rather than from the reader's own arithmetic.
 */
import { describe, it, expect } from "vitest";
import { createFakeReportClient, type FakeSeedJournal } from "./fake-client";
import { getIncomeStatement, incomeStatementSectionFor } from "@/lib/reports";
import { ACCOUNT_TYPES, accountCategoryFor } from "@/lib/accounting";
import { grossMarginPct, incomeStatementLayout } from "@/lib/statement-layout";

const KAS = 1;
const PIUTANG = 2;
const PENJUALAN = 3;
const RETUR_PENJUALAN = 4;
const HPP = 5;
const BEBAN_GAJI = 6;
const BEBAN_SEWA = 7;
const PENDAPATAN_BUNGA = 8;
const BEBAN_BUNGA = 9;

const ACCOUNTS = [
  { id: KAS, code: "1101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: PIUTANG, code: "1201", name: "Piutang Usaha", type: "account_receivable", normalBalance: "debit" },
  { id: PENJUALAN, code: "4101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  // A contra-revenue account: revenue-category, but it normally carries a debit.
  { id: RETUR_PENJUALAN, code: "4901", name: "Retur Penjualan", type: "revenue", normalBalance: "debit" },
  { id: HPP, code: "5101", name: "Beban Pokok Penjualan", type: "cogs", normalBalance: "debit" },
  { id: BEBAN_GAJI, code: "6101", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  { id: BEBAN_SEWA, code: "6102", name: "Beban Sewa", type: "expense", normalBalance: "debit" },
  { id: PENDAPATAN_BUNGA, code: "7101", name: "Pendapatan Bunga", type: "other_income", normalBalance: "credit" },
  { id: BEBAN_BUNGA, code: "7201", name: "Beban Bunga", type: "other_expense", normalBalance: "debit" },
];

const CABANG = 11; // a cost centre id

const D = (s: string) => new Date(`${s}T10:00:00`);

/** One trading month, one account per band, plus a sales return to net out. */
const JOURNALS: FakeSeedJournal[] = [
  { date: D("2026-03-01"), lines: [{ accountId: PIUTANG, debit: 1_000_000 }, { accountId: PENJUALAN, credit: 1_000_000 }] },
  { date: D("2026-03-02"), lines: [{ accountId: HPP, debit: 600_000 }, { accountId: KAS, credit: 600_000 }] },
  {
    date: D("2026-03-03"),
    lines: [
      { accountId: BEBAN_GAJI, debit: 150_000, costCenterId: CABANG },
      { accountId: KAS, credit: 150_000, costCenterId: CABANG },
    ],
  },
  { date: D("2026-03-04"), lines: [{ accountId: BEBAN_SEWA, debit: 50_000 }, { accountId: KAS, credit: 50_000 }] },
  { date: D("2026-03-05"), lines: [{ accountId: KAS, debit: 20_000 }, { accountId: PENDAPATAN_BUNGA, credit: 20_000 }] },
  { date: D("2026-03-06"), lines: [{ accountId: BEBAN_BUNGA, debit: 30_000 }, { accountId: KAS, credit: 30_000 }] },
  { date: D("2026-03-07"), lines: [{ accountId: RETUR_PENJUALAN, debit: 100_000 }, { accountId: PIUTANG, credit: 100_000 }] },
  // Next month — must never appear in a March report.
  { date: D("2026-04-01"), lines: [{ accountId: PIUTANG, debit: 777_000 }, { accountId: PENJUALAN, credit: 777_000 }] },
];

const client = createFakeReportClient({ accounts: ACCOUNTS, journals: JOURNALS });
const MARCH = { from: D("2026-03-01"), to: new Date("2026-03-31T23:59:59.999") };

const march = (costCenter?: number) =>
  getIncomeStatement(MARCH.from, MARCH.to, client, costCenter);

// ─── 1. The banding rule ────────────────────────────────────────────────────

describe("incomeStatementSectionFor — the banding rule", () => {
  it("gives EVERY profit-and-loss account type a band", () => {
    for (const t of ACCOUNT_TYPES) {
      const category = accountCategoryFor(t.value);
      if (category !== "revenue" && category !== "expense") continue;
      expect(incomeStatementSectionFor(t.value), `type ${t.value} has no band`).toBeDefined();
    }
  });

  it("puts balance-sheet accounts in no band at all", () => {
    for (const t of ACCOUNT_TYPES) {
      const category = accountCategoryFor(t.value);
      if (category === "revenue" || category === "expense") continue;
      expect(incomeStatementSectionFor(t.value)).toBeUndefined();
    }
  });

  it("names the four special bands and defaults the rest", () => {
    expect(incomeStatementSectionFor("cogs")).toBe("cogs");
    expect(incomeStatementSectionFor("other_income")).toBe("other_income");
    expect(incomeStatementSectionFor("other_expense")).toBe("other_expense");
    expect(incomeStatementSectionFor("revenue")).toBe("sales");
    expect(incomeStatementSectionFor("expense")).toBe("operating_expense");
    // An unknown type is not a P&L account as far as the chart of accounts knows,
    // so it is excluded from the statement entirely — exactly as before.
    expect(incomeStatementSectionFor("mystery_type")).toBeUndefined();
  });
});

// ─── 2. The ladder ──────────────────────────────────────────────────────────

describe("getIncomeStatement — multi-step figures", () => {
  it("nets contra-revenue into Penjualan rather than into Beban", async () => {
    const is = await march();
    expect(is.sales.lines.map((l) => [l.code, l.amount])).toEqual([
      ["4101", 1_000_000],
      ["4901", -100_000], // Retur Penjualan: credit − debit, a revenue-category account
    ]);
    expect(is.sales.total).toBe(900_000);
  });

  it("walks Penjualan → Laba Kotor → Laba Usaha → Laba Bersih", async () => {
    const is = await march();
    expect(is.cogs.total).toBe(600_000);
    expect(is.grossProfit).toBe(300_000); // 900.000 − 600.000
    expect(is.operatingExpense.lines.map((l) => l.code)).toEqual(["6101", "6102"]);
    expect(is.operatingExpense.total).toBe(200_000);
    expect(is.operatingProfit).toBe(100_000); // 300.000 − 200.000
    expect(is.otherIncome.total).toBe(20_000);
    expect(is.otherExpense.total).toBe(30_000);
    expect(is.netIncome).toBe(90_000); // 100.000 + 20.000 − 30.000
  });

  it("keeps HPP out of Beban Operasional — the whole point of the layout", async () => {
    const is = await march();
    expect(is.operatingExpense.lines.map((l) => l.code)).not.toContain("5101");
    expect(is.cogs.lines.map((l) => l.code)).toEqual(["5101"]);
  });

  it("obeys the period bounds", async () => {
    const is = await march();
    // April's 777.000 sale must not reach a March report.
    expect(is.sales.total).toBe(900_000);
    const both = await getIncomeStatement(D("2026-03-01"), new Date("2026-04-30T23:59:59.999"), client);
    expect(both.sales.total).toBe(1_677_000);
  });

  it("narrows every band to the chosen cost centre (issue #91)", async () => {
    const is = await march(CABANG);
    expect(is.sales.lines).toEqual([]);
    expect(is.cogs.lines).toEqual([]);
    expect(is.operatingExpense.lines.map((l) => l.code)).toEqual(["6101"]);
    expect(is.netIncome).toBe(-150_000);
  });
});

// ─── 3. Stepped and flat are one addition ───────────────────────────────────

describe("getIncomeStatement — the stepped and flat views cannot drift", () => {
  it("regroups exactly the same lines, losing none and inventing none", async () => {
    const is = await march();
    const banded = [
      ...is.sales.lines,
      ...is.cogs.lines,
      ...is.operatingExpense.lines,
      ...is.otherIncome.lines,
      ...is.otherExpense.lines,
    ];
    const flat = [...is.revenue, ...is.expense];
    expect([...banded].sort((a, b) => a.code.localeCompare(b.code))).toEqual(
      [...flat].sort((a, b) => a.code.localeCompare(b.code))
    );
  });

  it("reaches the same net income by the ladder and by the aggregates", async () => {
    const is = await march();
    expect(is.totalRevenue).toBe(is.sales.total + is.otherIncome.total);
    expect(is.totalExpense).toBe(
      is.cogs.total + is.operatingExpense.total + is.otherExpense.total
    );
    expect(is.netIncome).toBe(is.totalRevenue - is.totalExpense);
  });

  it("keeps the flat arrays whole and in account-code order for budget realisation", async () => {
    const is = await march();
    // Flat = by CATEGORY, so other income sits with revenue and other expense
    // with the rest of the costs — unchanged from before the ladder existed,
    // which is what keeps `getActualsByCode` reading every budgeted account.
    expect(is.revenue.map((l) => l.code)).toEqual(["4101", "4901", "7101"]);
    expect(is.expense.map((l) => l.code)).toEqual(["5101", "6101", "6102", "7201"]);
  });
});

// ─── 4. The shape of the printed statement ──────────────────────────────────

describe("incomeStatementLayout — which bands get printed", () => {
  const band = (n: number) => ({ lines: Array.from({ length: n }, () => ({})), total: 0 });

  it("shows the full ladder when every band has lines", () => {
    expect(
      incomeStatementLayout({ cogs: band(1), otherIncome: band(1), otherExpense: band(1) })
    ).toEqual({
      showCogs: true,
      showGrossProfit: true,
      showOtherIncome: true,
      showOtherExpense: true,
      showOperatingProfit: true,
    });
  });

  it("collapses to a single-step statement for a business with no HPP and no lain-lain", () => {
    // Laba Kotor would restate total revenue and Laba Usaha would restate the net
    // result — a subtotal that repeats the row above teaches readers to skip
    // subtotals. So a service company sees the report exactly as it was before.
    const layout = incomeStatementLayout({
      cogs: band(0),
      otherIncome: band(0),
      otherExpense: band(0),
    });
    expect(layout.showGrossProfit).toBe(false);
    expect(layout.showOperatingProfit).toBe(false);
  });

  it("still shows Laba Usaha when only ONE of the lain-lain bands has lines", () => {
    expect(
      incomeStatementLayout({ cogs: band(0), otherIncome: band(1), otherExpense: band(0) })
        .showOperatingProfit
    ).toBe(true);
  });

  it("matches the real reader's output for the seeded trading month", async () => {
    const is = await march();
    expect(incomeStatementLayout(is).showGrossProfit).toBe(true);
    expect(incomeStatementLayout(is).showOperatingProfit).toBe(true);
  });
});

describe("grossMarginPct", () => {
  it("expresses gross profit as a percentage of revenue", async () => {
    const is = await march();
    expect(grossMarginPct(is.grossProfit, is.sales.total)).toBeCloseTo(33.333, 3);
  });

  it("returns null rather than 0% when there was no revenue to have a margin on", () => {
    expect(grossMarginPct(0, 0)).toBeNull();
    expect(grossMarginPct(-500_000, 0)).toBeNull();
  });

  it("reports a negative margin when cost of goods exceeded revenue", () => {
    expect(grossMarginPct(-250_000, 1_000_000)).toBe(-25);
  });
});
