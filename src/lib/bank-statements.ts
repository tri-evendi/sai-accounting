/**
 * Bank reconciliation — database-facing helpers (issue #24).
 *
 * The pure matching/difference logic lives in `@/lib/reconciliation`; this module
 * only loads the right rows and feeds them in, so the page and the API compute
 * the same summary by construction. Nothing here posts a journal.
 */
import { prisma } from "@/lib/prisma";
import {
  summarizeReconciliation,
  movementSigned,
  type ReconItem,
  type ReconciliationSummary,
} from "@/lib/reconciliation";
import type { BankStatement, BankStatementLine, CashAccount } from "@/generated/prisma/client";

type Client = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** End of the period's last day, so a movement any time that day is in scope. */
function endOfDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

export interface ReconciliationView {
  statement: BankStatement & { lines: BankStatementLine[] };
  /** Book movements (`cash_accounts`) in scope for this statement. */
  movements: CashAccount[];
  summary: ReconciliationSummary;
}

/**
 * Book movements in scope: same cash book (cashType + currency) as the statement,
 * dated within the period. This is the internal side reconciliation matches against.
 */
export async function scopedMovements(
  statement: Pick<BankStatement, "cashType" | "currency" | "periodStart" | "periodEnd">,
  client: Client = prisma
): Promise<CashAccount[]> {
  return client.cashAccount.findMany({
    where: {
      type: statement.cashType,
      currency: statement.currency,
      date: { gte: statement.periodStart, lte: endOfDay(statement.periodEnd) },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

/** Load a statement, its lines, the in-scope book movements and the summary. */
export async function getReconciliation(
  statementId: number,
  client: Client = prisma
): Promise<ReconciliationView | null> {
  const statement = await client.bankStatement.findUnique({
    where: { id: statementId },
    include: { lines: { orderBy: [{ date: "asc" }, { id: "asc" }] } },
  });
  if (!statement) return null;

  const movements = await scopedMovements(statement, client);

  // A book movement is matched iff a line of THIS statement points at it.
  const matchedCashIds = new Set(
    statement.lines.map((l) => l.cashAccountId).filter((v): v is number => v != null)
  );

  const book: ReconItem[] = movements.map((m) => ({
    id: m.id,
    amount: movementSigned(m),
    matched: matchedCashIds.has(m.id),
  }));
  const stmtItems: ReconItem[] = statement.lines.map((l) => ({
    id: l.id,
    amount: Number(l.amount),
    matched: l.matched,
  }));

  const summary = summarizeReconciliation({
    openingBalance: Number(statement.openingBalance),
    closingBalance: Number(statement.closingBalance),
    book,
    statement: stmtItems,
  });

  return { statement, movements, summary };
}

/**
 * Reconciliation status of each bank cash book, for the Kas & Bank report.
 * Returns, per (cashType='bank', currency), how many movements in that book are
 * reconciled vs total, plus the latest statement's period and status.
 */
export interface BankReconStatus {
  currency: string;
  reconciledCount: number;
  totalCount: number;
  latestStatus: string | null;
  latestPeriodEnd: Date | null;
}

export async function bankReconciliationStatus(
  client: Client = prisma
): Promise<BankReconStatus[]> {
  const movements = await client.cashAccount.findMany({
    where: { type: "bank" },
    select: { currency: true, reconciled: true },
  });
  const statements = await client.bankStatement.findMany({
    where: { cashType: "bank" },
    orderBy: { periodEnd: "desc" },
    select: { currency: true, status: true, periodEnd: true },
  });

  const byCurrency = new Map<string, BankReconStatus>();
  for (const m of movements) {
    const row =
      byCurrency.get(m.currency) ??
      { currency: m.currency, reconciledCount: 0, totalCount: 0, latestStatus: null, latestPeriodEnd: null };
    row.totalCount += 1;
    if (m.reconciled) row.reconciledCount += 1;
    byCurrency.set(m.currency, row);
  }
  // statements are ordered newest-first, so the first seen per currency is latest.
  for (const s of statements) {
    const row =
      byCurrency.get(s.currency) ??
      { currency: s.currency, reconciledCount: 0, totalCount: 0, latestStatus: null, latestPeriodEnd: null };
    if (row.latestPeriodEnd === null) {
      row.latestStatus = s.status;
      row.latestPeriodEnd = s.periodEnd;
    }
    byCurrency.set(s.currency, row);
  }
  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}
