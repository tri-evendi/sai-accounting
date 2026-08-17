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
import { redirect } from "next/navigation";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import { tenantPath, type TenantScopedParams } from "@/lib/tenant-routes";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { TrialBalanceStatement } from "@/components/reports/trial-balance-statement";
import { reportById, resolveAsOf } from "@/lib/report-catalog";
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

  /*
   * Gerbang Mode Akuntan untuk SATU laporan (issue #355).
   *
   * Ditulis di sini, bukan dengan menambahkan `report.read` ke
   * `ACCOUNTING_PERMISSIONS`: izin itu dipakai bersama oleh enam laporan, dan
   * menandainya akan ikut menyembunyikan Laba/Rugi, Neraca, dan Arus Kas —
   * justru laporan yang paling perlu dibaca pemilik usaha awam. Penandanya
   * karena itu per-laporan (`ReportDefinition.accountingOnly`), dan halaman ini
   * membacanya dari katalog yang sama dengan yang menyaring kartunya.
   *
   * Tanpa baris ini, menyembunyikan kartunya di Pusat Laporan hanya
   * menyembunyikan PINTUNYA — alamatnya tetap terbuka bagi siapa pun yang
   * pernah menyimpannya. Kembalinya ke Pusat Laporan, bukan /dashboard: dari
   * sanalah pengguna datang, dan di sana ada laporan lain yang boleh dibuka.
   */
  if (
    reportById("trial-balance")?.accountingOnly &&
    !effectiveAccountantMode(session.user)
  ) {
    const { tenantSlug, companySlug } = await params;
    redirect(tenantPath(tenantSlug, companySlug, "/reports"));
  }

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
