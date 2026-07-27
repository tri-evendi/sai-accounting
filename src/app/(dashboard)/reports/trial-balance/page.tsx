import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
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

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const session = await requirePagePermission("report.read");
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("accounts.colCode")}</TableHead>
              <TableHead>{t("accounts.nameField")}</TableHead>
              <TableHead className="text-right">{t("common.debit")}</TableHead>
              <TableHead className="text-right">{t("common.credit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tb.rows.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="py-2.5 font-mono text-foreground tabular-nums">{r.code}</TableCell>
                <TableCell className="py-2.5">{r.name}</TableCell>
                {/* Saldo nol tampil "—", bukan "Rp 0" — jadi selnya tetap
                    dirender sendiri dengan `Money` di dalamnya. */}
                <TableCell className="py-2.5 text-right tabular-nums">
                  {r.debit > 0 ? <Money value={r.debit} currency="IDR" /> : "—"}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {r.credit > 0 ? <Money value={r.credit} currency="IDR" /> : "—"}
                </TableCell>
              </TableRow>
            ))}
            {tb.rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    icon={<Scale className="h-12 w-12" />}
                    title={t("reports.trialBalanceEmptyTitle")}
                    description={t("reports.trialBalanceEmptyDescription")}
                    actionLabel={canRecordCash ? t("reports.recordTransaction") : undefined}
                    actionHref={canRecordCash ? "/finance/new" : undefined}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>
                {t("common.total")}{" "}
                {tb.balanced ? (
                  <Badge variant="success">{t("reports.balanced")}</Badge>
                ) : (
                  <Badge variant="danger">{t("reports.unbalanced")}</Badge>
                )}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={tb.totalDebit} currency="IDR" />
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={tb.totalCredit} currency="IDR" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
