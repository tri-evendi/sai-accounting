/**
 * Neraca Saldo — saldo debit & kredit tiap akun pada satu tanggal.
 *
 * ── Konversi ke `StaticTable` + token AntD (issue #198) ────────────────────
 * **Tetap server component.** Baris kakinya memakai `colSpan` lewat `summary`
 * (bentuk `SummaryRow`), jadi label "Total" + lencana seimbang/tak seimbang
 * tetap membentang di atas dua kolom pertama tanpa satu pun sel mentah.
 *
 * Saldo NOL tetap ditulis "—", bukan "Rp 0": nol di sini berarti akun itu tidak
 * bersaldo di sisi tersebut, dan `Money` sudah menulis "—" untuk nilai yang
 * tidak ada.
 *
 * ── Tabelnya pindah ke `<TrialBalanceStatement>` (issue #275) ──────────────
 * Bentuknya — termasuk keputusan #198 bahwa buku kosong TIDAK menggambar baris
 * Total — kini datang dari `trialBalanceLayout()`, penentu yang sama yang
 * dipakai tombol PDF dan tombol Excel di sebelah judul halaman ini. Sebelumnya
 * keputusan itu hanya berlaku di layar, sementara kedua berkas ekspor tetap
 * mencetak "Total (Seimbang)" di atas buku yang belum punya satu jurnal pun.
 * Halaman ini karena itu tinggal menyiapkan payload-nya, sekali, untuk ketiga
 * permukaan.
 */
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { TrialBalanceStatement } from "@/components/reports/trial-balance-statement";
import { resolveAsOf } from "@/lib/report-catalog";
import { formatDate } from "@/lib/utils";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const session = await requirePagePermission("report.read", params);
  // issue #103 — laporan adalah modul INTI, /finance/new milik `cash_bank`.
  const canRecordCash = await canOpenPage(session.user, "cash.write");
  const t = await getT();
  const sp = await searchParams;
  const { asOf, asOfISO } = resolveAsOf(sp.asOf);
  const tb = await getTrialBalance(asOf);

  const payload: StatementPayload = {
    kind: "trial-balance",
    // Isi dokumen cetak tetap bahasa Indonesia (lihat lib/pdf/statement-pdf).
    period: `Per ${formatDate(asOf)}`,
    rows: tb.rows,
    totalDebit: tb.totalDebit,
    totalCredit: tb.totalCredit,
    balanced: tb.balanced,
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("reports.breadcrumb"), href: "/reports" },
          { label: t("reports.trialBalanceTitle") },
        ]}
        title={t("reports.trialBalanceTitle")}
        description={t("reports.asOfWithCurrency", { date: formatDate(asOf) })}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <AsOfFilter basePath="/reports/trial-balance" asOf={asOfISO} />

      <Card>
        <TrialBalanceStatement
          payload={payload}
          t={t}
          actionLabel={canRecordCash ? t("reports.recordTransaction") : undefined}
          actionHref={canRecordCash ? "/finance/new" : undefined}
        />
      </Card>
    </div>
  );
}
