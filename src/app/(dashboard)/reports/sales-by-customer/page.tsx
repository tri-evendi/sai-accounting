/**
 * Penjualan per Pelanggan — rekap tagihan penjualan per pelanggan pada satu
 * periode (report catalog: `sales-by-customer`). Baca-saja; angka dari dokumen
 * sumber via `lib/party-recap.ts` (aturan IDR base di sana).
 */
import { requirePagePermission } from "@/lib/page-auth";
import { getSalesByCustomer } from "@/lib/party-recap";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "../report-filters";
import { PartyRecapTable } from "../party-recap-table";
import { resolvePeriod } from "@/lib/report-catalog";
import { formatDate } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SalesByCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePagePermission("report.read");
  const t = await getT();
  const sp = await searchParams;
  const { from, to, fromISO, toISO } = resolvePeriod(sp.from, sp.to);
  const result = await getSalesByCustomer(from, to);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.catalogReport.sales_by_customer.title") },
        ]}
        title={t("reports.catalogReport.sales_by_customer.title")}
        description={t("reports.periodWithCurrency", {
          from: formatDate(from),
          to: formatDate(to),
        })}
      />

      <PeriodFilter basePath="/reports/sales-by-customer" from={fromISO} to={toISO} />

      <PartyRecapTable
        result={result}
        labels={{
          party: t("reports.colCustomer"),
          documents: t("reports.colDocuments"),
          gross: t("reports.colGrossSales"),
          returns: t("reports.colReturns"),
          net: t("reports.colNet"),
          total: t("common.total"),
          noParty: t("reports.noCustomerLabel"),
          empty: t("reports.salesByCustomerEmpty"),
          grossNote: t("reports.grossIncludesTaxNote"),
          rowUnrated: (count) => t("reports.rowUnrated", { count }),
          unratedNote: (count) => t("reports.unratedDocsNote", { count }),
        }}
      />
    </div>
  );
}
