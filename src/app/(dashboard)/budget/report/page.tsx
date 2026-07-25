/**
 * Realisasi vs Anggaran (issue #29) — the core report.
 *
 * "Actual" comes from `getBudgetReport` → `getActualsByCode` → `getIncomeStatement`,
 * the SAME reader as the Laba/Rugi report, so a budget's realisation always
 * reconciles with the P&L. This page reads and posts nothing. Over/under is shown
 * with an icon + label + sign (VarianceBadge), never colour alone.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { getBudgetReport, getSalesTargetRealization } from "@/lib/budget-report";
import { DEFAULT_VARIANCE_THRESHOLD_PCT } from "@/lib/budget";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PeriodPicker } from "@/components/shared/period-picker";
import { VarianceBadge } from "@/components/shared/variance-badge";
import { formatCurrency } from "@/lib/utils";
import { periodLabel } from "@/lib/period";
import { GaugeCircle, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

function pctLabel(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

/** Signed money with an explicit leading + on positives (negatives already carry −). */
function signedCurrency(amount: number): string {
  const formatted = formatCurrency(amount, "IDR");
  return amount > 0 ? `+${formatted}` : formatted;
}

function varianceClass(favorable: boolean | null): string {
  if (favorable === null) return "text-foreground";
  return favorable ? "text-success-strong" : "text-destructive";
}

export default async function BudgetReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePagePermission("budget.manage");
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const monthRaw = sp.month === undefined ? now.getMonth() + 1 : Number(sp.month);
  const month = monthRaw === 0 ? undefined : monthRaw;

  const [{ report, hasBudgets }, sales] = await Promise.all([
    getBudgetReport(year, month),
    getSalesTargetRealization(year, month),
  ]);
  const periodText = month === undefined ? `Tahun ${year}` : periodLabel(year, month);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[{ label: "Rencana & Target", href: "/budget" }, { label: "Realisasi vs Anggaran" }]}
        title="Realisasi vs Anggaran"
        description={
          <>
            {periodText} · nilai dalam IDR · realisasi dibaca dari Laba/Rugi (buku besar).
            Peringatan di atas/di bawah memakai ambang ±{DEFAULT_VARIANCE_THRESHOLD_PCT}%.
          </>
        }
      />

      <div className="mb-6">
        <PeriodPicker year={year} month={month} />
      </div>

      {/* Summary — a compact strip, not a dashboard rebuild. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Anggaran</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(report.totals.budget, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Realisasi</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(report.totals.actual, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selisih</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {signedCurrency(report.totals.variance)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {pctLabel(report.totals.variancePct)}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Peringatan</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums text-foreground">
            {report.totals.alertCount > 0 && (
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
            )}
            {report.totals.alertCount} akun
          </p>
        </Card>
      </div>

      {/* Sales target realisation — total level. */}
      {sales.hasTargets && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Realisasi Target Penjualan</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Target {formatCurrency(sales.totalTarget, "IDR")} · Realisasi{" "}
                <span className="tabular-nums">{formatCurrency(sales.actualSales, "IDR")}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-semibold tabular-nums ${varianceClass(sales.row.favorable)}`}>
                {signedCurrency(sales.row.variance)}
                <span className="ml-1 text-sm font-normal">{pctLabel(sales.row.variancePct)}</span>
              </span>
              <VarianceBadge status={sales.row.status} favorable={sales.row.favorable} />
            </div>
          </div>
        </Card>
      )}

      {!hasBudgets ? (
        <EmptyState
          icon={<GaugeCircle className="h-12 w-12" />}
          title="Belum ada anggaran untuk periode ini"
          description="Tetapkan anggaran akun terlebih dahulu di menu Anggaran Akun, lalu realisasinya akan muncul di sini."
          actionLabel="Ke Anggaran Akun"
          actionHref="/budget/accounts"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Akun</TableHead>
                <TableHead className="text-right">Anggaran</TableHead>
                <TableHead className="text-right">Realisasi</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="text-foreground">
                    <span className="font-mono text-muted-foreground mr-2">{r.code}</span>
                    {r.name}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.budget} currency="IDR" />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell value={r.actual} currency="IDR" />
                  </TableCell>
                  {/* Selisih diwarnai menurut favorable (bukan tanda) dan membawa
                      awalan "+" eksplisit — bukan pemetaan 1:1 ke MoneyCell. */}
                  <TableCell className={`text-right tabular-nums ${varianceClass(r.favorable)}`}>
                    {signedCurrency(r.variance)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${varianceClass(r.favorable)}`}>
                    {pctLabel(r.variancePct)}
                  </TableCell>
                  <TableCell>
                    <VarianceBadge status={r.status} favorable={r.favorable} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="font-bold hover:bg-transparent">
                <TableCell className="text-foreground">Total</TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={report.totals.budget} currency="IDR" />
                </TableCell>
                <TableCell className="p-0">
                  <MoneyCell value={report.totals.actual} currency="IDR" />
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {signedCurrency(report.totals.variance)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {pctLabel(report.totals.variancePct)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
    </div>
  );
}
