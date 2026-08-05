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
import { StaticTable } from "@/components/ui/static-table";
import { type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import { budgetColumns, type BudgetColumnId } from "@/lib/statement-layout";
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

  /*
   * Susunan kolom layar kini datang dari penentu yang SAMA dengan PDF & lembar
   * sebar (`budgetColumns`), seperti lima laporan berkolom-pilihan lainnya.
   *
   * Sampai #189 tabel ini menuliskan keenam `<TableHead>`-nya sendiri, dan itu
   * sebabnya entri katalognya sengaja TIDAK menawarkan pilihan kolom: centang
   * yang hanya berlaku di berkas tapi tidak di layar melanggar aturan yang
   * dipegang seluruh Pusat Laporan. Penghalang itu kini hilang — menambahkan
   * `columns` ke entri `budget-realization` di `lib/report-catalog.ts` sudah
   * cukup untuk menyalakan pemilihnya, dan layar akan ikut menyusut sendiri.
   * Keputusan menyalakannya diserahkan ke pemilik laporan, bukan diselundupkan
   * lewat PR primitif tabel.
   *
   * Hari ini `visibleColumns` selalu kosong (katalognya belum punya `columns`),
   * dan daftar kosong berarti "seluruhnya" — jadi tabelnya tampil persis sama
   * seperti sebelum konversi.
   */
  const cols = budgetColumns({ visibleColumns: payload?.visibleColumns });

  type BudgetRow = (typeof report.rows)[number];

  const HEADERS: Record<BudgetColumnId, string> = {
    account: t("common.account"),
    budget: t("budget.colBudget"),
    actual: t("budget.colActual"),
    variance: t("budget.variance"),
    variancePct: "%",
    status: t("common.status"),
  };

  /** Satu id kolom -> satu kolom tabel; tidak ada daftar kolom kedua. */
  function columnFor(id: BudgetColumnId): SaiColumns<BudgetRow>[number] {
    switch (id) {
      case "budget":
        return moneyColumn<BudgetRow>({ dataIndex: "budget", title: HEADERS.budget });
      case "actual":
        return moneyColumn<BudgetRow>({ dataIndex: "actual", title: HEADERS.actual });
      case "variance":
        // Selisih diwarnai menurut `favorable` (bukan tanda) dan membawa awalan
        // "+" eksplisit — jadi ia BUKAN pemetaan 1:1 ke `moneyColumn`.
        return {
          key: "variance",
          dataIndex: "variance",
          title: HEADERS.variance,
          align: "right",
          render: (_v, r) => (
            <span className={`tabular-nums ${varianceClass(r.favorable)}`}>
              {signedCurrency(r.variance)}
            </span>
          ),
        };
      case "variancePct":
        return {
          key: "variancePct",
          dataIndex: "variancePct",
          title: HEADERS.variancePct,
          align: "right",
          render: (_v, r) => (
            <span className={`tabular-nums ${varianceClass(r.favorable)}`}>
              {pctLabel(r.variancePct)}
            </span>
          ),
        };
      case "status":
        return {
          key: "status",
          dataIndex: "status",
          title: HEADERS.status,
          render: (_v, r) => <VarianceBadge status={r.status} favorable={r.favorable} />,
        };
      case "account":
      default:
        return {
          key: "account",
          dataIndex: "name",
          title: HEADERS.account,
          className: "text-foreground",
          render: (_v, r) => (
            <>
              <span className="font-mono text-muted-foreground mr-2">{r.code}</span>
              {r.name}
            </>
          ),
        };
    }
  }

  const columns: SaiColumns<BudgetRow> = cols.map(columnFor);

  // Baris total dipetakan per KUNCI kolom, jadi ia ikut menyusut bersama
  // susunan kolom dan tak bisa meleset satu kolom.
  const summary: Record<string, React.ReactNode> = {
    account: t("common.total"),
    budget: <Money value={report.totals.budget} currency="IDR" />,
    actual: <Money value={report.totals.actual} currency="IDR" />,
    variance: (
      <span className="tabular-nums text-foreground">{signedCurrency(report.totals.variance)}</span>
    ),
    variancePct: (
      <span className="tabular-nums text-muted-foreground">
        {pctLabel(report.totals.variancePct)}
      </span>
    ),
  };

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
          {/* `StaticTable`: laporan ini hanya menampilkan — periodenya dipilih
              di atas dan memuat ulang di server, jadi tak ada yang dibeli
              dengan memindahkan seluruh barisnya ke peramban. */}
          <StaticTable<BudgetRow>
            columns={columns}
            rows={report.rows}
            rowKey={(r) => r.code}
            summary={summary}
          />
        </Card>
      )}
    </div>
  );
}
