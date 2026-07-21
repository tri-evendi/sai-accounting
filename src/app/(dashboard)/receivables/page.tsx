/**
 * Piutang (AR) — who owes us, how much is left, and how old it is (issue #12).
 *
 * Read-only: nothing here writes and nothing here posts. Balances come from the
 * source documents via `@/lib/receivables`, whose header explains why every
 * cross-document total is expressed in IDR base.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getReceivables } from "@/lib/receivables";
import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatCurrency, formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; overdue?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const asOfStr = sp.asOf ?? todayISO();
  const asOf = new Date(`${asOfStr}T23:59:59.999`);
  const overdueOnly = sp.overdue === "1";

  const { rows, aging, byParty, overdueCount } = await getReceivables({ asOf, overdueOnly });

  return (
    <div>
      <Breadcrumb items={[{ label: "Piutang" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Piutang (Belum Dibayar)</h1>
      <p className="text-sm text-gray-500 mb-6">
        Faktur &amp; kontrak yang masih punya sisa tagihan per {formatDateShort(asOf)}.
        {overdueCount > 0 && !overdueOnly && (
          <> {overdueCount} dokumen sudah lewat jatuh tempo.</>
        )}
      </p>

      <LedgerFilter basePath="/receivables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption="Umur dihitung sejak jatuh tempo bila ada; bila tidak, sejak tanggal dokumen."
      />

      <PartyTotals rows={byParty} title="Sisa piutang per pelanggan" />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Pelanggan</th>
                <th className="px-4 py-3 font-medium text-gray-500">Dokumen</th>
                <th className="px-4 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 font-medium text-gray-500">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium text-gray-500">Umur</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Nilai Dokumen</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Sisa (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-900">{r.partyName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={r.href}
                      className="text-blue-700 hover:underline cursor-pointer transition-colors"
                    >
                      {r.documentNo}
                    </Link>
                    <span className="block text-xs text-gray-500">
                      {r.kind === "invoice" ? "Faktur" : "Kontrak"}
                    </span>
                    {/* Free text, straight from top1/top2 — informational only. */}
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
                    {/* Only shown when every payment shared the document's currency —
                        otherwise there is no single-currency remainder to state. */}
                    {r.outstanding != null && r.currency !== "IDR" && (
                      <span className="block text-xs text-gray-500">
                        {formatCurrency(r.outstanding, r.currency)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    {overdueOnly
                      ? "Tidak ada piutang yang lewat jatuh tempo. Perlu diingat: dokumen tanpa tanggal jatuh tempo tidak ikut terhitung di sini."
                      : "Semua piutang sudah lunas. Belum ada sisa tagihan."}
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
