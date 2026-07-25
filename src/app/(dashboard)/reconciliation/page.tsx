import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { formatDateShort } from "@/lib/utils";
import { Lock, Scale } from "lucide-react";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ReconciliationListPage() {
  await requirePagePermission("reconciliation.read");

  const statements = await prisma.bankStatement.findMany({
    orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
    include: { _count: { select: { lines: true } } },
  });

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="rekonsiliasi_bank">Cocokkan Rekening Koran</TermTooltip>}
        description="Cocokkan buku kas/bank internal dengan rekening koran bank per periode."
        actions={
          <Link href="/reconciliation/new">
            <Button>+ Rekonsiliasi Baru</Button>
          </Link>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <LearnMore term="rekonsiliasi_bank" className="mt-1 mb-6" />

      {statements.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-12 w-12" />}
          title="Belum ada rekonsiliasi"
          description="Buat rekonsiliasi pertama: pilih rekening bank, periode, dan saldo awal/akhir dari rekening koran."
          actionLabel="Buat Rekonsiliasi"
          actionHref="/reconciliation/new"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Daftar Rekonsiliasi ({statements.length})</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Periode</TableHead>
                <TableHead>Rekening</TableHead>
                <TableHead className="text-right">Saldo Awal</TableHead>
                <TableHead className="text-right">Saldo Akhir</TableHead>
                <TableHead className="text-right">Baris Koran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-foreground">
                    {formatDateShort(s.periodStart)} — {formatDateShort(s.periodEnd)}
                  </TableCell>
                  <TableCell className="text-foreground">Bank ({s.currency})</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(s.openingBalance)}
                      currency={s.currency}
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(s.closingBalance)}
                      currency={s.currency}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {s._count.lines}
                  </TableCell>
                  <TableCell>
                    {s.status === "locked" ? (
                      <Badge variant="success">
                        <Lock className="mr-1 h-3 w-3" aria-hidden="true" /> Terkunci
                      </Badge>
                    ) : (
                      <Badge variant="warning">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/reconciliation/${s.id}`} className="text-primary hover:underline">
                      Buka
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
