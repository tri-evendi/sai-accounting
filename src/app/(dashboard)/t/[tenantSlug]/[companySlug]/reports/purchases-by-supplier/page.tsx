/**
 * Pembelian per Pemasok — rekap pembelian per pemasok pada satu periode
 * (report catalog: `purchases-by-supplier`). Baca-saja; angka dari dokumen
 * sumber via `lib/party-recap.ts` (aturan IDR base di sana).
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getPurchasesBySupplier } from "@/lib/party-recap";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { PartyRecapTable } from "../party-recap-table";
import { reportById, resolveColumns, resolvePeriod } from "@/lib/report-catalog";
import { partyRecapColumns } from "@/lib/statement-layout";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PurchasesBySupplierPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string; cols?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const result = await getPurchasesBySupplier(from, to);

  // Kolom yang diminta dialog parameter; katalog yang memiliki daftarnya.
  const definition = reportById("purchases-by-supplier");
  const visibleColumns = definition ? resolveColumns(definition, sp.cols) : [];

  // Satu payload memberi makan tabel, PDF, dan lembar sebarnya — tiga permukaan
  // yang karena itu tak bisa berbeda angka maupun kolom.
  const payload: StatementPayload = {
    kind: "purchases-by-supplier",
    period: `Periode ${formatDate(from)} – ${formatDate(to)}`,
    rows: result.rows.map((r) => ({
      partyName: r.partyName,
      docCount: r.docCount,
      grossBase: r.grossBase,
      returnBase: r.returnBase,
      netBase: r.netBase,
      unratedCount: r.unratedCount,
    })),
    totals: {
      docCount: result.totals.docCount,
      grossBase: result.totals.grossBase,
      returnBase: result.totals.returnBase,
      netBase: result.totals.netBase,
      unratedCount: result.totals.unratedCount,
    },
    visibleColumns,
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.purchases_by_supplier.title") },
        ]}
        title={t("reports.catalogReport.purchases_by_supplier.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <PeriodFilter basePath="/reports/purchases-by-supplier" from={fromISO} to={toISO} />

      <PartyRecapTable
        result={result}
        columns={partyRecapColumns(payload)}
        labels={{
          party: t("reports.colSupplier"),
          documents: t("reports.colDocuments"),
          gross: t("reports.colGrossPurchases"),
          returns: t("reports.colReturns"),
          net: t("reports.colNet"),
          total: t("common.total"),
          noParty: t("reports.noSupplierLabel"),
          empty: t("reports.purchasesBySupplierEmpty"),
          grossNote: t("reports.grossIncludesTaxNote"),
          rowUnrated: (count) => t("reports.rowUnrated", { count }),
          unratedNote: (count) => t("reports.unratedDocsNote", { count }),
        }}
      />
    </div>
  );
}
