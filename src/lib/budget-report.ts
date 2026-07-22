/**
 * Anggaran & Target — data access + the Realisasi vs Anggaran assembly (issue #29).
 *
 * ── ONE SOURCE OF ACTUALS, DELIBERATELY ─────────────────────────────────────
 * "Actual" here is NEVER a fresh aggregation over `journal_lines`. It is read
 * from `getIncomeStatement` in `@/lib/reports` — the exact same reader that
 * powers the Laba/Rugi report — so a budget's realisation and the P&L can never
 * disagree. A second aggregator that summed journals its own way would be the
 * classic dual-source bug: two "actuals" for one account that drift apart. The
 * period is turned into a date range (`periodBounds` for a month, Jan–Dec for a
 * whole year) and handed to that reader unchanged; every figure it returns is
 * already IDR base, so nothing here converts currency.
 *
 * This module reads only. It imports nothing from `@/lib/posting` or
 * `@/lib/ledger` and posts no journal — an anggaran is a plan laid alongside the
 * books, never an entry in them.
 */
import { prisma } from "@/lib/prisma";
import { getIncomeStatement } from "@/lib/reports";
import { periodBounds } from "@/lib/period";
import { accountCategoryFor } from "@/lib/accounting";
import {
  buildBudgetReport,
  buildTargetRealization,
  sumBudgetsByPeriod,
  DEFAULT_VARIANCE_THRESHOLD_PCT,
  type BudgetActualInput,
  type BudgetPeriodEntry,
  type BudgetReport,
  type BudgetVarianceRow,
} from "@/lib/budget";

type Client = typeof prisma;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The [start, end] instants of a month, or of the whole year when month is absent. */
function periodRange(year: number, month?: number): { start: Date; end: Date } {
  if (month !== undefined) return periodBounds(year, month);
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

/**
 * Actual IDR-base amount per account CODE for the period, from the P&L reader.
 * Revenue and expense lines are merged into one map: each is already sign-
 * normalised by `getIncomeStatement` (revenue = credit−debit, expense =
 * debit−credit), so a positive figure means "earned"/"spent" — the same
 * direction a positive budget is planned in, which is what makes them comparable.
 */
export async function getActualsByCode(
  year: number,
  month: number | undefined,
  client: Client = prisma
): Promise<Map<string, number>> {
  const { start, end } = periodRange(year, month);
  const is = await getIncomeStatement(start, end, client);
  const map = new Map<string, number>();
  for (const line of [...is.revenue, ...is.expense]) map.set(line.code, line.amount);
  return map;
}

export interface BudgetReportResult {
  report: BudgetReport;
  /** False when no budget rows exist for the period — drives the empty state. */
  hasBudgets: boolean;
}

/**
 * Realisasi vs Anggaran for a period: every budgeted account with its plan, its
 * actual (from the P&L reader), the variance, and the over/under classification.
 */
export async function getBudgetReport(
  year: number,
  month: number | undefined,
  thresholdPct: number = DEFAULT_VARIANCE_THRESHOLD_PCT,
  client: Client = prisma
): Promise<BudgetReportResult> {
  const budgets = await client.budget.findMany({
    where: month !== undefined ? { year, month } : { year },
  });
  if (budgets.length === 0) {
    return { report: buildBudgetReport([], thresholdPct), hasBudgets: false };
  }

  const accountIds = [...new Set(budgets.map((b) => b.accountId))];
  const accounts = await client.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, code: true, name: true, type: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));

  // Collapse per-month plans into one figure per account code (the whole-year
  // view sums twelve months; a single month leaves them untouched).
  const entries: BudgetPeriodEntry[] = budgets.map((b) => ({
    accountCode: byId.get(b.accountId)?.code ?? String(b.accountId),
    year: b.year,
    month: b.month,
    amount: Number(b.amount),
  }));
  const budgetByCode = sumBudgetsByPeriod(entries, year, month);

  const actualsByCode = await getActualsByCode(year, month, client);

  const inputs: BudgetActualInput[] = [];
  for (const acc of accounts) {
    const category = accountCategoryFor(acc.type);
    // Only P&L accounts are comparable against the income statement. The input
    // page already restricts the picker to these; this is the belt-and-braces.
    if (category !== "revenue" && category !== "expense") continue;
    inputs.push({
      code: acc.code,
      name: acc.name,
      category,
      budget: budgetByCode.get(acc.code) ?? 0,
      actual: actualsByCode.get(acc.code) ?? 0,
    });
  }

  return { report: buildBudgetReport(inputs, thresholdPct), hasBudgets: true };
}

