import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getOpnameHistory } from "@/lib/stock-report";
import { resolveStockPeriod } from "@/lib/stock-period";
import { StockPeriodFilter } from "@/components/shared/stock-period-filter";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { AuditOutlined } from "@ant-design/icons";
export const dynamic = "force-dynamic";

/**
 * Riwayat Stok Opname — dikonversi ke `StaticTable` + token AntD (issue #198).
 * **Tetap server component.**
 */

/** `marginLG` 24 — jarak antar kartu sesi. */
const SECTION_GAP = 24;
const EMPTY_ICON_SIZE = 48;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/** Satu baris penyesuaian di dalam satu sesi hitung ulang. */
type AdjustmentRow = { itemName: string; unit: string | null; variance: number };

/**
 * Selisih bertanda. Tanda "+"/"−" adalah penanda NON-WARNA-nya, jadi lebih dan
 * susut tetap terbedakan di layar hitam-putih maupun oleh pembaca buta warna —
 * aturan uang MASTER.md, diterapkan ke kuantitas. Warnanya token UANG (#186),
 * yang lolos 4,5:1 sebagai teks 14px — bukan `colorSuccess` bawaan AntD.
 */
function Variance({ value }: { value: number }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const color =
    value > 0
      ? "var(--ant-color-money-positive)"
      : value < 0
        ? "var(--ant-color-money-negative)"
        : "var(--ant-color-text-secondary)";
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", color }}>
      {sign}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

export default async function OpnameHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ g?: string; d?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const sp = await searchParams;
  const period = resolveStockPeriod(sp.g, sp.d, sp.from, sp.to);
  const history = await getOpnameHistory(period.from, period.to);

  const range = t("stockMovement.periodRange", {
    from: formatDate(period.from),
    to: formatDate(period.to),
  });
  const monthYear = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    period.from
  );
  const label =
    period.granularity === "week"
      ? t("stockMovement.periodWeek", { week: period.weekNumber ?? 0, range })
      : period.granularity === "month"
        ? monthYear
        : period.granularity === "year"
          ? String(period.year)
          : range;

  const payload: StatementPayload = {
    kind: "opname-history",
    period: `${label} · ${range}`,
    sessions: history.sessions,
    sessionCount: history.sessionCount,
    adjustmentCount: history.adjustmentCount,
    totalIncrease: history.totalIncrease,
    totalDecrease: history.totalDecrease,
    netVariance: history.netVariance,
  };

  const columns: SaiColumns<AdjustmentRow> = [
    {
      ...textColumn<AdjustmentRow>({ dataIndex: "itemName", title: t("common.item") }),
      render: (raw) => <span style={{ fontWeight: STRONG }}>{String(raw)}</span>,
    },
    {
      ...textColumn<AdjustmentRow>({ dataIndex: "unit", title: t("common.unit") }),
      render: (raw) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {raw ? String(raw) : "-"}
        </span>
      ),
    },
    {
      key: "variance",
      dataIndex: "variance",
      title: t("inventory.colVariance"),
      align: "right",
      render: (_v, row) => <Variance value={row.variance} />,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("nav.items.inventoryOpname"), href: "/inventory/opname" },
          { label: t("opnameHistory.title") },
        ]}
        title={<TermTooltip term="stok_opname">{t("opnameHistory.title")}</TermTooltip>}
        description={t("opnameHistory.description")}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <StockPeriodFilter
        basePath="/inventory/opname/history"
        granularity={period.granularity}
        anchorISO={period.anchorISO}
        fromISO={period.fromISO}
        toISO={period.toISO}
        prevAnchorISO={period.prevAnchorISO}
        nextAnchorISO={period.nextAnchorISO}
        label={label}
      />

      {history.sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AuditOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
            title={t("opnameHistory.emptyTitle")}
            description={t("opnameHistory.emptyDescription")}
            actionLabel={t("nav.items.inventoryOpname")}
            actionHref="/inventory/opname"
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: SECTION_GAP }}>
          {/* Satu kartu per hitung ulang. Menggabungkan semuanya ke satu tabel
              panjang akan mengaburkan batas antar-peristiwa, padahal "kapan
              dihitung" justru pertanyaan pertama yang dibawa ke halaman ini. */}
          {history.sessions.map((s) => (
            <Card key={s.dateISO}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "12px var(--ant-padding-lg)",
                  borderBottom: "1px solid var(--ant-color-border-secondary)",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "var(--ant-font-size)", fontWeight: STRONG }}>
                  {t("opnameHistory.sessionTitle", { date: formatDate(new Date(`${s.dateISO}T12:00:00`)) })}
                </h2>
                <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
                  {t("opnameHistory.sessionSummary", {
                    count: s.adjustments.length,
                    increase: formatNumber(s.increase),
                    decrease: formatNumber(s.decrease),
                  })}
                </p>
              </div>
              <StaticTable<AdjustmentRow>
                columns={columns}
                rows={s.adjustments}
                rowKey={(a) => `${s.dateISO}-${a.itemName}`}
              />
            </Card>
          ))}

          <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
            {t("opnameHistory.periodSummary", {
              sessions: history.sessionCount,
              adjustments: history.adjustmentCount,
              net: formatNumber(history.netVariance),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
