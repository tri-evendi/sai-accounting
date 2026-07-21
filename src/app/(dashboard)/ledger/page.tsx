import { requireAccountantPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getAccountLedger } from "@/lib/ledger";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { accountTypeLabel } from "@/lib/accounting";
import { LedgerFilter } from "./ledger-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  await requireAccountantPage(["bos"]);
  const sp = await searchParams;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });

  const accountId = sp.accountId ? parseInt(sp.accountId) : undefined;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;
  const ledger = accountId ? await getAccountLedger(accountId, from, to) : null;

  const accountOptions = [
    { value: "", label: "— Pilih akun —" },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Buku Besar</h1>

      <LedgerFilter
        accountOptions={accountOptions}
        accountId={sp.accountId ?? ""}
        from={sp.from ?? ""}
        to={sp.to ?? ""}
      />

      {!ledger ? (
        <Card>
          <div className="px-6 py-10 text-center text-gray-500">
            Pilih akun untuk menampilkan mutasi & saldo berjalan.
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              <span className="font-mono">{ledger.account.code}</span> — {ledger.account.name}
            </h2>
            <p className="text-sm text-gray-500">
              {accountTypeLabel(ledger.account.type)} · Saldo normal{" "}
              {ledger.account.normalBalance === "debit" ? "Debit" : "Kredit"}
            </p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500">Tanggal</th>
                    <th className="px-6 py-3 font-medium text-gray-500">No. Jurnal</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Keterangan</th>
                    <th className="px-6 py-3 font-medium text-gray-500 text-right">Debit</th>
                    <th className="px-6 py-3 font-medium text-gray-500 text-right">Kredit</th>
                    <th className="px-6 py-3 font-medium text-gray-500 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td className="px-6 py-3 text-gray-500 italic" colSpan={5}>
                      Saldo Awal
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(ledger.opening, "IDR")}
                    </td>
                  </tr>
                  {ledger.rows.map((r) => (
                    <tr key={r.lineId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600 tabular-nums">{formatDateShort(r.date)}</td>
                      <td className="px-6 py-3">
                        <Link href={`/journal/${r.journalId}`} className="font-mono text-blue-600 hover:underline">
                          {r.number}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{r.memo ?? r.note ?? "—"}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {r.debit > 0 ? formatCurrency(r.debit, "IDR") : "—"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {r.credit > 0 ? formatCurrency(r.credit, "IDR") : "—"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(r.balance, "IDR")}</td>
                    </tr>
                  ))}
                  {ledger.rows.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<BookOpen className="h-12 w-12" />}
                          title="Tidak ada mutasi pada rentang ini"
                          description="Coba lebarkan rentang tanggalnya atau pilih akun lain. Kalau memang belum ada apa-apa, mulailah dari mencatat transaksi kas."
                          actionLabel="+ Catat Transaksi"
                          actionHref="/finance/new"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="px-6 py-3" colSpan={3}>
                      Total &amp; Saldo Akhir
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(ledger.totalDebit, "IDR")}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(ledger.totalCredit, "IDR")}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(ledger.closing, "IDR")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
