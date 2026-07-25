import { requirePagePermission } from "@/lib/page-auth";
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

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePagePermission("report.read");
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Kode</TableHead>
              <TableHead>Nama Akun</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Kredit</TableHead>
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
                    title="Belum ada saldo sampai tanggal ini"
                    description="Neraca saldo dibangun dari jurnal. Catat transaksi pertama Anda, atau pilih tanggal yang lebih akhir."
                    actionLabel="+ Catat Transaksi"
                    actionHref="/finance/new"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>
                Total {tb.balanced ? <Badge variant="success">Seimbang</Badge> : <Badge variant="danger">Tidak seimbang</Badge>}
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
