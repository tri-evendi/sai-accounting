import { requirePageSession } from "@/lib/page-auth";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
      <tr className="bg-muted">
        <td className="px-6 py-2 font-semibold text-foreground" colSpan={2}>{title}</td>
      </tr>
      {lines.map((l) => (
        <tr key={l.code} className="border-b border-border">
          <td className="px-6 py-2 pl-10 text-muted-foreground">
            <span className="font-mono text-muted-foreground mr-2">{l.code}</span>
            {l.name}
          </td>
          <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(l.amount, "IDR")}</td>
        </tr>
      ))}
      {lines.length === 0 && (
        <tr className="border-b border-border">
          <td className="px-6 py-2 pl-10 text-muted-foreground" colSpan={2}>—</td>
        </tr>
      )}
      <tr className="border-b border-border font-medium">
        <td className="px-6 py-2 text-foreground">Total {title}</td>
        <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(total, "IDR")}</td>
      </tr>
    </>
  );
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePageSession(["bos"]);
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
      <Breadcrumb items={[{ label: "Laporan", href: "/reports" }, { label: "Laba / Rugi" }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Laba / Rugi</h1>
          <p className="text-sm text-muted-foreground">{periodLabel} · nilai dalam IDR</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatementPDFButton payload={payload} />
          <StatementExcelButton payload={payload} />
        </div>
      </div>

      <PeriodFilter basePath="/reports/income-statement" from={fromISO} to={toISO} />

      <PlainSummary summary={summary} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <Section title="Pendapatan" lines={is.revenue} total={is.totalRevenue} />
              <Section title="Beban" lines={is.expense} total={is.totalExpense} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border text-base font-bold">
                <td className="px-6 py-4 text-foreground">
                  Laba / Rugi Bersih
                  <span className={`ml-2 text-sm font-medium ${profit ? "text-success-strong" : "text-destructive"}`}>
                    ({profit ? "Laba" : "Rugi"})
                  </span>
                </td>
                <td className={`px-6 py-4 text-right tabular-nums ${profit ? "text-success-strong" : "text-destructive"}`}>
                  {formatCurrency(is.netIncome, "IDR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
