/**
 * Plain-language report summaries (issue #19), extending the dashboard approach
 * from issue #3 (`@/lib/dashboard-summary` + `SummaryCard`).
 *
 * ── Derived, never recomputed ────────────────────────────────────────────────
 * Every function here takes the *result object the report already produced* and
 * reads its totals — it never touches a journal line or re-aggregates anything.
 * That is the whole point: the sentence "Bulan ini untung Rp X karena penjualan
 * lebih besar dari beban" must use the same `netIncome`, `totalRevenue` and
 * `totalExpense` the table above it shows, or the friendly summary and the real
 * report would quietly disagree. The tests pin exactly that: each card's amount
 * is asserted equal to the corresponding report total.
 *
 * The output is UI-agnostic data (`ReportSummary`): a one-sentence `narrative`
 * plus `cards` shaped for `SummaryCard`. The page maps cards straight onto that
 * component and fills in the `href` back to the owning report.
 *
 * ── Bahasa: penerjemah DISUNTIKKAN, bukan dipanggil di sini ─────────────────
 * Modul ini MURNI dan diuji langsung (`tests/report-summary.test.ts` mengunci
 * kalimatnya), jadi ia tidak boleh menarik `getT()` — yang berarti
 * `server-only` + `cookies()` dan seketika mematikan tesnya. Sebagai gantinya
 * tiap fungsi menerima `t`: halaman laporan (komponen server) meneruskan
 * `await getT()`, dan tesnya meneruskan penerjemah dari `id.json`. Bentuk
 * `ReportSummary` tidak berubah sedikit pun — isinya tetap string biasa, hanya
 * kini dalam bahasa pengguna.
 */
import { formatCurrency } from "@/lib/utils";
import type { TranslateFn } from "@/lib/i18n/client";

/** Same literal union as `SummaryCard`'s `MoneyDirection`, structurally assignable. */
export type SummaryDirection = "in" | "out" | "profit" | "loss" | "receivable" | "payable";

export interface SummaryStat {
  title: string;
  /** Absolute IDR amount; the sign is carried by `direction` (matches SummaryCard). */
  amount: number;
  direction: SummaryDirection;
  explanation: string;
}

export interface ReportSummary {
  /** One lay-language sentence describing the headline result. */
  narrative: string;
  cards: SummaryStat[];
}

const rp = (n: number) => formatCurrency(n, "IDR");

interface IncomeStatementTotals {
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
}

/**
 * "Untung/rugi" explained from the P&L totals. `netIncome` is compared to zero
 * with a 1-cent tolerance so a rounding-only residue reads as impas, not a
 * misleading Rp 0 profit/loss.
 */
export function incomeStatementSummary(
  is: IncomeStatementTotals,
  periodLabel: string,
  t: TranslateFn
): ReportSummary {
  const net = is.netIncome;
  const profit = Math.round(net * 100) > 0;
  const loss = Math.round(net * 100) < 0;

  let narrative: string;
  if (profit) {
    narrative = t("reportSummary.isProfit", {
      period: periodLabel,
      amount: rp(net),
      revenue: rp(is.totalRevenue),
      expense: rp(is.totalExpense),
    });
  } else if (loss) {
    narrative = t("reportSummary.isLoss", {
      period: periodLabel,
      amount: rp(Math.abs(net)),
      revenue: rp(is.totalRevenue),
      expense: rp(is.totalExpense),
    });
  } else {
    narrative = t("reportSummary.isBreakEven", {
      period: periodLabel,
      amount: rp(is.totalRevenue),
    });
  }

  return {
    narrative,
    cards: [
      {
        title: t("finance.colMoneyIn"),
        amount: is.totalRevenue,
        direction: "in",
        explanation: t("reportSummary.isMoneyInExplanation"),
      },
      {
        title: t("finance.colMoneyOut"),
        amount: is.totalExpense,
        direction: "out",
        explanation: t("reportSummary.isMoneyOutExplanation"),
      },
      {
        title: t("dashboard.profitLoss"),
        amount: Math.abs(net),
        direction: profit || !loss ? "profit" : "loss",
        explanation: t("reportSummary.isNetExplanation"),
      },
    ],
  };
}

interface BalanceSheetTotals {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
  balanced: boolean;
}

/** "Apa yang dimiliki vs apa yang jadi kewajiban" at a point in time. */
export function balanceSheetSummary(
  bs: BalanceSheetTotals,
  asOfLabel: string,
  t: TranslateFn
): ReportSummary {
  const equityTotal = bs.totalEquity + bs.netIncome;
  const narrative = bs.balanced
    ? t("reportSummary.bsBalanced", {
        asOf: asOfLabel,
        assets: rp(bs.totalAssets),
        liabilities: rp(bs.totalLiabilities),
        equity: rp(equityTotal),
      })
    : t("reportSummary.bsUnbalanced", {
        asOf: asOfLabel,
        assets: rp(bs.totalAssets),
        total: rp(bs.totalLiabilities + equityTotal),
      });

  return {
    narrative,
    cards: [
      {
        title: t("reportSummary.bsAssets"),
        amount: bs.totalAssets,
        direction: "in",
        explanation: t("reportSummary.bsAssetsExplanation"),
      },
      {
        title: t("reportSummary.bsLiabilities"),
        amount: bs.totalLiabilities,
        direction: "out",
        explanation: t("reportSummary.bsLiabilitiesExplanation"),
      },
      {
        title: t("reportSummary.bsEquity"),
        amount: equityTotal,
        direction: "profit",
        explanation: t("reportSummary.bsEquityExplanation"),
      },
    ],
  };
}

interface CashFlowTotals {
  openingCash: number;
  closingCash: number;
  netChange: number;
  reconciled: boolean;
}

/** "Kas naik/turun berapa" over the period, from the cash-flow totals. */
export function cashFlowSummary(
  cf: CashFlowTotals,
  periodLabel: string,
  t: TranslateFn
): ReportSummary {
  const up = Math.round(cf.netChange * 100) > 0;
  const down = Math.round(cf.netChange * 100) < 0;
  const verb = up
    ? t("reportSummary.cfVerbUp")
    : down
      ? t("reportSummary.cfVerbDown")
      : t("reportSummary.cfVerbSame");
  const narrative = t("reportSummary.cfNarrative", {
    period: periodLabel,
    verb,
    amount: rp(Math.abs(cf.netChange)),
    opening: rp(cf.openingCash),
    closing: rp(cf.closingCash),
  });

  return {
    narrative,
    cards: [
      {
        title: t("reportSummary.cfOpening"),
        amount: cf.openingCash,
        direction: "in",
        explanation: t("reportSummary.cfOpeningExplanation"),
      },
      {
        title: t("reportSummary.cfChange"),
        amount: Math.abs(cf.netChange),
        direction: up ? "profit" : "loss",
        explanation: t("reportSummary.cfChangeExplanation"),
      },
      {
        title: t("reportSummary.cfClosing"),
        amount: cf.closingCash,
        direction: "in",
        explanation: t("reportSummary.cfClosingExplanation"),
      },
    ],
  };
}
