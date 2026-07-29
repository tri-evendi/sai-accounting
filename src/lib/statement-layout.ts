/**
 * Shape of the multi-step Laba/Rugi — which bands are worth printing (issue #123).
 *
 * ── ONE rule, in ONE place, with NO dependencies ─────────────────────────────
 * The screen, the PDF and the spreadsheet must agree on the shape of the
 * statement: a printout carrying a "Laba Kotor" row the screen does not is a
 * report nobody trusts twice. So the rule lives here rather than being repeated
 * three times — and it lives in its own module, importing nothing, because its
 * three callers cannot share a heavier home: the page is a server component, the
 * PDF builder runs in the browser (jsPDF), and `@/lib/report-export` is pure by
 * contract and must not pull a PDF library in behind it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A band with no lines is omitted, and so is the subtotal that band exists to
 * produce: with no HPP accounts "Laba Kotor" would merely restate total revenue,
 * and with no other income or expense "Laba Usaha" would merely restate the net
 * result. A subtotal that repeats the line above it teaches the reader to skim
 * past subtotals, which is worse than not printing one. So a service company
 * still sees exactly the statement it saw before — Pendapatan, Beban, Laba/Rugi
 * Bersih — while a trading company gets the full ladder.
 *
 * Penjualan and Beban Operasional are always shown, even when empty: they are the
 * anchors of the statement, and an empty period must still look like a report
 * rather than a lone total.
 */

export interface IncomeStatementLayout {
  showCogs: boolean;
  showGrossProfit: boolean;
  showOtherIncome: boolean;
  showOtherExpense: boolean;
  showOperatingProfit: boolean;
}

/** Structural on purpose — accepts the reader's result and the export payload alike. */
export interface IncomeStatementShape {
  cogs: { lines: readonly unknown[] };
  otherIncome: { lines: readonly unknown[] };
  otherExpense: { lines: readonly unknown[] };
}

export function incomeStatementLayout(statement: IncomeStatementShape): IncomeStatementLayout {
  const showCogs = statement.cogs.lines.length > 0;
  const showOtherIncome = statement.otherIncome.lines.length > 0;
  const showOtherExpense = statement.otherExpense.lines.length > 0;
  return {
    showCogs,
    showGrossProfit: showCogs,
    showOtherIncome,
    showOtherExpense,
    showOperatingProfit: showOtherIncome || showOtherExpense,
  };
}

/**
 * Gross margin as a percentage of revenue, or `null` when there is no revenue to
 * be a percentage of. Explicitly null rather than 0: a period with no sales has
 * no margin, and printing "0%" would state something the books do not say.
 */
export function grossMarginPct(grossProfit: number, totalSales: number): number | null {
  if (Math.round(totalSales * 100) === 0) return null;
  return (grossProfit / totalSales) * 100;
}
