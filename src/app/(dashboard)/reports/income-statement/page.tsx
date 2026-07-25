import { requirePagePermission } from "@/lib/page-auth";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolvePeriod } from "@/lib/report-catalog";
import { incomeStatementSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";

function Section({ title, lines, total }: { title: string; lines: StatementLine[]; total: number }) {
  return (
    <>
      <TableRow className="bg-muted hover:bg-muted">
        <TableCell className="py-2 font-semibold text-foreground" colSpan={2}>{title}</TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={l.code}>
          <TableCell className="py-2 pl-10 text-muted-foreground">
            <span className="font-mono text-muted-foreground mr-2">{l.code}</span>
            {l.name}
          </TableCell>
          <TableCell className="p-0">
            <MoneyCell className="py-2" value={l.amount} currency="IDR" />
          </TableCell>
        </TableRow>
      ))}
      {lines.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="py-2 pl-10 text-muted-foreground" colSpan={2}>—</TableCell>
        </TableRow>
      )}
      <TableRow className="font-medium">
        <TableCell className="py-2 text-foreground">Total {title}</TableCell>
        <TableCell className="p-0">
          <MoneyCell className="py-2" value={total} currency="IDR" />
        </TableCell>
      </TableRow>
    </>
  );
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read");
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const is = await getIncomeStatement(from, to);
  const profit = is.netIncome >= 0;
  const periodLabel = `Periode ${formatDate(from)} – ${formatDate(to)}`;

  // One payload feeds both exports and the plain-language summary, so the PDF,
  // the Excel file, the sentence and the table below can never disagree.
  const payload: StatementPayload = {
    kind: "income-statement",
    period: periodLabel,
    revenue: is.revenue,
    expense: is.expense,
    totalRevenue: is.totalRevenue,
    totalExpense: is.totalExpense,
    netIncome: is.netIncome,
  };
  const summary = incomeStatementSummary(is, periodLabel);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Pusat Laporan", href: "/reports" }, { label: "Laba / Rugi" }]}
        title="Laba / Rugi"
        description={<>{periodLabel} · nilai dalam IDR</>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/income-statement" from={fromISO} to={toISO} />

      <PlainSummary summary={summary} />

      <Card>
        <Table>
          <TableBody>
            <Section title="Pendapatan" lines={is.revenue} total={is.totalRevenue} />
            <Section title="Beban" lines={is.expense} total={is.totalExpense} />
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="border-b-0 text-base font-bold hover:bg-transparent">
              <TableCell className="py-4 text-foreground">
                Laba / Rugi Bersih
                <span className={`ml-2 text-sm font-medium ${profit ? "text-success-strong" : "text-destructive"}`}>
                  ({profit ? "Laba" : "Rugi"})
                </span>
              </TableCell>
              {/* Laba/rugi diwarnai `text-success-strong`/`text-destructive`
                  berpasangan dengan label "(Laba)"/"(Rugi)" di sebelahnya —
                  bukan pewarnaan bawaan `Money` (hanya negatif, token
                  `text-destructive`/`text-success`), jadi sel ini tetap
                  dirender seperti semula demi paritas. */}
              <TableCell className={`py-4 text-right tabular-nums ${profit ? "text-success-strong" : "text-destructive"}`}>
                {formatCurrency(is.netIncome, "IDR")}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
