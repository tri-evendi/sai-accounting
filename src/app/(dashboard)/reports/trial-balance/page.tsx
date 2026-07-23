import { requirePageSession } from "@/lib/page-auth";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { resolveAsOf } from "@/lib/report-catalog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Scale } from "lucide-react";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const { asOf, asOfISO } = resolveAsOf(sp.asOf);
  const tb = await getTrialBalance(asOf);

  const payload: StatementPayload = {
    kind: "trial-balance",
    period: `Per ${formatDate(asOf)}`,
    rows: tb.rows,
    totalDebit: tb.totalDebit,
    totalCredit: tb.totalCredit,
    balanced: tb.balanced,
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Pusat Laporan", href: "/reports" }, { label: "Neraca Saldo" }]}
        title="Neraca Saldo"
        description={<>Per {formatDate(asOf)} · nilai dalam IDR</>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <AsOfFilter basePath="/reports/trial-balance" asOf={asOfISO} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Kode</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Nama Akun</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Debit</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.code} className="border-b border-border">
                  <td className="px-6 py-2.5 font-mono text-foreground tabular-nums">{r.code}</td>
                  <td className="px-6 py-2.5">{r.name}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{r.debit > 0 ? formatCurrency(r.debit, "IDR") : "—"}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{r.credit > 0 ? formatCurrency(r.credit, "IDR") : "—"}</td>
                </tr>
              ))}
              {tb.rows.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<Scale className="h-12 w-12" />}
                      title="Belum ada saldo sampai tanggal ini"
                      description="Neraca saldo dibangun dari jurnal. Catat transaksi pertama Anda, atau pilih tanggal yang lebih akhir."
                      actionLabel="+ Catat Transaksi"
                      actionHref="/finance/new"
                    />
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-6 py-3" colSpan={2}>
                  Total {tb.balanced ? <Badge variant="success">Seimbang</Badge> : <Badge variant="danger">Tidak seimbang</Badge>}
                </td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(tb.totalDebit, "IDR")}</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(tb.totalCredit, "IDR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
