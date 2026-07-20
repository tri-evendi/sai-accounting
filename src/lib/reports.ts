/**
 * Financial reports derived from journal lines (IDR base):
 * Neraca Saldo (trial balance), Laba/Rugi (income statement), Neraca (balance sheet).
 * All balances are aggregated from posted journals so they always reconcile with the ledger.
 */
import { prisma } from "@/lib/prisma";
import { accountCategoryFor } from "@/lib/accounting";

type Nets = Map<number, { debit: number; credit: number }>;

interface DateRange {
  gte?: Date;
  lte?: Date;
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
