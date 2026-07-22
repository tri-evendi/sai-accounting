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
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
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
      <h1 className="text-2xl font-bold text-foreground mb-1">
        <TermTooltip term="piutang">Pelanggan Belum Bayar</TermTooltip>
      </h1>
      <p className="text-sm text-muted-foreground mb-2">
        Faktur &amp; kontrak yang masih punya sisa tagihan per {formatDateShort(asOf)}.
        {overdueCount > 0 && !overdueOnly && (
          <> {overdueCount} dokumen sudah lewat jatuh tempo.</>
        )}
      </p>
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2">
        <LearnMore term="piutang" />
        <LearnMore term="umur_piutang" />
        <LearnMore term="jatuh_tempo" />
      </div>

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
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Pelanggan</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Dokumen</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Tanggal</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Jatuh Tempo</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Umur</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Nilai Dokumen</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Sisa (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">{r.partyName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={r.href}
                      className="text-primary hover:underline cursor-pointer transition-colors"
                    >
                      {r.documentNo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {r.kind === "invoice" ? "Faktur" : "Kontrak"}
                    </span>
                    {/* Free text, straight from top1/top2 — informational only. */}
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
                    {/* Only shown when every payment shared the document's currency —
                        otherwise there is no single-currency remainder to state. */}
                    {r.outstanding != null && r.currency !== "IDR" && (
                      <span className="block text-xs text-muted-foreground">
                        {formatCurrency(r.outstanding, r.currency)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
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
