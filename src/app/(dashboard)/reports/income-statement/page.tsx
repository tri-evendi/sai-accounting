import { requirePageSession } from "@/lib/page-auth";
import { getIncomeStatement } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PeriodFilter } from "../report-filters";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { StatementLine } from "@/lib/reports";

export const dynamic = "force-dynamic";

function iso(d: Date) {
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

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const now = new Date();
  const fromStr = sp.from ?? iso(new Date(now.getFullYear(), 0, 1));
  const toStr = sp.to ?? iso(now);
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T23:59:59.999`);
  const is = await getIncomeStatement(from, to);
  const profit = is.netIncome >= 0;

  return (
    <div>
      <Breadcrumb items={[{ label: "Laporan", href: "/reports" }, { label: "Laba / Rugi" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Laba / Rugi</h1>
      <p className="text-sm text-gray-500 mb-6">
        Periode {formatDate(from)} – {formatDate(to)}
      </p>

      <PeriodFilter basePath="/reports/income-statement" from={fromStr} to={toStr} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <Section title="Pendapatan" lines={is.revenue} total={is.totalRevenue} />
              <Section title="Beban" lines={is.expense} total={is.totalExpense} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 text-base font-bold">
                <td className="px-6 py-4 text-gray-900">
                  Laba / Rugi Bersih
                  <span className={`ml-2 text-sm font-medium ${profit ? "text-green-700" : "text-red-600"}`}>
                    ({profit ? "Laba" : "Rugi"})
                  </span>
                </td>
                <td className={`px-6 py-4 text-right tabular-nums ${profit ? "text-green-700" : "text-red-600"}`}>
                  {formatCurrency(is.netIncome, "IDR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
