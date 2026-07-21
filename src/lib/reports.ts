/**
 * Financial reports derived from journal lines (IDR base):
 * Neraca Saldo (trial balance), Laba/Rugi (income statement), Neraca (balance sheet),
 * Arus Kas (cash flow).
 * All balances are aggregated from posted journals so they always reconcile with the ledger.
 *
 * ── IDR base only ────────────────────────────────────────────────────────────
 * Every figure here is the IDR base amount the ledger posted (`base_debit` /
 * `base_credit`), never the line's original currency. Two currencies are never
 * added. Unlike source documents (see the header of `src/lib/receivables.ts`),
 * a journal line can never be "unrated": `rate` is NOT NULL DEFAULT 1 and the
 * base columns are materialised by `prepareLines()` at posting time, so the IDR
 * value always exists. What *can* happen is a foreign line posted at rate = 1 —
 * the fingerprint of a rate the user never entered. Those rows are counted and
 * surfaced (`suspectUnrated`), but NOT excluded: the ledger has already booked
 * them at that base, so dropping them here would make the report disagree with
 * the trial balance. The fix for such a row belongs at posting time, not in a
 * read-only report that must mirror the books.
 */
import { prisma } from "@/lib/prisma";
import { accountCategoryFor } from "@/lib/accounting";

type Nets = Map<number, { debit: number; credit: number }>;

interface DateRange {
  gte?: Date;
  lte?: Date;
  lt?: Date;
}

/** Sum base debit/credit per account for an optional journal-date filter (1 groupBy query). */
async function accountNets(range: DateRange | undefined, client = prisma) {
  const grouped = await client.journalLine.groupBy({
    by: ["accountId"],
    _sum: { baseDebit: true, baseCredit: true },
    where: range ? { journal: { date: range } } : undefined,
  });
  const map: Nets = new Map();
  for (const g of grouped) {
    map.set(g.accountId, {
      debit: Number(g._sum.baseDebit ?? 0),
      credit: Number(g._sum.baseCredit ?? 0),
    });
  }
  return map;
}

const eq = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

export interface TrialBalanceRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export async function getTrialBalance(asOf?: Date, client = prisma) {
  const nets = await accountNets(asOf ? { lte: asOf } : undefined, client);
  const accounts = await client.account.findMany({ orderBy: { code: "asc" } });

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const a of accounts) {
    const n = nets.get(a.id) ?? { debit: 0, credit: 0 };
    const net = n.debit - n.credit; // positive => debit-side balance
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({ code: a.code, name: a.name, debit, credit });
    totalDebit += debit;
    totalCredit += credit;
  }

  return { rows, totalDebit, totalCredit, balanced: eq(totalDebit, totalCredit) };
}

export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}

export async function getIncomeStatement(from?: Date, to?: Date, client = prisma) {
  const range: DateRange = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  const nets = await accountNets(from || to ? range : undefined, client);
  const accounts = await client.account.findMany({ orderBy: { code: "asc" } });

  const revenue: StatementLine[] = [];
  const expense: StatementLine[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const a of accounts) {
    const cat = accountCategoryFor(a.type);
    const n = nets.get(a.id) ?? { debit: 0, credit: 0 };
    if (cat === "revenue") {
      const amount = n.credit - n.debit;
      if (amount !== 0) {
        revenue.push({ code: a.code, name: a.name, amount });
        totalRevenue += amount;
      }
    } else if (cat === "expense") {
      const amount = n.debit - n.credit;
      if (amount !== 0) {
        expense.push({ code: a.code, name: a.name, amount });
        totalExpense += amount;
      }
    }
  }

  return { revenue, expense, totalRevenue, totalExpense, netIncome: totalRevenue - totalExpense };
}

export async function getBalanceSheet(asOf?: Date, client = prisma) {
  const nets = await accountNets(asOf ? { lte: asOf } : undefined, client);
  const accounts = await client.account.findMany({ orderBy: { code: "asc" } });

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let revenue = 0;
  let expense = 0;

  for (const a of accounts) {
    const cat = accountCategoryFor(a.type);
    const n = nets.get(a.id) ?? { debit: 0, credit: 0 };
    if (cat === "asset") {
      const amount = n.debit - n.credit; // contra-assets net negative
      if (amount !== 0) {
        assets.push({ code: a.code, name: a.name, amount });
        totalAssets += amount;
      }
    } else if (cat === "liability") {
      const amount = n.credit - n.debit;
      if (amount !== 0) {
        liabilities.push({ code: a.code, name: a.name, amount });
        totalLiabilities += amount;
      }
    } else if (cat === "equity") {
      const amount = n.credit - n.debit;
      if (amount !== 0) {
        equity.push({ code: a.code, name: a.name, amount });
        totalEquity += amount;
      }
    } else if (cat === "revenue") {
      revenue += n.credit - n.debit;
    } else if (cat === "expense") {
      expense += n.debit - n.credit;
    }
  }

  const netIncome = revenue - expense; // current-period earnings, folded into equity side
  const totalLiabilitiesEquity = totalLiabilities + totalEquity + netIncome;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    totalLiabilitiesEquity,
    balanced: eq(totalAssets, totalLiabilitiesEquity),
  };
}

