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
import { translate } from "@/lib/i18n/dictionary";
import { formatCurrency } from "@/lib/utils";
import id from "@/lib/i18n/dictionaries/id.json";
import {
  incomeStatementSummary,
  balanceSheetSummary,
  cashFlowSummary,
} from "@/lib/report-summary";

/**
 * Penerjemah bahasa SUMBER. Ketiga fungsi kini menerima `t` (lihat catatan di
 * `lib/report-summary.ts`); tes memberinya kamus `id.json` yang sungguhan, jadi
 * kalimat yang dikunci di bawah tetap kalimat yang dibaca pengguna Indonesia.
 */
const t = (key: string, values?: Record<string, string | number>) =>
  translate(id, key, values);

/** Same formatter the summary uses — asserts on the rendered figure, not a guess. */
const rp = (n: number) => formatCurrency(n, "IDR");

describe("incomeStatementSummary — derived from the P&L totals", () => {
  const is = { totalRevenue: 1_734_568, totalExpense: 400_000, netIncome: 1_334_568 };

  it("uses the exact revenue, expense and net figures from the report", () => {
    const s = incomeStatementSummary(is, "Juli 2026", t);
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Uang Masuk"].amount).toBe(is.totalRevenue);
    expect(byTitle["Uang Keluar"].amount).toBe(is.totalExpense);
    expect(byTitle["Selisih (Untung / Rugi)"].amount).toBe(Math.abs(is.netIncome));
  });

  it("reads a positive net as untung, green/profit direction", () => {
    const s = incomeStatementSummary(is, "Juli 2026", t);
    expect(s.narrative).toContain("untung");
    expect(s.cards.find((c) => c.title.startsWith("Selisih"))!.direction).toBe("profit");
  });

  it("reads a negative net as rugi and reports the absolute amount", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 100_000, totalExpense: 250_000, netIncome: -150_000 },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("rugi");
    const selisih = s.cards.find((c) => c.title.startsWith("Selisih"))!;
    expect(selisih.direction).toBe("loss");
    expect(selisih.amount).toBe(150_000);
  });

  it("reads a zero net as impas, not a misleading Rp 0 profit", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 500_000, totalExpense: 500_000, netIncome: 0 },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("impas");
  });

  it("treats a sub-cent residue as impas", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 500_000.004, totalExpense: 500_000, netIncome: 0.004 },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("impas");
  });
});

/**
 * Gross margin in the summary (issue #123).
 *
 * The hazard worth pinning is not the arithmetic — it is a margin sentence that
 * appears when it has no right to. A caller with no cost-of-goods accounts must
 * get NO margin claim rather than a flattering 100%, and the three-card layout
 * every other report shares must be untouched when the sentence is absent.
 */
