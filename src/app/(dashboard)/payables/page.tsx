/**
 * Utang (AP) — who we owe, how much is left, and how old it is (issue #12).
 *
 * The supplier mirror of /receivables. One structural difference is called out on
 * the page itself: `supplier_transactions` links no payment to any specific
 * purchase, so the per-row split is a FIFO assumption (oldest purchase settled
 * first). The per-supplier total is exact regardless — see `allocatePaymentsFifo`.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getPayables } from "@/lib/receivables";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; overdue?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const asOfStr = sp.asOf ?? todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const overdueOnly = sp.overdue === "1";

  const { rows, aging, byParty, overdueCount } = await getPayables({ asOf, overdueOnly });

  return (
    <div>
      <Breadcrumb items={[{ label: "Utang" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Utang (Belum Dibayar)</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pembelian dari supplier yang masih punya sisa per {formatDateShort(asOf)}.
        {overdueCount > 0 && !overdueOnly && (
          <> {overdueCount} dokumen sudah lewat jatuh tempo.</>
        )}
      </p>

      <LedgerFilter basePath="/payables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption="Umur dihitung sejak jatuh tempo bila ada; bila tidak, sejak tanggal transaksi."
      />

      <p className="mb-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Pembayaran supplier tidak ditautkan ke pembelian tertentu, sehingga pembayaran
          dialokasikan ke pembelian <strong>terlama lebih dulu</strong>. Total per supplier
          selalu tepat; pembagian per baris mengikuti asumsi tersebut.
        </span>
      </p>

      <PartyTotals rows={byParty} title="Sisa utang per supplier" />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Supplier</th>
                <th className="px-4 py-3 font-medium text-gray-500">Dokumen</th>
                <th className="px-4 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 font-medium text-gray-500">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium text-gray-500">Umur</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Nilai Pembelian</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Sisa (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-900">{r.partyName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={r.href}
                      className="text-blue-700 hover:underline cursor-pointer transition-colors"
                    >
                      {r.documentNo}
                    </Link>
                    <span className="block text-xs text-gray-500">Pembelian</span>
                    {r.terms && (
                      <span className="block text-xs text-gray-400 max-w-56 truncate" title={r.terms}>
                        {r.terms}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{formatDateShort(r.date)}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">
                    {r.dueDate ? (
                      formatDateShort(r.dueDate)
                    ) : (
                      <span className="text-gray-400">Belum diisi</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <AgeCell days={r.ageDays} fromIssue={r.ageFromIssue} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                    {formatCurrency(r.total, r.currency)}
                    {r.currency !== "IDR" && (
                      <span className="block text-xs text-gray-500">{r.currency}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                    {r.outstandingBase == null ? (
                      <span className="text-amber-700">Kurs belum diisi</span>
                    ) : (
                      formatCurrency(r.outstandingBase, "IDR")
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    {overdueOnly
                      ? "Tidak ada utang yang lewat jatuh tempo. Perlu diingat: pembelian tanpa tanggal jatuh tempo tidak ikut terhitung di sini."
                      : "Semua utang supplier sudah lunas. Belum ada sisa."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
