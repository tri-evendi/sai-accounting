import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ReverseButton } from "./reverse-button";

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("journal.read");
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
      <PageHeader
        breadcrumbs={[{ label: "Catatan Transaksi", href: "/journal" }, { label: journal.number }]}
        title={<span className="font-mono">{journal.number}</span>}
        description={formatDate(journal.date)}
        actions={canReverse && <ReverseButton journalId={journal.id} />}
      />

      {journal.isReversed && (
        <div className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning-strong">
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
        <div className="mb-4 rounded-md bg-muted p-3 text-sm text-foreground">
          Pembalikan dari{" "}
          <Link href={`/journal/${journal.reversalOf.id}`} className="font-mono underline">
            {journal.reversalOf.number}
          </Link>
          .
        </div>
      )}

      {journal.note && (
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-muted-foreground">Keterangan:</span> {journal.note}
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">Kode</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Akun</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Debit (IDR)</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Kredit (IDR)</th>
            </tr>
          </thead>
          <tbody>
            {journal.lines.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="px-6 py-3 font-mono text-foreground tabular-nums">{l.account.code}</td>
                <td className="px-6 py-3">
                  {l.account.name}
                  {l.currency !== "IDR" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formatCurrency(Number(l.debit) || Number(l.credit), l.currency)} @ {Number(l.rate)})
                    </span>
                  )}
                  {l.memo && <span className="ml-2 text-xs text-muted-foreground">— {l.memo}</span>}
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
            <tr className="border-t-2 border-border font-semibold">
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