describe("incomeStatementSummary — gross margin", () => {
  const trading = {
    totalRevenue: 1_000_000,
    totalExpense: 800_000,
    netIncome: 200_000,
    sales: { total: 1_000_000 },
    cogs: { lines: [{ code: "5101" }], total: 600_000 },
    grossProfit: 400_000,
  };

  it("states the margin and keeps the report's own figures", () => {
    const s = incomeStatementSummary(trading, "Juli 2026", t);
    expect(s.narrative).toContain("Marjin kotornya 40%");
    expect(s.narrative).toContain(rp(400_000)); // laba kotor, verbatim
    expect(s.narrative).toContain(rp(1_000_000)); // penjualan, verbatim
  });

  it("adds a Laba Kotor card straight after money-in, without disturbing the rest", () => {
    const s = incomeStatementSummary(trading, "Juli 2026", t);
    expect(s.cards.map((c) => c.title)).toEqual([
      "Uang Masuk",
      "Laba Kotor",
      "Uang Keluar",
      "Selisih (Untung / Rugi)",
    ]);
    const gross = s.cards[1];
    expect(gross.amount).toBe(400_000);
    expect(gross.direction).toBe("profit");
  });

  it("says nothing about margin when the books have no cost-of-goods accounts", () => {
    // A service business: gross profit WOULD equal revenue, and announcing a
    // 100% margin would be arithmetically true and completely misleading.
    const s = incomeStatementSummary(
      { ...trading, cogs: { lines: [], total: 0 }, grossProfit: 1_000_000 },
      "Juli 2026",
      t
    );
    expect(s.narrative).not.toContain("Marjin");
    expect(s.cards.map((c) => c.title)).toEqual([
      "Uang Masuk",
      "Uang Keluar",
      "Selisih (Untung / Rugi)",
    ]);
  });

  it("says nothing about margin when the caller supplies only the flat totals", () => {
    const s = incomeStatementSummary(
      { totalRevenue: 1_000_000, totalExpense: 800_000, netIncome: 200_000 },
      "Juli 2026",
      t
    );
    expect(s.narrative).not.toContain("Marjin");
    expect(s.cards).toHaveLength(3);
  });

  it("warns in different words when goods sold for less than they cost", () => {
    const s = incomeStatementSummary(
      {
        totalRevenue: 1_000_000,
        totalExpense: 1_400_000,
        netIncome: -400_000,
        sales: { total: 1_000_000 },
        cogs: { lines: [{ code: "5101" }], total: 1_200_000 },
        grossProfit: -200_000,
      },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("MINUS 20%");
    expect(s.narrative).toContain("menambah rugi");
    const gross = s.cards.find((c) => c.title === "Laba Kotor")!;
    expect(gross.direction).toBe("loss");
    expect(gross.amount).toBe(200_000); // absolute, the sign is carried by direction
  });

  it("says nothing about margin when there were no sales to have a margin on", () => {
    const s = incomeStatementSummary(
      {
        totalRevenue: 0,
        totalExpense: 50_000,
        netIncome: -50_000,
        sales: { total: 0 },
        cogs: { lines: [{ code: "5101" }], total: 0 },
        grossProfit: 0,
      },
      "Juli 2026",
      t
    );
    expect(s.narrative).not.toContain("Marjin");
    expect(s.cards).toHaveLength(3);
  });

  it("rounds the margin to one decimal, id-ID", () => {
    const s = incomeStatementSummary(
      { ...trading, cogs: { lines: [{ code: "5101" }], total: 666_666 }, grossProfit: 333_334 },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("33,3%");
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
    const s = balanceSheetSummary(bs, "Per 31 Jul 2026", t);
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Harta (Aset)"].amount).toBe(bs.totalAssets);
    expect(byTitle["Utang (Liabilitas)"].amount).toBe(bs.totalLiabilities);
    expect(byTitle["Modal (Ekuitas)"].amount).toBe(bs.totalEquity + bs.netIncome);
  });

  it("says the book is balanced when it is", () => {
    expect(balanceSheetSummary(bs, "Per 31 Jul 2026", t).narrative).toContain("seimbang");
  });

  it("warns when the sheet does not balance", () => {
    const s = balanceSheetSummary({ ...bs, balanced: false }, "Per 31 Jul 2026", t);
    expect(s.narrative).toContain("periksa jurnal");
  });
});

describe("cashFlowSummary — derived from the cash-flow totals", () => {
  const cf = { openingCash: 1_000_000, closingCash: 1_250_000, netChange: 250_000, reconciled: true };

  it("uses opening, closing and net change verbatim", () => {
    const s = cashFlowSummary(cf, "Juli 2026", t);
    const byTitle = Object.fromEntries(s.cards.map((c) => [c.title, c]));
    expect(byTitle["Kas Awal"].amount).toBe(cf.openingCash);
    expect(byTitle["Kas Akhir"].amount).toBe(cf.closingCash);
    expect(byTitle["Perubahan Kas"].amount).toBe(Math.abs(cf.netChange));
  });

  it("says kas bertambah when cash rose", () => {
    const s = cashFlowSummary(cf, "Juli 2026", t);
    expect(s.narrative).toContain("bertambah");
    expect(s.cards.find((c) => c.title === "Perubahan Kas")!.direction).toBe("profit");
  });

  it("says kas berkurang when cash fell", () => {
    const s = cashFlowSummary(
      { openingCash: 1_000_000, closingCash: 700_000, netChange: -300_000, reconciled: true },
      "Juli 2026",
      t
    );
    expect(s.narrative).toContain("berkurang");
    expect(s.cards.find((c) => c.title === "Perubahan Kas")!.direction).toBe("loss");
  });
});
