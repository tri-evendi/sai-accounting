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
import { resolvePeriod } from "@/lib/report-catalog";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PurchasesBySupplierPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const result = await getPurchasesBySupplier(from, to);

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
      />

      <PeriodFilter basePath="/reports/purchases-by-supplier" from={fromISO} to={toISO} />

      <PartyRecapTable
        result={result}
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
