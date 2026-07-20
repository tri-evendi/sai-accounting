import { requirePageSession } from "@/lib/page-auth";
import { getTrialBalance } from "@/lib/reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AsOfFilter } from "../report-filters";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePageSession(["bos"]);
  const sp = await searchParams;
  const asOfStr = sp.asOf ?? todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const tb = await getTrialBalance(asOf);

  return (
    <div>
      <Breadcrumb items={[{ label: "Laporan", href: "/reports" }, { label: "Neraca Saldo" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Neraca Saldo</h1>
      <p className="text-sm text-gray-500 mb-6">Per {formatDate(asOf)}</p>

      <AsOfFilter basePath="/reports/trial-balance" asOf={asOfStr} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Kode</th>
                <th className="px-6 py-3 font-medium text-gray-500">Nama Akun</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Debit</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.code} className="border-b border-gray-100">
                  <td className="px-6 py-2.5 font-mono text-gray-700 tabular-nums">{r.code}</td>
                  <td className="px-6 py-2.5">{r.name}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{r.debit > 0 ? formatCurrency(r.debit, "IDR") : "—"}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{r.credit > 0 ? formatCurrency(r.credit, "IDR") : "—"}</td>
                </tr>
              ))}
              {tb.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Belum ada saldo.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold">
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
