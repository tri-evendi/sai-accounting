/**
 * Nilai Persediaan — saldo & nilai tiap komoditas (katalog: `stock-value`).
 *
 * ── Kenapa halaman sendiri, bukan `/inventory` ───────────────────────────────
 * Kartu katalog ini dulu menunjuk halaman modul persediaan. Halaman itu tempat
 * BEKERJA: berkartu ringkasan, bergrafik, dan terpaginasi sepuluh baris — dan
 * sepuluh baris pertama bukan laporan nilai persediaan. Laporan harus memuat
 * seluruh barang sekaligus, karena satu-satunya angka yang dicari orang di sini
 * adalah TOTALNYA, dan total yang hanya menjumlahkan satu halaman adalah angka
 * yang salah tanpa satu pun tanda.
 *
 * Baca-saja. Nilainya memakai biaya rata-rata tertimbang — fungsi yang sama
 * dengan mesin HPP (`weightedAverageUnitCost`), jadi neraca dan laporan ini
 * tidak bisa memakai biaya berbeda untuk barang yang sama.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getStockValueReport } from "@/lib/stock-report";
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
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { reportById, resolveColumns } from "@/lib/report-catalog";
import { stockValueColumns, type StockValueColumnId } from "@/lib/statement-layout";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { Package, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StockValueReportPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ cols?: string }>;
}) {
  // Izin PERSEDIAAN, bukan `report.read`: isinya data stok, dan sebuah laporan
  // tidak melonggarkan siapa yang boleh melihat datanya.
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const sp = await searchParams;

  const report = await getStockValueReport();
  const definition = reportById("stock-value");
  const visibleColumns = definition ? resolveColumns(definition, sp.cols) : [];

  const payload: StatementPayload = {
    kind: "stock-value",
    // Tanpa parameter tanggal: ini POSISI SAAT INI. Biaya rata-rata tertimbang
    // dihitung dari seluruh riwayat gerakan, jadi "per tanggal" yang jujur
    // menuntut mesin costing bertanggal — bukan sekadar saringan di layar ini.
    period: `Per ${formatDate(new Date())}`,
    rows: report.rows,
    totalValue: report.totalValue,
    uncostedCount: report.uncostedCount,
    visibleColumns,
  };

  const cols = stockValueColumns(payload);
  const HEADERS: Record<StockValueColumnId, string> = {
    name: t("common.item"),
    unit: t("common.unit"),
    currentStock: t("inventory.colCurrentStock"),
    unitCost: t("inventory.colUnitCost"),
    stockValue: t("inventory.colValue"),
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.stock_value.title") },
        ]}
        title={
          <TermTooltip term="persediaan">{t("reports.catalogReport.stock_value.title")}</TermTooltip>
        }
        description={t("inventory.stockValueTitle")}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {cols.map((c) => (
                <TableHead
                  key={c}
                  className={c === "name" || c === "unit" ? undefined : "text-right"}
                >
                  {HEADERS[c]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={cols.length} className="p-0">
                  <EmptyState
                    icon={<Package className="h-12 w-12" />}
                    title={t("inventory.emptyTitle")}
                    description={t("inventory.emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((r) => (
                <TableRow key={r.name}>
                  {cols.map((c) => {
                    if (c === "name") {
                      return (
                        <TableCell key={c} className="font-medium text-foreground">
                          {r.name}
                        </TableCell>
                      );
                    }
                    if (c === "unit") {
                      return (
                        <TableCell key={c} className="text-muted-foreground">
                          {r.unit || "-"}
                        </TableCell>
                      );
                    }
                    if (c === "currentStock") {
                      return (
                        <TableCell key={c} className="text-right tabular-nums text-foreground">
                          {formatNumber(r.currentStock)}
                        </TableCell>
                      );
                    }
                    const value = c === "unitCost" ? r.unitCost : r.stockValue;
                    // Barang tanpa dasar biaya: garis, bukan Rp 0. Rp 0
                    // menyatakan "tidak bernilai" tentang barang yang ada
                    // wujudnya — yang benar adalah "biayanya belum tercatat".
                    return value == null ? (
                      <TableCell key={c} className="text-right text-muted-foreground">
                        —
                      </TableCell>
                    ) : (
                      <TableCell key={c} className="p-0">
                        <MoneyCell
                          className={c === "stockValue" ? "font-medium" : undefined}
                          value={value}
                          currency="IDR"
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
          {report.rows.length > 0 && (
            <TableFooter className="border-t-2 bg-transparent">
              <TableRow className="border-b-0 font-bold hover:bg-transparent">
                {cols.map((c) =>
                  c === "name" ? (
                    <TableCell key={c} className="text-foreground">
                      {t("common.total")}
                    </TableCell>
                  ) : c === "stockValue" ? (
                    <TableCell key={c} className="p-0">
                      <MoneyCell className="font-bold" value={report.totalValue} currency="IDR" />
                    </TableCell>
                  ) : (
                    <TableCell key={c} />
                  )
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {/* Barang bersaldo tanpa dasar biaya tidak ikut dijumlahkan; mengatakannya
          adalah yang menjaga total ini jujur, bukan membuatnya tampak lengkap. */}
      {report.uncostedCount > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("inventory.uncostedNote", { count: report.uncostedCount })}</span>
        </p>
      )}
    </div>
  );
}
