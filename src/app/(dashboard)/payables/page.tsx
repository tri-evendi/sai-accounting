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
import { getAdvances, summarizeAdvances } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LedgerFilter } from "@/components/shared/ledger-filter";
import { AgeCell, AgingSummary, PaymentStatusBadge, PartyTotals } from "@/components/shared/aging";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowUpFromLine, Info } from "lucide-react";

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

  const [{ rows, aging, byParty, overdueCount }, purchaseAdvances] = await Promise.all([
    getPayables({ asOf, overdueOnly }),
    // Uang muka pembelian still on account (issue #41). A RELATED balance, shown
    // beside the payable and never inside it: this money has already left the
    // bank and sits in an asset account, so netting it off the utang total would
    // understate what is still owed. It reduces a payable only when it is
    // compensated into a purchase — at which point `getPayables` already counts
    // it, via `advanceApplications`.
    getAdvances({ type: "purchase", openOnly: true }),
  ]);
  const advanceSummary = summarizeAdvances(purchaseAdvances);

  // Rows whose split leans on the FIFO fallback rather than a recorded allocation
  // (issue #37). Disclosed per row and in the banner — never presented as fact.
  const estimatedCount = rows.filter((r) => r.allocationEstimated).length;

  return (
    <div>
      <PageHeader
        className="mb-2"
        title={<TermTooltip term="utang">Tagihan yang Harus Dibayar</TermTooltip>}
        description={
          <>
            Pembelian dari pemasok yang masih punya sisa per {formatDateShort(asOf)}.
            {overdueCount > 0 && !overdueOnly && (
              <> {overdueCount} dokumen sudah lewat jatuh tempo.</>
            )}
          </>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2">
        <LearnMore term="utang" />
        <LearnMore term="uang_muka" />
        <LearnMore term="jatuh_tempo" />
      </div>

      <LedgerFilter basePath="/payables" asOf={asOfStr} overdueOnly={overdueOnly} />

      <AgingSummary
        buckets={aging.buckets}
        total={aging.total}
        unresolved={aging.unresolved}
        caption="Umur dihitung sejak jatuh tempo bila ada; bila tidak, sejak tanggal transaksi."
      />

      {/* Related balance: uang muka already paid to suppliers (issue #41). */}
      {advanceSummary.count > 0 && (
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {/* Direction is stated in words and by the icon — not by colour. */}
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Uang muka ke supplier (uang keluar, belum dikompensasi)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(advanceSummary.outstandingBase, "IDR")}
              </p>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                Dari {advanceSummary.count} uang muka yang masih bersisa.{" "}
                <strong>Tidak</strong> dikurangkan dari total utang di atas — uangnya
                sudah keluar dan tercatat sebagai <em>aset</em>. Sisa utang sebuah
                pembelian baru berkurang setelah uang mukanya{" "}
                <strong>dikompensasi</strong> ke pembelian itu, lewat panel{" "}
                <strong>Uang Muka Pembelian</strong> di halaman supplier.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Belum berkurs</p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {advanceSummary.unresolvedCount}
              </p>
              <p className="mt-0.5 max-w-48 text-xs text-muted-foreground">
                Uang muka valas tanpa kurs — tidak ikut dijumlahkan.
              </p>
            </div>
          </div>
          <p className="mt-3">
            <Link
              href="/advances?type=purchase"
              className="cursor-pointer text-xs text-primary transition-colors hover:underline"
            >
              Lihat semua uang muka pembelian
            </Link>
          </p>
        </Card>
      )}

      {estimatedCount > 0 ? (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-strong">
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
        <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
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
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Dokumen</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Tanggal</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Umur</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Nilai Pembelian</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Sisa (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">{r.partyName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={r.href}
                      className="text-primary hover:underline cursor-pointer transition-colors"
                    >
                      {r.documentNo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">Pembelian</span>
                    {r.terms && (
                      <span className="block text-xs text-muted-foreground max-w-56 truncate" title={r.terms}>
                        {r.terms}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground tabular-nums">{formatDateShort(r.date)}</td>
                  <td className="px-4 py-3 text-foreground tabular-nums">
                    {r.dueDate ? (
                      formatDateShort(r.dueDate)
                    ) : (
                      <span className="text-muted-foreground">Belum diisi</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <AgeCell days={r.ageDays} fromIssue={r.ageFromIssue} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {formatCurrency(r.total, r.currency)}
                    {r.currency !== "IDR" && (
                      <span className="block text-xs text-muted-foreground">{r.currency}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
                    {r.outstandingBase == null ? (
                      <span className="text-warning-strong">Kurs belum diisi</span>
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
                          className="mt-1 block cursor-pointer text-xs text-primary transition-colors hover:underline"
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
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
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
