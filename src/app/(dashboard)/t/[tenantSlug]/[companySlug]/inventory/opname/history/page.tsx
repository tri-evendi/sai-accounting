import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getOpnameHistory } from "@/lib/stock-report";
import { resolveStockPeriod } from "@/lib/stock-period";
import { StockPeriodFilter } from "@/components/shared/stock-period-filter";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { ClipboardCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Selisih bertanda. Tanda "+"/"−" adalah penanda NON-WARNA-nya, jadi lebih dan
 * susut tetap terbedakan di layar hitam-putih maupun oleh pembaca buta warna —
 * aturan uang MASTER.md, diterapkan ke kuantitas.
 */
function Variance({ value }: { value: number }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const tone = value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`tabular-nums ${tone}`}>
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
            icon={<ClipboardCheck className="h-12 w-12" />}
            title={t("opnameHistory.emptyTitle")}
            description={t("opnameHistory.emptyDescription")}
            actionLabel={t("nav.items.inventoryOpname")}
            actionHref="/inventory/opname"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Satu kartu per hitung ulang. Menggabungkan semuanya ke satu tabel
              panjang akan mengaburkan batas antar-peristiwa, padahal "kapan
              dihitung" justru pertanyaan pertama yang dibawa ke halaman ini. */}
          {history.sessions.map((s) => (
            <Card key={s.dateISO}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-3">
                <h2 className="font-semibold text-foreground">
                  {t("opnameHistory.sessionTitle", { date: formatDate(new Date(`${s.dateISO}T12:00:00`)) })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("opnameHistory.sessionSummary", {
                    count: s.adjustments.length,
                    increase: formatNumber(s.increase),
                    decrease: formatNumber(s.decrease),
                  })}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("common.item")}</TableHead>
                    <TableHead>{t("common.unit")}</TableHead>
                    <TableHead className="text-right">{t("inventory.colVariance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.adjustments.map((a) => (
                    <TableRow key={`${s.dateISO}-${a.itemName}`}>
                      <TableCell className="font-medium text-foreground">{a.itemName}</TableCell>
                      <TableCell className="text-muted-foreground">{a.unit || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Variance value={a.variance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}

          <p className="text-sm text-muted-foreground">
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
