/**
 * Realisasi vs Anggaran (issue #29) — the core report.
 *
 * "Actual" comes from `getBudgetReport` → `getActualsByCode` → `getIncomeStatement`,
 * the SAME reader as the Laba/Rugi report, so a budget's realisation always
 * reconciles with the P&L. This page reads and posts nothing. Over/under is shown
 * with an icon + label + sign (VarianceBadge), never colour alone.
 */
import { requirePageSession } from "@/lib/page-auth";
import { getBudgetReport, getSalesTargetRealization } from "@/lib/budget-report";
import { DEFAULT_VARIANCE_THRESHOLD_PCT } from "@/lib/budget";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
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
  if (favorable === null) return "text-gray-700";
  return favorable ? "text-green-700" : "text-red-600";
}

export default async function BudgetReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePageSession(["bos"]);
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
    <div className="max-w-6xl">
      <Breadcrumb items={[{ label: "Anggaran & Target", href: "/budget" }, { label: "Realisasi vs Anggaran" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Realisasi vs Anggaran</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        {periodText} · nilai dalam IDR · realisasi dibaca dari Laba/Rugi (buku besar). Peringatan
        di atas/di bawah memakai ambang ±{DEFAULT_VARIANCE_THRESHOLD_PCT}%.
      </p>

      <div className="mb-6">
        <PeriodPicker year={year} month={month} />
      </div>

      {/* Summary — a compact strip, not a dashboard rebuild. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Anggaran</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {formatCurrency(report.totals.budget, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Realisasi</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {formatCurrency(report.totals.actual, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Selisih</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {signedCurrency(report.totals.variance)}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {pctLabel(report.totals.variancePct)}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Peringatan</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums text-gray-900">
            {report.totals.alertCount > 0 && (
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
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
              <h2 className="font-semibold text-gray-900">Realisasi Target Penjualan</h2>
              <p className="mt-0.5 text-sm text-gray-500">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Akun</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Anggaran</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Realisasi</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Selisih</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">%</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-900">
                      <span className="font-mono text-gray-400 mr-2">{r.code}</span>
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(r.budget, "IDR")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(r.actual, "IDR")}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${varianceClass(r.favorable)}`}>
                      {signedCurrency(r.variance)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${varianceClass(r.favorable)}`}>
                      {pctLabel(r.variancePct)}
                    </td>
                    <td className="px-4 py-3">
                      <VarianceBadge status={r.status} favorable={r.favorable} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="px-4 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {formatCurrency(report.totals.budget, "IDR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {formatCurrency(report.totals.actual, "IDR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {signedCurrency(report.totals.variance)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {pctLabel(report.totals.variancePct)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
