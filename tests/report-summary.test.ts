/**
 * Plain-language report summaries (issue #19).
 *
 * The guarantee under test is the one the issue cares about: the friendly
 * sentence and its figure cards are DERIVED from the very totals the report
 * shows, never recomputed. So every test hands in a report result and asserts the
 * summary's amounts are the *same numbers* — a summary that quietly disagreed
 * with the table above it would be the whole bug. The narrative wording
 * (untung/rugi/impas, bertambah/berkurang) is checked too, since that is the part
 * a lay owner actually reads.
 */
import { describe, it, expect } from "vitest";
import {
  incomeStatementSummary,
  balanceSheetSummary,
  cashFlowSummary,
} from "@/lib/report-summary";

describe("incomeStatementSummary — derived from the P&L totals", () => {
  const is = { totalRevenue: 1_734_568, totalExpense: 400_000, netIncome: 1_334_568 };

  it("uses the exact revenue, expense and net figures from the report", () => {
    const s = incomeStatementSummary(is, "Juli 2026");
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Uang Masuk"].amount).toBe(is.totalRevenue);
    expect(byTitle["Uang Keluar"].amount).toBe(is.totalExpense);
    expect(byTitle["Selisih (Untung / Rugi)"].amount).toBe(Math.abs(is.netIncome));
  });

  it("reads a positive net as untung, green/profit direction", () => {
    const s = incomeStatementSummary(is, "Juli 2026");
    expect(s.narrative).toContain("untung");
    expect(s.cards.find((c) => c.title.startsWith("Selisih"))!.direction).toBe("profit");
  });

  it("reads a negative net as rugi and reports the absolute amount", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 100_000, totalExpense: 250_000, netIncome: -150_000 },
      "Juli 2026"
    );
    expect(s.narrative).toContain("rugi");
    const selisih = s.cards.find((c) => c.title.startsWith("Selisih"))!;
    expect(selisih.direction).toBe("loss");
    expect(selisih.amount).toBe(150_000);
  });

  it("reads a zero net as impas, not a misleading Rp 0 profit", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 500_000, totalExpense: 500_000, netIncome: 0 },
      "Juli 2026"
    );
    expect(s.narrative).toContain("impas");
  });

  it("treats a sub-cent residue as impas", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 500_000.004, totalExpense: 500_000, netIncome: 0.004 },
      "Juli 2026"
    );
    expect(s.narrative).toContain("impas");
  });
});

describe("balanceSheetSummary — derived from the balance-sheet totals", () => {
  const bs = {
    totalAssets: 9_000_000,
    totalLiabilities: 2_000_000,
    totalEquity: 5_000_000,
    netIncome: 2_000_000,
    balanced: true,
  };

  it("uses assets, liabilities and equity-incl-earnings verbatim", () => {
    const s = balanceSheetSummary(bs, "Per 31 Jul 2026");
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Harta (Aset)"].amount).toBe(bs.totalAssets);
    expect(byTitle["Utang (Liabilitas)"].amount).toBe(bs.totalLiabilities);
    expect(byTitle["Modal (Ekuitas)"].amount).toBe(bs.totalEquity + bs.netIncome);
  });

  it("says the book is balanced when it is", () => {
    expect(balanceSheetSummary(bs, "Per 31 Jul 2026").narrative).toContain("seimbang");
  });

  it("warns when the sheet does not balance", () => {
    const s = balanceSheetSummary({ ...bs, balanced: false }, "Per 31 Jul 2026");
    expect(s.narrative).toContain("periksa jurnal");
  });
});

describe("cashFlowSummary — derived from the cash-flow totals", () => {
  const cf = { openingCash: 1_000_000, closingCash: 1_250_000, netChange: 250_000, reconciled: true };

  it("uses opening, closing and net change verbatim", () => {
    const s = cashFlowSummary(cf, "Juli 2026");
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Kas Awal"].amount).toBe(cf.openingCash);
    expect(byTitle["Kas Akhir"].amount).toBe(cf.closingCash);
    expect(byTitle["Perubahan Kas"].amount).toBe(Math.abs(cf.netChange));
  });

  it("says kas bertambah when cash rose", () => {
    const s = cashFlowSummary(cf, "Juli 2026");
    expect(s.narrative).toContain("bertambah");
    expect(s.cards.find((c) => c.title === "Perubahan Kas")!.direction).toBe("profit");
  });

  it("says kas berkurang when cash fell", () => {
    const s = cashFlowSummary(
      { openingCash: 1_000_000, closingCash: 700_000, netChange: -300_000, reconciled: true },
      "Juli 2026"
    );
    expect(s.narrative).toContain("berkurang");
    expect(s.cards.find((c) => c.title === "Perubahan Kas")!.direction).toBe("loss");
  });
});
