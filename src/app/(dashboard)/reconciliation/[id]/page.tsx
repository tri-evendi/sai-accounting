import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/page-auth";
import { getReconciliation } from "@/lib/bank-statements";
import { movementSigned } from "@/lib/reconciliation";
import { ReconciliationWorkspace } from "./reconciliation-workspace";

export const dynamic = "force-dynamic";

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(["bos", "core"]);

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const view = await getReconciliation(id);
  if (!view) notFound();

  const { statement, movements, summary } = view;
  const matchedCashByLine = new Map(
    statement.lines.filter((l) => l.cashAccountId != null).map((l) => [l.cashAccountId as number, l.id])
  );

  const bookRows = movements.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    description: m.description,
    amount: movementSigned(m),
    matched: matchedCashByLine.has(m.id),
    matchedLineId: matchedCashByLine.get(m.id) ?? null,
  }));

  const lineRows = statement.lines.map((l) => ({
    id: l.id,
    date: l.date.toISOString(),
    description: l.description,
    amount: Number(l.amount),
    matched: l.matched,
    cashAccountId: l.cashAccountId,
  }));

  return (
    <div>
      <div className="mb-4">
        <Link href="/reconciliation" className="text-sm text-primary hover:underline">
          ← Kembali ke daftar rekonsiliasi
        </Link>
      </div>

      <ReconciliationWorkspace
        statement={{
          id: statement.id,
          currency: statement.currency,
          periodStart: statement.periodStart.toISOString(),
          periodEnd: statement.periodEnd.toISOString(),
          openingBalance: Number(statement.openingBalance),
          closingBalance: Number(statement.closingBalance),
          status: statement.status,
        }}
        bookRows={bookRows}
        lineRows={lineRows}
        summary={{
          difference: summary.difference,
          statementNet: summary.statementNet,
          matchedBookTotal: summary.matchedBookTotal,
          bookTotal: summary.bookTotal,
          statementTotal: summary.statementTotal,
          complete: summary.complete,
          unmatchedBookCount: summary.unmatchedBook.length,
          unmatchedStatementCount: summary.unmatchedStatement.length,
        }}
      />
    </div>
  );
}
