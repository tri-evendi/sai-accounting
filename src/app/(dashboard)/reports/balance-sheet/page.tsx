import { requirePagePermission } from "@/lib/page-auth";
import { getBalanceSheet } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton, StatementExcelButton } from "@/components/shared/pdf-export-buttons";
import { PlainSummary } from "@/components/reports/plain-summary";
import { resolveAsOf } from "@/lib/report-catalog";
import { balanceSheetSummary } from "@/lib/report-summary";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";

function Section({ title, lines, total }: { title: string; lines: StatementLine[]; total: number }) {
  return (
    <>
      <tr className="bg-muted">
        <td className="px-6 py-2 font-semibold text-foreground" colSpan={2}>{title}</td>
      </tr>
      {lines.map((l) => (
        <tr key={l.code} className="border-b border-border">
          <td className="px-6 py-2 pl-10 text-muted-foreground">
            <span className="font-mono text-muted-foreground mr-2">{l.code}</span>
            {l.name}
          </td>
          <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(l.amount, "IDR")}</td>
        </tr>
      ))}
      {lines.length === 0 && (
        <tr className="border-b border-border">
          <td className="px-6 py-2 pl-10 text-muted-foreground" colSpan={2}>—</td>
        </tr>
      )}
      <tr className="border-b border-border font-medium">
        <td className="px-6 py-2 text-foreground">Total {title}</td>
        <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(total, "IDR")}</td>
      </tr>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <Section title="Aset" lines={bs.assets} total={bs.totalAssets} />
              <Section title="Liabilitas" lines={bs.liabilities} total={bs.totalLiabilities} />
              <Section title="Ekuitas" lines={bs.equity} total={bs.totalEquity} />
              <tr className="border-b border-border">
                <td className="px-6 py-2 pl-10 text-muted-foreground">Laba/Rugi Berjalan</td>
                <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(bs.netIncome, "IDR")}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="px-6 py-3 text-foreground">Total Aset</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(bs.totalAssets, "IDR")}</td>
              </tr>
              <tr className="font-bold">
                <td className="px-6 py-3 text-foreground">Total Liabilitas + Ekuitas</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(bs.totalLiabilitiesEquity, "IDR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
