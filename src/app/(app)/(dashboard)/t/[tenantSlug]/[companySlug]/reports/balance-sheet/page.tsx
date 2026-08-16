/**
 * Neraca — halaman laporan.
 *
 * ── Bentuknya TIDAK ditentukan di sini (issue #258) ────────────────────────
 * Sampai #237 berkas ini menyusun barisnya sendiri lewat penolong `section()`
 * lokal, sementara `report-export.ts` dan `pdf/statement-pdf.ts` menyusun dua
 * bentuk lain untuk laporan yang sama — dan `totalEquity + netIncome` ditulis
 * ulang di ketiganya. Sekarang barisnya datang dari `balanceSheetLayout()` di
 * `src/lib/statement-layout.ts`, dan tabelnya dari `<BalanceSheetStatement>`
 * yang memakan **payload yang sama persis** dengan tombol PDF dan tombol Excel
 * di sebelahnya. `tests/balance-sheet-shape.test.ts` membandingkan ketiganya
 * baris demi baris.
 *
 * Yang tersisa di halaman ini hanyalah tugas halaman: izin, parameter, membaca
 * buku besar, ringkasan bahasa awam, dan tombol-tombolnya.
 */

import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getBalanceSheet } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { BalanceSheetStatement } from "@/components/reports/balance-sheet-statement";
import { resolveAsOf } from "@/lib/report-catalog";
import { balanceSheetSummary } from "@/lib/report-summary";
import { formatDate } from "@/lib/utils";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const sp = await searchParams;
  const { asOf, asOfISO } = resolveAsOf(sp.asOf);
  const bs = await getBalanceSheet(asOf);
  // Judul periode untuk dokumen cetak & ringkasan bahasa awam — keduanya
  // masih berbahasa Indonesia (lib/pdf, lib/report-summary).
  const asOfLabel = `Per ${formatDate(asOf)}`;

  const payload: StatementPayload = {
    kind: "balance-sheet",
    period: asOfLabel,
    assets: bs.assets,
    liabilities: bs.liabilities,
    equity: bs.equity,
    totalAssets: bs.totalAssets,
    totalLiabilities: bs.totalLiabilities,
    totalEquity: bs.totalEquity,
    netIncome: bs.netIncome,
    totalLiabilitiesEquity: bs.totalLiabilitiesEquity,
    balanced: bs.balanced,
  };
  const summary = balanceSheetSummary(bs, asOfLabel, t);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.balanceSheetTitle") },
        ]}
        title={t("reports.balanceSheetTitle")}
        description={t("reports.asOfWithCurrency", { date: formatDate(asOf) })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <AsOfFilter basePath="/reports/balance-sheet" asOf={asOfISO} />

      <PlainSummary summary={summary} />

      <Card>
        <BalanceSheetStatement payload={payload} t={t} />
      </Card>
    </div>
  );
}
