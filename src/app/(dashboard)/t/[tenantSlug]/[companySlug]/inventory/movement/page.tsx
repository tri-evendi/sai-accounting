import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getStockMovementReport } from "@/lib/stock-report";
import { resolveStockPeriod } from "@/lib/stock-period";
import { StockPeriodFilter } from "@/components/shared/stock-period-filter";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { formatDate, formatNumber } from "@/lib/utils";
import { reportById, resolveColumns } from "@/lib/report-catalog";
import { stockMovementColumns, type StockMovementColumnId } from "@/lib/statement-layout";
import { getT } from "@/lib/i18n/server";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { PackageOpen, Info } from "lucide-react";

export const dynamic = "force-dynamic";

/** Satu baris laporan — bentuk yang dibaca kolom di bawah. */
type MovementRow = Awaited<ReturnType<typeof getStockMovementReport>>["rows"][number];

export default async function StockMovementPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ g?: string; d?: string; from?: string; to?: string; cols?: string }>;
}) {
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const sp = await searchParams;
  const period = resolveStockPeriod(sp.g, sp.d, sp.from, sp.to);
  const report = await getStockMovementReport(period.from, period.to);

  // Kolom yang diminta dialog parameter (`?cols=`). Katalog yang memiliki
  // daftar kolomnya, jadi id asing & daftar kosong dibereskan di sana — bukan
  // dengan tebakan di halaman ini.
  const definition = reportById("stock-movement");
  const visibleColumns = definition ? resolveColumns(definition, sp.cols) : [];

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
    visibleColumns,
  };

  // Susunan kolom layar diputuskan penentu yang SAMA dengan PDF & lembar sebar
  // (`stockMovementColumns`), jadi pratinjau yang dibuka dari dialog parameter
  // memperlihatkan persis kolom yang akan ikut ke berkasnya.
  //
  // Perhatikan arah aliranya: penentu menghasilkan DAFTAR ID, lalu id itu
  // dipetakan ke kolom di bawah. Yang TIDAK boleh terjadi adalah menulis
  // daftar kolom kedua di sebelahnya — itulah cara pratinjau dan berkas
  // ekspor mulai berbeda kolom, bug yang baru saja ditutup dan yang dikunci
  // `tests/report-export.test.ts`.
  const cols = stockMovementColumns(payload);
  const HEADERS: Record<StockMovementColumnId, string> = {
    name: t("common.item"),
    unit: t("common.unit"),
    opening: t("stockMovement.colOpening"),
    movedIn: t("stockMovement.colIn"),
    movedOut: t("stockMovement.colOut"),
    processed: t("stockMovement.colProcessed"),
    closing: t("stockMovement.colClosing"),
  };
  // Masuk hijau / keluar merah mengikuti semantik uang app ini, dan angkanya
  // sendiri tetap penanda non-warna. Varian `-strong`, bukan warna penuh: ini
  // sel tabel `text-sm`, yang menuntut 4,5:1 (MASTER.md §Color Palette).
  const QTY_CLASS: Record<Exclude<StockMovementColumnId, "name" | "unit">, string> = {
    opening: "text-muted-foreground",
    movedIn: "text-success-strong",
    movedOut: "text-destructive-strong",
    processed: "text-muted-foreground",
    closing: "font-semibold text-foreground",
  };
  const TOTALS: Record<Exclude<StockMovementColumnId, "name" | "unit">, number> = {
    opening: report.totalOpening,
    movedIn: report.totalIn,
    movedOut: report.totalOut,
    processed: report.totalProcessed,
    closing: report.totalClosing,
  };

  /** Satu id kolom -> satu kolom tabel. Tidak ada id yang tak punya bentuk. */
  function columnFor(id: StockMovementColumnId): SaiColumns<MovementRow>[number] {
    if (id === "name") {
      return {
        ...textColumn<MovementRow>({ dataIndex: "name", title: HEADERS.name }),
        className: "font-medium text-foreground",
      };
    }
    if (id === "unit") {
      return {
        ...textColumn<MovementRow>({ dataIndex: "unit", title: HEADERS.unit }),
        className: "text-muted-foreground",
        // Satuan kosong ditulis "-": selnya memang tak berisi, dan itu berbeda
        // dari satuan yang belum diketahui.
        render: (raw) => (raw ? String(raw) : "-"),
      };
    }
    return qtyColumn<MovementRow>({
      dataIndex: id,
      title: HEADERS[id],
      className: QTY_CLASS[id],
    });
  }

  const columns: SaiColumns<MovementRow> = cols.map(columnFor);

  // Baris total dipetakan per KUNCI kolom, jadi ia ikut menyusut bersama
  // pilihan kolom pengguna dan tak bisa meleset satu kolom.
  const summary: Record<string, React.ReactNode> = { name: t("common.total") };
  for (const id of cols) {
    if (id === "name" || id === "unit") continue;
    summary[id] = (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(TOTALS[id])}</span>
    );
  }

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
        {/*
         * `StaticTable`, bukan `DataTable`: laporan ini hanya MENAMPILKAN.
         * Periodenya dipilih di atas (yang memuat ulang di server) dan tak ada
         * satu pun kendali per kolom, jadi tidak ada yang bisa dibeli dengan
         * memindahkan seluruh baris persediaan ke peramban.
         */}
        <StaticTable<MovementRow>
          columns={columns}
          rows={report.rows}
          rowKey={(r) => r.id}
          summary={summary}
          empty={
            <EmptyState
              icon={<PackageOpen className="h-12 w-12" />}
              title={t("stockMovement.emptyTitle")}
              description={t("stockMovement.emptyDescription")}
            />
          }
        />
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
