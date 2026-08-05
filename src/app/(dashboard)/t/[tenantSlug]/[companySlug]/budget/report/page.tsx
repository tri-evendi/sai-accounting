/**
 * Realisasi vs Anggaran (issue #29) — the core report.
 *
 * "Actual" comes from `getBudgetReport` → `getActualsByCode` → `getIncomeStatement`,
 * the SAME reader as the Laba/Rugi report, so a budget's realisation always
 * reconciles with the P&L. This page reads and posts nothing. Over/under is shown
 * with an icon + label + sign (VarianceBadge), never colour alone.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getBudgetReport, getSalesTargetRealization } from "@/lib/budget-report";
import { reportById } from "@/lib/report-catalog";
import { budgetPayload } from "@/lib/report-payload";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
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
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { monthNames } from "@/lib/i18n/labels";
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
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requirePagePermission("budget.manage", params);
  const t = await getT();
  const months = monthNames(await getDictionary(await getLocale()));
  const sp = await searchParams;
  const now = new Date();
  // URL bisa diedit tangan: `Number("abc")` = NaN yang lolos ke periodBounds/
  // Prisma dan berujung 500. Rentang mengikuti validations/period.ts
  // (tahun 2000–2100, bulan 1–12); nilai tak sah jatuh ke bawaan halaman
  // (tahun ini / bulan ini), bulan 0 tetap berarti setahun penuh.
  const yearRaw = Number(sp.year);
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const monthRaw = sp.month === undefined ? now.getMonth() + 1 : Number(sp.month);
  const month =
    monthRaw === 0
      ? undefined
      : Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
        ? monthRaw
        : now.getMonth() + 1;

  const [{ report, hasBudgets }, sales] = await Promise.all([
    getBudgetReport(year, month),
    getSalesTargetRealization(year, month),
  ]);
  // Payload cetak dari hasil pembacaan yang SAMA dengan tabel di bawah — satu
  // pembacaan, dua pemakai, jadi berkas dan layar tak bisa berselisih.
  const definition = reportById("budget-realization");
  const payload = definition ? budgetPayload(definition, year, month, report, sales) : null;

  const periodText =
    month === undefined
      ? t("budget.wholeYear", { year })
      : t("common.monthOfYear", { month: months[month - 1], year });

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("budget.breadcrumb"), href: "/budget" },
          { label: t("budget.surfaceReportTitle") },
        ]}
        title={t("budget.surfaceReportTitle")}
        description={t("budget.reportDescription", {
          period: periodText,
          threshold: DEFAULT_VARIANCE_THRESHOLD_PCT,
        })}
        actions={
          payload ? (
            <>
              <StatementPDFButton payload={payload} />
              <StatementExcelButton payload={payload} />
            </>
          ) : undefined
        }
      />

      <div className="mb-6">
        <PeriodPicker year={year} month={month} />
      </div>

      {/* Summary — a compact strip, not a dashboard rebuild. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("budget.totalBudget")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(report.totals.budget, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("budget.totalActual")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(report.totals.actual, "IDR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("budget.variance")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {signedCurrency(report.totals.variance)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {pctLabel(report.totals.variancePct)}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("budget.alerts")}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums text-foreground">
            {report.totals.alertCount > 0 && (
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
            )}
            {t("budget.alertAccounts", { count: report.totals.alertCount })}
          </p>
        </Card>
      </div>

      {/* Sales target realisation — total level. */}
      {sales.hasTargets && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">{t("budget.salesTargetTitle")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("budget.salesTargetPrefix", {
                  target: formatCurrency(sales.totalTarget, "IDR"),
                })}{" "}
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
          title={t("budget.emptyReportTitle")}
          description={t("budget.emptyReportDescription")}
          actionLabel={t("budget.emptyReportAction")}
          actionHref="/budget/accounts"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.account")}</TableHead>
                <TableHead className="text-right">{t("budget.colBudget")}</TableHead>
                <TableHead className="text-right">{t("budget.colActual")}</TableHead>
                <TableHead className="text-right">{t("budget.variance")}</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>{t("common.status")}</TableHead>
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
                <TableCell className="text-foreground">{t("common.total")}</TableCell>
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