export interface SalesTargetRealizationResult {
  row: BudgetVarianceRow;
  totalTarget: number;
  actualSales: number;
  targetCount: number;
  hasTargets: boolean;
}

/**
 * Realisasi Target Penjualan for a period, at the TOTAL level. Actual net sales
 * is the sum of the period's `revenue`-type account lines from the same P&L
 * reader (which nets Retur Penjualan, itself a revenue-type account, back out) —
 * `other_income` (FX, interest) is deliberately excluded, since a sales target
 * is about penjualan, not incidental income. Per-customer/commodity targets are
 * a planning breakdown; the ledger does not split revenue by customer, so the
 * realisation is compared against the aggregate rather than inventing a second
 * per-customer aggregator.
 */
export async function getSalesTargetRealization(
  year: number,
  month: number | undefined,
  thresholdPct: number = DEFAULT_VARIANCE_THRESHOLD_PCT,
  client: Client = prisma
): Promise<SalesTargetRealizationResult> {
  const targets = await client.salesTarget.findMany({
    where: month !== undefined ? { year, month } : { year },
  });
  const totalTarget = round2(targets.reduce((s, t) => s + Number(t.amount), 0));

  const { start, end } = periodRange(year, month);
  const is = await getIncomeStatement(start, end, client);
  const revenueAccounts = await client.account.findMany({
    where: { type: "revenue" },
    select: { code: true },
  });
  const revCodes = new Set(revenueAccounts.map((a) => a.code));
  const actualSales = round2(
    is.revenue.filter((l) => revCodes.has(l.code)).reduce((s, l) => s + l.amount, 0)
  );

  return {
    row: buildTargetRealization({ target: totalTarget, actual: actualSales }, thresholdPct),
    totalTarget,
    actualSales,
    targetCount: targets.length,
    hasTargets: targets.length > 0,
  };
}

/* ─────────────────────────── Input-page reads ─────────────────────────── */

export interface BudgetListRow {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  year: number;
  month: number;
  amount: number;
  note: string | null;
}

/** Budgets for a year (optionally a month), joined to account code/name, for the input page. */
export async function listBudgets(
  year: number,
  month: number | undefined,
  client: Client = prisma
): Promise<BudgetListRow[]> {
  const budgets = await client.budget.findMany({
    where: month !== undefined ? { year, month } : { year },
    orderBy: [{ month: "asc" }, { accountId: "asc" }],
  });
  if (budgets.length === 0) return [];

  const accounts = await client.account.findMany({
    where: { id: { in: [...new Set(budgets.map((b) => b.accountId))] } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));

  return budgets
    .map((b) => ({
      id: b.id,
      accountId: b.accountId,
      accountCode: byId.get(b.accountId)?.code ?? "—",
      accountName: byId.get(b.accountId)?.name ?? "—",
      year: b.year,
      month: b.month,
      amount: Number(b.amount),
      note: b.note,
    }))
    .sort((a, b) => a.month - b.month || a.accountCode.localeCompare(b.accountCode));
}

export interface SalesTargetListRow {
  id: number;
  year: number;
  month: number;
  customerId: number | null;
  customerName: string | null;
  itemId: number | null;
  itemName: string | null;
  amount: number;
  note: string | null;
}

/** Sales targets for a year (optionally a month), joined to customer/item names. */
export async function listSalesTargets(
  year: number,
  month: number | undefined,
  client: Client = prisma
): Promise<SalesTargetListRow[]> {
  const targets = await client.salesTarget.findMany({
    where: month !== undefined ? { year, month } : { year },
    orderBy: [{ month: "asc" }, { id: "asc" }],
  });
  if (targets.length === 0) return [];

  const customerIds = targets.map((t) => t.customerId).filter((v): v is number => v != null);
  const itemIds = targets.map((t) => t.itemId).filter((v): v is number => v != null);
  const [customers, items] = await Promise.all([
    customerIds.length
      ? client.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    itemIds.length
      ? client.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const custById = new Map(customers.map((c) => [c.id, c.name]));
  const itemById = new Map(items.map((i) => [i.id, i.name]));

  return targets.map((t) => ({
    id: t.id,
    year: t.year,
    month: t.month,
    customerId: t.customerId,
    customerName: t.customerId != null ? custById.get(t.customerId) ?? "—" : null,
    itemId: t.itemId,
    itemName: t.itemId != null ? itemById.get(t.itemId) ?? "—" : null,
    amount: Number(t.amount),
    note: t.note,
  }));
}
