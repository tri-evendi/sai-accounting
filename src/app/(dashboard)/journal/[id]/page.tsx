import { requireAccountantPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ReverseButton } from "./reverse-button";

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccountantPage(["bos"]);
  const { id } = await params;

  const journal = await prisma.journal.findUnique({
    where: { id: parseInt(id) },
    include: {
      lines: { include: { account: true }, orderBy: { id: "asc" } },
      reversalOf: true,
      reversals: true,
    },
  });

  if (!journal) notFound();

  const totalDebit = journal.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalCredit = journal.lines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const canReverse = !journal.isReversed && journal.type !== "reversal";

  return (
    <div>
      <Breadcrumb items={[{ label: "Jurnal Umum", href: "/journal" }, { label: journal.number }]} />

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{journal.number}</h1>
          <p className="mt-1 text-sm text-gray-500">{formatDate(journal.date)}</p>
        </div>
        {canReverse && <ReverseButton journalId={journal.id} />}
      </div>

      {journal.isReversed && (
        <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          Jurnal ini sudah dibalik
          {journal.reversals[0] && (
            <>
              {" "}oleh{" "}
              <Link href={`/journal/${journal.reversals[0].id}`} className="font-mono underline">
                {journal.reversals[0].number}
              </Link>
            </>
          )}
          .
        </div>
      )}
      {journal.reversalOf && (
        <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          Pembalikan dari{" "}
          <Link href={`/journal/${journal.reversalOf.id}`} className="font-mono underline">
            {journal.reversalOf.number}
          </Link>
          .
        </div>
      )}

      {journal.note && (
        <p className="mb-4 text-sm text-gray-600">
          <span className="font-medium text-gray-500">Keterangan:</span> {journal.note}
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-6 py-3 font-medium text-gray-500">Kode</th>
              <th className="px-6 py-3 font-medium text-gray-500">Akun</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Debit (IDR)</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Kredit (IDR)</th>
            </tr>
          </thead>
          <tbody>
            {journal.lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="px-6 py-3 font-mono text-gray-700 tabular-nums">{l.account.code}</td>
                <td className="px-6 py-3">
                  {l.account.name}
                  {l.currency !== "IDR" && (
                    <span className="ml-2 text-xs text-gray-400">
                      ({formatCurrency(Number(l.debit) || Number(l.credit), l.currency)} @ {Number(l.rate)})
                    </span>
                  )}
                  {l.memo && <span className="ml-2 text-xs text-gray-400">— {l.memo}</span>}
                </td>
                <td className="px-6 py-3 text-right tabular-nums">
                  {Number(l.baseDebit) > 0 ? formatCurrency(Number(l.baseDebit), "IDR") : "—"}
                </td>
                <td className="px-6 py-3 text-right tabular-nums">
                  {Number(l.baseCredit) > 0 ? formatCurrency(Number(l.baseCredit), "IDR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 font-semibold">
              <td className="px-6 py-3" colSpan={2}>
                Total{" "}
                {totalDebit === totalCredit ? (
                  <Badge variant="success">Seimbang</Badge>
                ) : (
                  <Badge variant="danger">Tidak seimbang</Badge>
                )}
              </td>
              <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(totalDebit, "IDR")}</td>
              <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(totalCredit, "IDR")}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
