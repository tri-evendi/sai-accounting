import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getStockMovementReport } from "@/lib/stock-report";
import { resolveStockPeriod } from "@/lib/stock-period";
import { StockPeriodFilter } from "@/components/shared/stock-period-filter";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { PackageOpen, Info } from "lucide-react";

export const dynamic = "force-dynamic";

/** Quantity cell: right-aligned, tabular, id-ID — the money rules minus the currency. */
function Qty({ value, className = "" }: { value: number; className?: string }) {
  return (
    <TableCell className={`text-right tabular-nums ${className}`}>{formatNumber(value)}</TableCell>
  );
}

export default async function StockMovementPage({
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
  const report = await getStockMovementReport(period.from, period.to);

  // Satu label untuk layar, PDF, dan Excel — kalau ketiganya membangun sendiri,
  // cetakan bisa menyebut periode yang berbeda dari yang dilihat pengguna.
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
    kind: "stock-movement",
    // Cetakan selalu menyebut rentang tanggal PENUH, bukan "Juli 2026" saja:
    // lembar yang lepas dari layarnya harus bisa menjawab sendiri periodenya.
    period: `${label} · ${range}`,
    rows: report.rows.map(({ name, unit, opening, movedIn, movedOut, processed, closing }) => ({
      name,
      unit,
      opening,
      movedIn,
      movedOut,
      processed,
      closing,
    })),
    totalOpening: report.totalOpening,
    totalIn: report.totalIn,
    totalOut: report.totalOut,
    totalProcessed: report.totalProcessed,
    totalClosing: report.totalClosing,
    hasProcess: report.hasProcess,
    dormantCount: report.dormantCount,
  };

  // Jumlah kolom bergantung pada ada/tidaknya mutasi `process` — dipakai colSpan
  // keadaan kosong supaya tidak pernah meleset dari header di atasnya.
  const columnCount = report.hasProcess ? 7 : 6;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("stockMovement.title") },
        ]}
        // Nama awam di judul, istilah bakunya ("Kartu Stok / Mutasi Persediaan")
        // sejengkal jauhnya lewat tooltip — akuntan tetap menemukannya, pengguna
        // awam tidak perlu melewatinya lebih dulu.
        title={<TermTooltip term="kartu_stok">{t("stockMovement.title")}</TermTooltip>}
        description={t("stockMovement.description")}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <StockPeriodFilter
        basePath="/inventory/movement"
        granularity={period.granularity}
        anchorISO={period.anchorISO}
        fromISO={period.fromISO}
        toISO={period.toISO}
        prevAnchorISO={period.prevAnchorISO}
        nextAnchorISO={period.nextAnchorISO}
        label={label}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead>{t("common.unit")}</TableHead>
              <TableHead className="text-right">{t("stockMovement.colOpening")}</TableHead>
              <TableHead className="text-right">{t("stockMovement.colIn")}</TableHead>
              <TableHead className="text-right">{t("stockMovement.colOut")}</TableHead>
              {report.hasProcess && (
                <TableHead className="text-right">{t("stockMovement.colProcessed")}</TableHead>
              )}
              <TableHead className="text-right">{t("stockMovement.colClosing")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0">
                  <EmptyState
                    icon={<PackageOpen className="h-12 w-12" />}
                    title={t("stockMovement.emptyTitle")}
                    description={t("stockMovement.emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.unit || "-"}</TableCell>
                  <Qty value={r.opening} className="text-muted-foreground" />
                  {/* Masuk hijau / keluar merah mengikuti semantik uang app ini,
                      dan angkanya sendiri tetap penanda non-warna. */}
                  <Qty value={r.movedIn} className="text-success" />
                  <Qty value={r.movedOut} className="text-destructive" />
                  {report.hasProcess && <Qty value={r.processed} className="text-muted-foreground" />}
                  <Qty value={r.closing} className="font-semibold text-foreground" />
                </TableRow>
              ))
            )}
          </TableBody>
          {report.rows.length > 0 && (
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="border-b-0 font-bold hover:bg-transparent">
                <TableCell className="text-foreground">{t("common.total")}</TableCell>
                <TableCell />
                <Qty value={report.totalOpening} />
                <Qty value={report.totalIn} />
                <Qty value={report.totalOut} />
                {report.hasProcess && <Qty value={report.totalProcessed} />}
                <Qty value={report.totalClosing} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {/* Barang yang tidak bersaldo dan tidak bergerak disembunyikan; mengatakannya
          adalah yang membuat penghilangan itu jujur, bukan membuat daftar barang
          tampak lebih pendek daripada yang sebenarnya. */}
      {report.dormantCount > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("stockMovement.dormantNote", { count: report.dormantCount })}</span>
        </p>
      )}
    </div>
  );
}
