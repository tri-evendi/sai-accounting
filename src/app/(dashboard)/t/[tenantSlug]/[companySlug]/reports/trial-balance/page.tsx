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
 * tidak ada — jadi selnya tidak lagi punya cabang teks sendiri.
 *
 * Satu perbedaan perilaku yang disengaja: baris Total kini hanya muncul bila
 * ada baris yang ditotal (aturan `StaticTable`). Sebelumnya ia tetap digambar
 * di bawah keadaan kosong, sebagai "Total Rp 0 · Seimbang" pada buku yang belum
 * punya satu pun jurnal — pernyataan yang terdengar seperti hasil audit.
 */
import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable, type SummaryCell } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { resolveAsOf } from "@/lib/report-catalog";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Scale } from "lucide-react";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

/** Satu baris neraca saldo. */
type TrialBalanceRow = Awaited<ReturnType<typeof getTrialBalance>>["rows"][number];

/** Kode akun: monospace + tabular supaya digitnya berbaris lurus ke bawah. */
const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  fontVariantNumeric: "tabular-nums",
};

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

  const columns: SaiColumns<TrialBalanceRow> = [
    {
      ...textColumn<TrialBalanceRow>({ dataIndex: "code", title: t("accounts.colCode") }),
      render: (raw) => <span style={CODE_STYLE}>{String(raw)}</span>,
    },
    textColumn<TrialBalanceRow>({ dataIndex: "name", title: t("accounts.nameField") }),
    {
      // Saldo nol = tidak bersaldo di sisi ini; `Money` menulis "—" untuk nilai
      // yang tidak ada, jadi nolnya diterjemahkan di SINI, sekali.
      ...moneyColumn<TrialBalanceRow>({ dataIndex: "debit", title: t("common.debit") }),
      render: (_v, r) => <Money value={r.debit > 0 ? r.debit : undefined} currency="IDR" />,
    },
    {
      ...moneyColumn<TrialBalanceRow>({ dataIndex: "credit", title: t("common.credit") }),
      render: (_v, r) => <Money value={r.credit > 0 ? r.credit : undefined} currency="IDR" />,
    },
  ];

  /** Kaki: label + lencana membentang dua kolom pertama, lalu kedua totalnya. */
  const totalLabel: SummaryCell = {
    content: (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        {t("common.total")}
        {tb.balanced ? (
          <Badge variant="success">{t("reports.balanced")}</Badge>
        ) : (
          <Badge variant="danger">{t("reports.unbalanced")}</Badge>
        )}
      </span>
    ),
    colSpan: 2,
    scope: "row",
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
        <StaticTable<TrialBalanceRow>
          columns={columns}
          rows={tb.rows}
          rowKey={(r) => r.code}
          summary={[
            {
              cells: {
                code: totalLabel,
                debit: <Money value={tb.totalDebit} currency="IDR" />,
                credit: <Money value={tb.totalCredit} currency="IDR" />,
              },
            },
          ]}
          empty={
            <EmptyState
              icon={<Scale size={EMPTY_ICON_SIZE} />}
              title={t("reports.trialBalanceEmptyTitle")}
              description={t("reports.trialBalanceEmptyDescription")}
              actionLabel={canRecordCash ? t("reports.recordTransaction") : undefined}
              actionHref={canRecordCash ? "/finance/new" : undefined}
            />
          }
        />
      </Card>
    </div>
  );
}