// ─── Arus Kas / Cash Flow (PSAK 2 · IAS 7, direct method) ────────────────────

/**
 * The cash side of the books: every account of type `cash_bank`. A movement is
 * "cash flow" only when it crosses this boundary — a transfer between two cash
 * accounts nets to zero inside its own journal and is correctly reported as no
 * flow at all.
 */
const CASH_TYPE = "cash_bank";

export type CashFlowCategory = "operating" | "investing" | "financing" | "uncategorised";

/**
 * ── Categorisation rule (stated explicitly, per PSAK 2 / IAS 7) ──────────────
 *
 * A cash movement is categorised by the **type of the counter-account** it is
 * posted against — the account on the other side of the journal, not the cash
 * account itself. Cash never tells you *why* it moved; the counter-account does.
 *
 *   operating  — the trading cycle: revenue and expense accounts, plus the
 *                working-capital accounts that are merely the timing of that
 *                same cycle (receivables, payables, inventory, tax payable and
 *                other current assets/liabilities). Cash collected from a
 *                customer is operating whether it lands on `revenue` directly
 *                or clears an `account_receivable`.
 *   investing  — non-current assets: buying or selling fixed assets, their
 *                accumulated depreciation contra-account, and other long-term
 *                assets.
 *   financing  — funding the business: owner equity contributions/withdrawals
 *                and long-term borrowings.
 *
 * Any account type not named below falls to `uncategorised`. That bucket is
 * deliberate: a type added to `ACCOUNT_TYPES` later, or a hand-posted account
 * with an unrecognised type, must show up as its own visible section rather
 * than being silently dropped or quietly folded into operating — which would
 * misstate operating cash flow, the single most-read line in this report.
 */
const CATEGORY_BY_ACCOUNT_TYPE: Record<string, CashFlowCategory> = {
  // Operating — trading cycle …
  revenue: "operating",
  other_income: "operating",
  cogs: "operating",
  expense: "operating",
  other_expense: "operating",
  // … and its working capital (timing of the same cycle).
  account_receivable: "operating",
  account_payable: "operating",
  inventory: "operating",
  tax_payable: "operating",
  other_current_asset: "operating",
  other_current_liability: "operating",
  // Investing — non-current assets.
  fixed_asset: "investing",
  accumulated_depreciation: "investing",
  other_asset: "investing",
  // Financing — how the business is funded.
  equity: "financing",
  long_term_liability: "financing",
};

/** Category of a cash movement, from its counter-account type. Unknown ⇒ visible bucket. */
export function cashFlowCategoryFor(accountType: string): CashFlowCategory {
  return CATEGORY_BY_ACCOUNT_TYPE[accountType] ?? "uncategorised";
}

export const CASH_FLOW_CATEGORY_LABELS: Record<CashFlowCategory, string> = {
  operating: "Aktivitas Operasi",
  investing: "Aktivitas Investasi",
  financing: "Aktivitas Pendanaan",
  uncategorised: "Belum Terkategori",
};

export const CASH_FLOW_CATEGORIES: CashFlowCategory[] = [
  "operating",
  "investing",
  "financing",
  "uncategorised",
];

/** One counter-account's contribution to cash flow over the period (IDR base). */
export interface CashFlowLine {
  code: string;
  name: string;
  type: string;
  inflow: number; // cash received via this counter-account
  outflow: number; // cash paid out via this counter-account
  net: number; // inflow − outflow
}

export interface CashFlowGroup {
  category: CashFlowCategory;
  label: string;
  lines: CashFlowLine[];
  inflow: number;
  outflow: number;
  net: number;
}

/** Per cash/bank account movement, for the reconciliation panel. */
export interface CashAccountMovement {
  code: string;
  name: string;
  opening: number;
  closing: number;
  net: number;
}

export interface CashFlowReport {
  groups: CashFlowGroup[];
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  cashAccounts: CashAccountMovement[];
  /** True when Σ categorised flows equals the movement in cash-account balances. */
  reconciled: boolean;
  /**
   * Foreign-currency journal lines in the period posted at rate = 1 — almost
   * certainly a rate the user never entered, so their IDR base is unreliable.
   * Counted across every line in the period, not only the ones that moved cash,
   * because it is a data-quality signal about the books rather than about this
   * report. Reported, never excluded (see the module header for why).
   */
  suspectUnrated: number;
}

