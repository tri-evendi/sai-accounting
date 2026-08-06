/**
 * Realisasi vs Anggaran (issue #29) — the core report.
 *
 * "Actual" comes from `getBudgetReport` → `getActualsByCode` → `getIncomeStatement`,
 * the SAME reader as the Laba/Rugi report, so a budget's realisation always
 * reconciles with the P&L. This page reads and posts nothing. Over/under is shown
 * with an icon + label + sign (VarianceBadge), never colour alone.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Tetap server component.** Warna selisih dulu `text-success-strong` /
 * `text-destructive`; ia kini `Money tone` (#186), yang berarti pasangan warna
 * uangnya hidup di SATU tempat. Yang tidak berubah: warna itu mengikuti
 * `favorable`, bukan tanda angkanya — selisih lebih pada akun PENDAPATAN itu
 * kabar baik, pada akun BEBAN itu kabar buruk — dan `VarianceBadge` di kolom
 * sebelahnya tetap menyebutkannya dengan ikon + kata.
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

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const STAT_BASIS = 220;
const EMPTY_ICON_SIZE = 48;

const numericStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

function pctLabel(pct: number | null): string {
  // Persentase yang tidak terdefinisi (anggaran nol) ditulis "—", bukan 0%.
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

/** Signed money with an explicit leading + on positives (negatives already carry −). */
function signedCurrency(amount: number): string {
  const formatted = formatCurrency(amount, "IDR");
  return amount > 0 ? `+${formatted}` : formatted;
}

/**
 * Warna selisih, dari token uang (#186) lewat variabel CSS — bukan
 * `theme.useToken()`, yang akan memaksa halaman ini jadi client. Ia teratasi
 * karena tabelnya dirender DI DALAM `<Card>` (lihat kepala `shared/aging.tsx`).
 *
 * Arahnya mengikuti `favorable`, BUKAN tanda angkanya: selisih lebih pada akun
 * pendapatan itu menguntungkan, pada akun beban tidak. Penanda non-warnanya
 * adalah tanda "+"/"−" pada angkanya DAN `VarianceBadge` di kolom Keterangan.
 */
function varianceColor(favorable: boolean | null): string | undefined {
  if (favorable === null) return undefined;
  return favorable ? "var(--ant-color-money-positive)" : "var(--ant-color-money-negative)";
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
            <span style={{ ...numericStyle, color: varianceColor(r.favorable) }}>
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
            <span style={{ ...numericStyle, color: varianceColor(r.favorable) }}>
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
          align: "left",
          render: (_v, r) => (
            <>
              <span
                style={{
                  marginInlineEnd: 8,
                  fontFamily: "var(--ant-font-family-code)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {r.code}
              </span>
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
    variance: <span style={numericStyle}>{signedCurrency(report.totals.variance)}</span>,
    variancePct: (
      <span style={{ ...numericStyle, color: "var(--ant-color-text-secondary)" }}>
        {pctLabel(report.totals.variancePct)}
      </span>
    ),
  };

  /** Kartu angka ringkas: keterangan kecil di atas, nilainya di bawah. */
  const statCard = (label: string, value: React.ReactNode) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p
          style={{
            margin: 0,
            fontSize: "var(--ant-font-size-sm)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-lg)",
            fontWeight: "var(--ant-font-weight-strong)",
            ...numericStyle,
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );

  return (
    <div>
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

      <div style={{ marginBottom: SECTION_GAP }}>
        <PeriodPicker year={year} month={month} />
      </div>

      {/* Summary — a compact strip, not a dashboard rebuild. */}
      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: SECTION_GAP,
        }}
      >
        {statCard(t("budget.totalBudget"), <Money value={report.totals.budget} currency="IDR" />)}
        {statCard(t("budget.totalActual"), <Money value={report.totals.actual} currency="IDR" />)}
        {statCard(
          t("budget.variance"),
          <>
            {signedCurrency(report.totals.variance)}
            <span
              style={{
                marginInlineStart: 8,
                fontSize: "var(--ant-font-size-sm)",
                fontWeight: "normal",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {pctLabel(report.totals.variancePct)}
            </span>
          </>
        )}
        {statCard(
          t("budget.alerts"),
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {/* Ikon peringatan = penanda kedua; angkanya dan katanya yang
                pertama. Ia hanya muncul ketika memang ada yang diperingatkan. */}
            {report.totals.alertCount > 0 && <AlertTriangle size="1em" aria-hidden="true" />}
            {t("budget.alertAccounts", { count: report.totals.alertCount })}
          </span>
        )}
      </div>

      {/* Sales target realisation — total level. */}
      {sales.hasTargets && (
        <Card style={{ marginBottom: SECTION_GAP }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "var(--ant-padding-lg)",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size)",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                {t("budget.salesTargetTitle")}
              </h2>
              <p
                style={{
                  margin: 0,
                  marginTop: 2,
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("budget.salesTargetPrefix", {
                  target: formatCurrency(sales.totalTarget, "IDR"),
                })}{" "}
                <span style={numericStyle}>{formatCurrency(sales.actualSales, "IDR")}</span>
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  ...numericStyle,
                  fontSize: "var(--ant-font-size-lg)",
                  fontWeight: "var(--ant-font-weight-strong)",
                  color: varianceColor(sales.row.favorable),
                }}
              >
                {signedCurrency(sales.row.variance)}
                <span
                  style={{
                    marginInlineStart: 4,
                    fontSize: "var(--ant-font-size-sm)",
                    fontWeight: "normal",
                  }}
                >
                  {pctLabel(sales.row.variancePct)}
                </span>
              </span>
              <VarianceBadge status={sales.row.status} favorable={sales.row.favorable} />
            </div>
          </div>
        </Card>
      )}

      {!hasBudgets ? (
        <EmptyState
          icon={<GaugeCircle size={EMPTY_ICON_SIZE} />}
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
