/**
 * Anggaran & Target — pure variance math (issue #29).
 *
 * ── PURE, ON PURPOSE ────────────────────────────────────────────────────────
 * Not one line here touches Prisma, the ledger, or `getIncomeStatement`. This
 * module answers only "given a plan and a realised figure, what is the
 * variance and is it beyond the alert threshold?" — arithmetic that must be
 * unit-testable in isolation and identical wherever it runs (report, dashboard
 * summary, a future PDF). The plan (`budget`) and the realised figure (`actual`)
 * are BOTH already IDR base amounts when they arrive here: budgets are stored in
 * IDR (the ledger's base) and actuals come from the IDR-base report readers in
 * `@/lib/reports`. Nothing here converts currency, so two currencies can never
 * be added by accident — the discipline is enforced upstream, at the source.
 *
 * ── VARIANCE SIGN CONVENTION ────────────────────────────────────────────────
 * `variance = actual − budget`, always. A POSITIVE variance means the realised
 * figure came in ABOVE the plan; NEGATIVE means below. Whether "above" is good
 * or bad is NOT baked into the sign — it depends on the account category:
 * over-earning a revenue target is favourable, over-spending an expense budget
 * is not. `isFavorable()` applies that reading; the raw over/under classification
 * (`classifyVariance`) is category-blind so the alert fires the same way for both.
 */

/** Default alert band: a realisation within ±10% of plan is "on target". */
export const DEFAULT_VARIANCE_THRESHOLD_PCT = 10;

/** The P&L side of a budgeted account — the only two categories a budget targets. */
export type BudgetCategory = "revenue" | "expense";

/**
 * Where a realisation landed relative to plan, category-blind:
 *   over       — actual is above budget beyond the threshold band
 *   under      — actual is below budget beyond the threshold band
 *   on_target  — actual is within ±threshold of budget
 */
export type VarianceStatus = "over" | "under" | "on_target";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True when the amount is zero to the cent (guards divide-by-zero on % maths). */
const isZeroCents = (n: number): boolean => Math.round(n * 100) === 0;

export interface Variance {
  /** actual − budget, IDR base, rounded to the cent. Signed. */
  variance: number;
  /**
   * variance as a % of budget, rounded to two decimals. NULL when budget is
   * zero — a zero plan has no denominator, so "percent over budget" is undefined
   * and the caller must fall back to the absolute figure rather than divide.
   */
  variancePct: number | null;
}

/** Absolute + percentage variance of `actual` against `budget` (both IDR base). */
export function computeVariance(budget: number, actual: number): Variance {
  const variance = round2(actual - budget);
  const variancePct = isZeroCents(budget) ? null : round2((variance / budget) * 100);
  return { variance, variancePct };
}

/**
 * Classify a realisation against its budget within a threshold band.
 *
 * Zero-budget case (variancePct === null): there is no percentage to compare to
 * the band, so any non-zero realisation is flagged straight away — spending or
 * earning against a plan of zero is precisely what the alert is for — while a
 * zero-against-zero row is on target.
 */
export function classifyVariance(
  budget: number,
  actual: number,
  thresholdPct: number = DEFAULT_VARIANCE_THRESHOLD_PCT
): VarianceStatus {
  const { variance, variancePct } = computeVariance(budget, actual);

  if (variancePct === null) {
    if (isZeroCents(variance)) return "on_target";
    return variance > 0 ? "over" : "under";
  }

  if (variancePct > thresholdPct) return "over";
  if (variancePct < -thresholdPct) return "under";
  return "on_target";
}

/**
 * Is an over/under variance *favourable* for this account category?
 *   revenue  → over is favourable (beat the target), under is not
 *   expense  → under is favourable (came in below budget), over is not
 * Returns null for `on_target` — neither good nor bad, just as planned.
 */
export function isFavorable(
  category: BudgetCategory,
  status: VarianceStatus
): boolean | null {
  if (status === "on_target") return null;
  const over = status === "over";
  return category === "revenue" ? over : !over;
}

export interface BudgetActualInput {
  /** COA account code — the join key between plan and actual. */
  code: string;
  name: string;
  category: BudgetCategory;
  /** Planned amount for the period, IDR base. */
  budget: number;
  /** Realised amount for the period, IDR base (from the ledger/report reader). */
  actual: number;
}

export interface BudgetVarianceRow extends BudgetActualInput, Variance {
  status: VarianceStatus;
  /** true = favourable, false = unfavourable, null = on target. */
  favorable: boolean | null;
  /** True when the row is beyond the threshold band (status !== on_target). */
  alert: boolean;
}

export interface BudgetTotals {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  /** How many rows breached the threshold band. */
  alertCount: number;
}

export interface BudgetReport {
  rows: BudgetVarianceRow[];
  totals: BudgetTotals;
}

/**
 * Turn plan-vs-actual inputs into fully-classified rows plus totals.
 *
 * Rows are returned in ascending account-code order so the report reads like the
 * Laba/Rugi it mirrors. Totals sum the raw budget/actual figures and re-derive a
 * single variance from those sums (not the sum of per-row variances — they are
 * equal, but deriving from the totals keeps the % honest against the total plan).
 */
export function buildBudgetReport(
  inputs: BudgetActualInput[],
  thresholdPct: number = DEFAULT_VARIANCE_THRESHOLD_PCT
): BudgetReport {
  const rows: BudgetVarianceRow[] = inputs
    .map((input) => {
      const { variance, variancePct } = computeVariance(input.budget, input.actual);
      const status = classifyVariance(input.budget, input.actual, thresholdPct);
      return {
        ...input,
        variance,
        variancePct,
        status,
        favorable: isFavorable(input.category, status),
        alert: status !== "on_target",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const budget = round2(rows.reduce((s, r) => s + r.budget, 0));
  const actual = round2(rows.reduce((s, r) => s + r.actual, 0));
  const totalsVariance = computeVariance(budget, actual);

  return {
    rows,
    totals: {
      budget,
      actual,
      variance: totalsVariance.variance,
      variancePct: totalsVariance.variancePct,
      alertCount: rows.filter((r) => r.alert).length,
    },
  };
}

export interface BudgetPeriodEntry {
  accountCode: string;
  year: number;
  month: number;
  amount: number;
}

/**
 * Sum budget entries for one period, keyed by account code.
 *
 * A budget is stored per account PER MONTH. Selecting a single month filters to
 * that month; omitting `month` (a whole-year view) keeps every month of `year`
 * and sums the twelve monthly plans into one annual figure per account — the
 * same account may therefore contribute several rows, which is exactly why this
 * aggregates rather than assumes one row per account.
 */
export function sumBudgetsByPeriod(
  entries: BudgetPeriodEntry[],
  year: number,
  month?: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.year !== year) continue;
    if (month !== undefined && e.month !== month) continue;
    totals.set(e.accountCode, round2((totals.get(e.accountCode) ?? 0) + e.amount));
  }
  return totals;
}

export interface TargetActual {
  target: number;
  actual: number;
}

/** Realisation of a single sales target against actual net sales (both IDR base). */
export function buildTargetRealization(
  { target, actual }: TargetActual,
  thresholdPct: number = DEFAULT_VARIANCE_THRESHOLD_PCT
): BudgetVarianceRow {
  const { variance, variancePct } = computeVariance(target, actual);
  const status = classifyVariance(target, actual, thresholdPct);
  return {
    code: "",
    name: "Penjualan",
    category: "revenue",
    budget: target,
    actual,
    variance,
    variancePct,
    status,
    favorable: isFavorable("revenue", status),
    alert: status !== "on_target",
  };
}
