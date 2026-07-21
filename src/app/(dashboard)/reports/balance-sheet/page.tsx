import { requirePageSession } from "@/lib/page-auth";
import { getBalanceSheet } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AsOfFilter } from "../report-filters";
import { StatementPDFButton } from "@/components/shared/pdf-export-buttons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Section({ title, lines, total }: { title: string; lines: StatementLine[]; total: number }) {
  return (
    <>
      <tr className="bg-gray-50">
        <td className="px-6 py-2 font-semibold text-gray-700" colSpan={2}>{title}</td>
      </tr>
      {lines.map((l) => (
        <tr key={l.code} className="border-b border-gray-100">
          <td className="px-6 py-2 pl-10 text-gray-600">
            <span className="font-mono text-gray-400 mr-2">{l.code}</span>
            {l.name}
          </td>
          <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(l.amount, "IDR")}</td>
        </tr>
      ))}
      {lines.length === 0 && (
        <tr className="border-b border-gray-100">
          <td className="px-6 py-2 pl-10 text-gray-400" colSpan={2}>—</td>
        </tr>
      )}
      <tr className="border-b border-gray-200 font-medium">
        <td className="px-6 py-2 text-gray-700">Total {title}</td>
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
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const asOfStr = sp.asOf ?? todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const bs = await getBalanceSheet(asOf);

  return (
    <div>
      <Breadcrumb items={[{ label: "Laporan", href: "/reports" }, { label: "Neraca" }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Neraca</h1>
          <p className="text-sm text-gray-500">Per {formatDate(asOf)} · nilai dalam IDR</p>
        </div>
        <StatementPDFButton
          payload={{
            kind: "balance-sheet",
            period: `Per ${formatDate(asOf)}`,
            assets: bs.assets,
            liabilities: bs.liabilities,
            equity: bs.equity,
            totalAssets: bs.totalAssets,
            totalLiabilities: bs.totalLiabilities,
            totalEquity: bs.totalEquity,
            netIncome: bs.netIncome,
            totalLiabilitiesEquity: bs.totalLiabilitiesEquity,
            balanced: bs.balanced,
          }}
        />
      </div>

      <AsOfFilter basePath="/reports/balance-sheet" asOf={asOfStr} />

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
              <tr className="border-b border-gray-100">
                <td className="px-6 py-2 pl-10 text-gray-600">Laba/Rugi Berjalan</td>
                <td className="px-6 py-2 text-right tabular-nums">{formatCurrency(bs.netIncome, "IDR")}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="px-6 py-3 text-gray-900">Total Aset</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(bs.totalAssets, "IDR")}</td>
              </tr>
              <tr className="font-bold">
                <td className="px-6 py-3 text-gray-900">Total Liabilitas + Ekuitas</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(bs.totalLiabilitiesEquity, "IDR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
