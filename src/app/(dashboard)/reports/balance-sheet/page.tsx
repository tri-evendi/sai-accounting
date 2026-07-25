import { requirePagePermission } from "@/lib/page-auth";
import { getBalanceSheet } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolveAsOf } from "@/lib/report-catalog";
import { balanceSheetSummary } from "@/lib/report-summary";
import { formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";

function Section({ title, lines, total }: { title: string; lines: StatementLine[]; total: number }) {
  return (
    <>
      <TableRow className="bg-muted hover:bg-muted">
        <TableCell className="py-2 font-semibold text-foreground" colSpan={2}>{title}</TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={l.code}>
          <TableCell className="py-2 pl-10 text-muted-foreground">
            <span className="font-mono text-muted-foreground mr-2">{l.code}</span>
            {l.name}
          </TableCell>
          <TableCell className="p-0">
            <MoneyCell className="py-2" value={l.amount} currency="IDR" />
          </TableCell>
        </TableRow>
      ))}
      {lines.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="py-2 pl-10 text-muted-foreground" colSpan={2}>—</TableCell>
        </TableRow>
      )}
      <TableRow className="font-medium">
        <TableCell className="py-2 text-foreground">Total {title}</TableCell>
        <TableCell className="p-0">
          <MoneyCell className="py-2" value={total} currency="IDR" />
        </TableCell>
      </TableRow>
    </>
  );
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePagePermission("report.read");
  const sp = await searchParams;
  const { asOf, asOfISO } = resolveAsOf(sp.asOf);
  const bs = await getBalanceSheet(asOf);
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
  const summary = balanceSheetSummary(bs, asOfLabel);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Pusat Laporan", href: "/reports" }, { label: "Neraca" }]}
        title="Neraca"
        description={<>{asOfLabel} · nilai dalam IDR</>}
        actions={
          <>
            <StatementPDFButton payload={payload} />
            <StatementExcelButton payload={payload} />
          </>
        }
      />

      <AsOfFilter basePath="/reports/balance-sheet" asOf={asOfISO} />

      <PlainSummary summary={summary} />

      <div className="mb-4">
        {bs.balanced ? (
          <Badge variant="success">Seimbang: Aset = Liabilitas + Ekuitas</Badge>
        ) : (
          <Badge variant="danger">Tidak seimbang — periksa jurnal</Badge>
        )}
      </div>

      <Card>
        <Table>
          <TableBody>
            <Section title="Aset" lines={bs.assets} total={bs.totalAssets} />
            <Section title="Liabilitas" lines={bs.liabilities} total={bs.totalLiabilities} />
            <Section title="Ekuitas" lines={bs.equity} total={bs.totalEquity} />
            <TableRow>
              <TableCell className="py-2 pl-10 text-muted-foreground">Laba/Rugi Berjalan</TableCell>
              <TableCell className="p-0">
                <MoneyCell className="py-2" value={bs.netIncome} currency="IDR" />
              </TableCell>
            </TableRow>
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="border-b-0 font-bold hover:bg-transparent">
              <TableCell className="text-foreground">Total Aset</TableCell>
              <TableCell className="p-0">
                <MoneyCell value={bs.totalAssets} currency="IDR" />
              </TableCell>
            </TableRow>
            <TableRow className="border-b-0 font-bold hover:bg-transparent">
              <TableCell className="text-foreground">Total Liabilitas + Ekuitas</TableCell>
              <TableCell className="p-0">
                <MoneyCell value={bs.totalLiabilitiesEquity} currency="IDR" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