/**
 * Arus Kas for a period, derived from the same journal lines as every other
 * report here — so it reconciles with Buku Besar and Neraca Saldo by construction.
 *
 * How a journal is turned into cash flow:
 *   1. Split its lines into cash (`cash_bank`) and counter lines.
 *   2. netCash = Σ(baseDebit − baseCredit) over the cash lines. Positive = cash in.
 *      If it is zero the journal moved no cash (or only shuffled it between cash
 *      accounts) and is skipped entirely.
 *   3. Because a journal balances, Σ(baseDebit − baseCredit) over *all* lines is
 *      zero, so the counter lines sum to exactly −netCash. Each counter line is
 *      therefore credited with −(baseDebit − baseCredit) of the cash movement:
 *      an exact allocation, no proportional estimate, and it always adds back up.
 *   4. That amount is filed under the counter-account's category (see above).
 */
export async function getCashFlow(from?: Date, to?: Date, client = prisma) {
  const accounts = await client.account.findMany({ orderBy: { code: "asc" } });
  const cashIds = new Set(accounts.filter((a) => a.type === CASH_TYPE).map((a) => a.id));

  const range: DateRange = {};
  if (from) range.gte = from;
  if (to) range.lte = to;

  const lines = await client.journalLine.findMany({
    where: from || to ? { journal: { date: range } } : {},
    orderBy: { id: "asc" },
  });

  // Group the period's lines by journal — cash flow is a per-journal question.
  const perJournal = new Map<number, typeof lines>();
  for (const l of lines) {
    const bucket = perJournal.get(l.journalId);
    if (bucket) bucket.push(l);
    else perJournal.set(l.journalId, [l]);
  }

  const tally = new Map<number, { inflow: number; outflow: number }>();
  let suspectUnrated = 0;

  for (const journalLines of perJournal.values()) {
    let netCash = 0;
    for (const l of journalLines) {
      if (l.currency !== "IDR" && Number(l.rate) === 1) suspectUnrated += 1;
      if (cashIds.has(l.accountId)) netCash += Number(l.baseDebit) - Number(l.baseCredit);
    }
    // No cash crossed the boundary (or only moved between cash accounts).
    if (Math.round(netCash * 100) === 0) continue;

    for (const l of journalLines) {
      if (cashIds.has(l.accountId)) continue;
      // Counter lines sum to −netCash, so −(debit − credit) is this line's exact share.
      const share = Number(l.baseCredit) - Number(l.baseDebit);
      if (Math.round(share * 100) === 0) continue;
      const t = tally.get(l.accountId) ?? { inflow: 0, outflow: 0 };
      if (share > 0) t.inflow += share;
      else t.outflow += -share;
      tally.set(l.accountId, t);
    }
  }

  const groups: CashFlowGroup[] = CASH_FLOW_CATEGORIES.map((category) => ({
    category,
    label: CASH_FLOW_CATEGORY_LABELS[category],
    lines: [],
    inflow: 0,
    outflow: 0,
    net: 0,
  }));
  const groupOf = new Map(groups.map((g) => [g.category, g]));

  // `accounts` is ordered by code, so each group's lines come out in code order.
  for (const a of accounts) {
    const t = tally.get(a.id);
    if (!t) continue;
    const net = t.inflow - t.outflow;
    if (Math.round(t.inflow * 100) === 0 && Math.round(t.outflow * 100) === 0) continue;
    const g = groupOf.get(cashFlowCategoryFor(a.type))!;
    g.lines.push({ code: a.code, name: a.name, type: a.type, inflow: t.inflow, outflow: t.outflow, net });
    g.inflow += t.inflow;
    g.outflow += t.outflow;
    g.net += net;
  }

  const totalInflow = groups.reduce((s, g) => s + g.inflow, 0);
  const totalOutflow = groups.reduce((s, g) => s + g.outflow, 0);
  const netChange = totalInflow - totalOutflow;

  // Opening/closing cash come from an independent aggregate over the cash accounts,
  // which is what makes `reconciled` a real check rather than a restatement.
  const openingNets = from ? await accountNets({ lt: from }, client) : undefined;
  const closingNets = await accountNets(to ? { lte: to } : undefined, client);

  const cashAccounts: CashAccountMovement[] = [];
  let openingCash = 0;
  let closingCash = 0;
  for (const a of accounts) {
    if (a.type !== CASH_TYPE) continue;
    const o = openingNets?.get(a.id) ?? { debit: 0, credit: 0 };
    const c = closingNets.get(a.id) ?? { debit: 0, credit: 0 };
    const opening = o.debit - o.credit;
    const closing = c.debit - c.credit;
    openingCash += opening;
    closingCash += closing;
    if (opening === 0 && closing === 0) continue;
    cashAccounts.push({ code: a.code, name: a.name, opening, closing, net: closing - opening });
  }

  return {
    groups,
    totalInflow,
    totalOutflow,
    netChange,
    openingCash,
    closingCash,
    cashAccounts,
    reconciled: eq(netChange, closingCash - openingCash),
    suspectUnrated,
  } satisfies CashFlowReport;
}
