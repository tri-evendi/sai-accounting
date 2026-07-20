/**
 * Utang (AP) — who we owe, how much is left, and how old it is (issue #12).
 *
 * The supplier mirror of /receivables. Since issue #37 a payment can name the
 * purchase(s) it settles, so most rows here are backed by recorded allocations.
 * Payments made before that — and any unallocated remainder of a newer one —
 * still have to be spread by the old FIFO assumption (oldest purchase first);
 * rows carrying any of that estimate are badged "Perkiraan" rather than being
 * shown as fact. The per-supplier total is exact either way — see
 * `allocatePayments`.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getPayables } from "@/lib/receivables";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  // Rows whose split leans on the FIFO fallback rather than a recorded allocation
  // (issue #37). Disclosed per row and in the banner — never presented as fact.
  const estimatedCount = rows.filter((r) => r.allocationEstimated).length;

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

      {estimatedCount > 0 ? (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>{estimatedCount} baris</strong> ditandai{" "}
            <Badge variant="warning">Perkiraan</Badge> — sebagian pembayarannya belum
            ditautkan ke pembelian tertentu, sehingga sisanya diperkirakan dengan
            melunasi pembelian <strong>terlama lebih dulu</strong>. Baris tanpa tanda
            itu memakai alokasi pembayaran yang benar-benar dicatat. Total per supplier
            tepat pada kedua kasus; hanya pembagian per baris yang berbeda. Untuk
            menghilangkan perkiraan, klik <strong>Perbaiki alokasi</strong> pada baris
            yang ditandai lalu pilih pembelian yang dilunasi — ini hanya memperbaiki
            laporan dan <strong>tidak mengubah jurnal</strong>.
          </span>
        </p>
      ) : (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Setiap sisa utang di bawah dihitung dari alokasi pembayaran yang tercatat —
            bukan perkiraan.
          </span>
        </p>
      )}

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
                    {r.allocationEstimated && (
                      <span className="mt-1 block">
                        <span
                          title="Sebagian pembayaran supplier ini belum ditautkan ke pembelian tertentu, jadi sisa baris ini diperkirakan dengan aturan pembelian terlama dilunasi lebih dulu."
                        >
                          <Badge variant="warning">Perkiraan</Badge>
                        </span>
                        {/* The fix, offered where the problem is noticed (issue
                            #38): this opens the allocation editor on the payment
                            responsible, so the guess can be replaced with fact
                            without deleting and re-posting the payment. */}
                        <Link
                          href={`${r.href}?alokasi=1`}
                          className="mt-1 block cursor-pointer text-xs text-blue-700 transition-colors hover:underline"
                        >
                          Perbaiki alokasi
                        </Link>
                      </span>
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
