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
 */
import { formatCurrency } from "@/lib/utils";

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
  periodLabel: string
): ReportSummary {
  const net = is.netIncome;
  const profit = Math.round(net * 100) > 0;
  const loss = Math.round(net * 100) < 0;

  let narrative: string;
  if (profit) {
    narrative = `${periodLabel}: untung ${rp(net)}, karena penjualan (${rp(is.totalRevenue)}) lebih besar daripada beban (${rp(is.totalExpense)}).`;
  } else if (loss) {
    narrative = `${periodLabel}: rugi ${rp(Math.abs(net))}, karena beban (${rp(is.totalExpense)}) lebih besar daripada penjualan (${rp(is.totalRevenue)}).`;
  } else {
    narrative = `${periodLabel}: impas — penjualan dan beban sama besar (${rp(is.totalRevenue)}).`;
  }

  return {
    narrative,
    cards: [
      {
        title: "Uang Masuk",
        amount: is.totalRevenue,
        direction: "in",
        explanation: "Total penjualan dan pemasukan yang dibukukan pada periode ini.",
      },
      {
        title: "Uang Keluar",
        amount: is.totalExpense,
        direction: "out",
        explanation: "Total beban dan pengeluaran yang dibukukan pada periode ini.",
      },
      {
        title: "Selisih (Untung / Rugi)",
        amount: Math.abs(net),
        direction: profit || !loss ? "profit" : "loss",
        explanation:
          "Uang masuk dikurangi uang keluar. Tanda plus berarti untung, minus berarti rugi.",
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
  asOfLabel: string
): ReportSummary {
  const equityTotal = bs.totalEquity + bs.netIncome;
  const narrative = bs.balanced
    ? `${asOfLabel}: total harta ${rp(bs.totalAssets)} = utang ${rp(bs.totalLiabilities)} + modal ${rp(equityTotal)}. Buku seimbang.`
    : `${asOfLabel}: harta (${rp(bs.totalAssets)}) belum sama dengan utang + modal (${rp(bs.totalLiabilities + equityTotal)}) — periksa jurnal.`;

  return {
    narrative,
    cards: [
      {
        title: "Harta (Aset)",
        amount: bs.totalAssets,
        direction: "in",
        explanation: "Semua yang dimiliki usaha: kas, piutang, persediaan, aset tetap.",
      },
      {
        title: "Utang (Liabilitas)",
        amount: bs.totalLiabilities,
        direction: "out",
        explanation: "Kewajiban yang masih harus dibayar ke pihak lain.",
      },
      {
        title: "Modal (Ekuitas)",
        amount: equityTotal,
        direction: "profit",
        explanation: "Hak pemilik atas usaha, termasuk laba/rugi berjalan.",
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
export function cashFlowSummary(cf: CashFlowTotals, periodLabel: string): ReportSummary {
  const up = Math.round(cf.netChange * 100) > 0;
  const down = Math.round(cf.netChange * 100) < 0;
  const verb = up ? "bertambah" : down ? "berkurang" : "tidak berubah";
  const narrative = `${periodLabel}: kas ${verb} ${rp(Math.abs(cf.netChange))} — dari ${rp(cf.openingCash)} menjadi ${rp(cf.closingCash)}.`;

  return {
    narrative,
    cards: [
      {
        title: "Kas Awal",
        amount: cf.openingCash,
        direction: "in",
        explanation: "Saldo seluruh kas & bank di awal periode.",
      },
      {
        title: "Perubahan Kas",
        amount: Math.abs(cf.netChange),
        direction: up ? "profit" : "loss",
        explanation: "Selisih kas masuk dan kas keluar sepanjang periode.",
      },
      {
        title: "Kas Akhir",
        amount: cf.closingCash,
        direction: "in",
        explanation: "Saldo seluruh kas & bank di akhir periode.",
      },
    ],
  };
}
