import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Kode</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead className="text-right">Debit (IDR)</TableHead>
              <TableHead className="text-right">Kredit (IDR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-foreground tabular-nums">{l.account.code}</TableCell>
                <TableCell>
                  {l.account.name}
                  {l.currency !== "IDR" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formatCurrency(Number(l.debit) || Number(l.credit), l.currency)} @ {Number(l.rate)})
                    </span>
                  )}
                  {l.memo && <span className="ml-2 text-xs text-muted-foreground">— {l.memo}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(l.baseDebit) > 0 ? (
                    <Money value={Number(l.baseDebit)} currency="IDR" hideCurrency />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(l.baseCredit) > 0 ? (
                    <Money value={Number(l.baseCredit)} currency="IDR" hideCurrency />
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="border-t-2 bg-transparent">
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>
                Total{" "}
                {totalDebit === totalCredit ? (
                  <Badge variant="success">Seimbang</Badge>
                ) : (
                  <Badge variant="danger">Tidak seimbang</Badge>
                )}
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={totalDebit} currency="IDR" hideCurrency />
              </TableCell>
              <TableCell className="p-0">
                <MoneyCell value={totalCredit} currency="IDR" hideCurrency />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
}
