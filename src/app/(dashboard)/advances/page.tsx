/**
 * Uang Muka — advances received/paid and how much of each is left (issue #26).
 *
 * The number a user actually needs is "how much does this buyer still have on
 * account?", so `Sisa` is the column that carries the page. It is shown in the
 * advance's OWN currency (a CNY down-payment is a CNY fact, and an application
 * is always a slice of one advance, so that remainder is exact) with the IDR
 * base beside it — the only unit in which advances across currencies may be
 * added, which is what the summary tiles use. An advance with no rate has no
 * IDR value at all and is labelled as such rather than folded in at 1:1.
 */
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getAdvances, summarizeAdvances, ADVANCE_TYPE_LABELS } from "@/lib/advances";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { HandCoins, Info, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdvancesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const type = sp.type === "sales" || sp.type === "purchase" ? sp.type : undefined;

  const rows = await getAdvances({ type });
  const open = rows.filter((r) => !r.isFullyApplied);
  const summary = summarizeAdvances(open);

  return (
    <div>
      <Breadcrumb items={[{ label: "Uang Muka" }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Uang Muka</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uang yang diterima atau dibayar <strong>sebelum</strong> fakturnya terbit.
            Belum dihitung sebagai penjualan atau beban sampai dikompensasi ke faktur.
          </p>
        </div>
        <Link href="/advances/new">
          <Button className="cursor-pointer">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Catat Uang Muka
          </Button>
        </Link>
      </div>

      {/* Filter — plain links, no client JS needed for three states. */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { label: "Semua", href: "/advances", active: !type },
          { label: "Penjualan (diterima)", href: "/advances?type=sales", active: type === "sales" },
          { label: "Pembelian (dibayar)", href: "/advances?type=purchase", active: type === "purchase" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-md border px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
              f.active
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Uang muka belum dikompensasi</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(summary.outstandingBase, "IDR")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Nilai dasar IDR dari {summary.count} uang muka yang masih bersisa.
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Belum berkurs</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {summary.unresolvedCount}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Uang muka valas tanpa kurs — tidak dihitung dalam total IDR di atas.
          </p>
        </Card>
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Uang muka masuk ke akun <strong>Uang Muka Penjualan</strong> (kewajiban) atau{" "}
          <strong>Uang Muka Pembelian</strong> (aset) — <strong>bukan</strong> pendapatan
          atau beban. Saat fakturnya terbit, buka faktur tersebut lalu pilih{" "}
          <strong>Kompensasi uang muka</strong> untuk mengurangi tagihannya.
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-12 w-12" />}
          title="Belum ada uang muka"
          description="Catat pembayaran di muka dari pelanggan atau ke supplier di sini."
          actionLabel="Catat Uang Muka"
          actionHref="/advances/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Nomor</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Jenis</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Pihak</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Kontrak</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Nilai</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    Sudah dikompensasi
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Sisa</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Sisa (IDR)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.advanceNo}</td>
                    <td className="px-4 py-3">
                      {/* Badge always carries text — colour is never the only signal. */}
                      <Badge variant={r.type === "sales" ? "success" : "warning"}>
                        {r.type === "sales" ? "Diterima" : "Dibayar"}
                      </Badge>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {ADVANCE_TYPE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{r.partyName}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateShort(r.date)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {r.contractNo ? (
                        <Link
                          href={`/contracts/${r.contractId}`}
                          className="cursor-pointer text-blue-700 transition-colors hover:underline"
                        >
                          {r.contractNo}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(r.amount, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(r.applied, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                      {formatCurrency(r.remaining, r.currency)}
                      {r.isFullyApplied && (
                        <span className="mt-0.5 block text-xs font-normal text-gray-500">
                          Sudah habis
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {r.remainingBase != null ? (
                        formatCurrency(r.remainingBase, "IDR")
                      ) : (
                        <span className="text-xs text-amber-700">Kurs belum diisi</span>
                      )}
                      {r.unratedApplications > 0 && (
                        <span className="mt-0.5 block text-xs text-amber-700">
                          {r.unratedApplications} kompensasi belum berkurs
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
