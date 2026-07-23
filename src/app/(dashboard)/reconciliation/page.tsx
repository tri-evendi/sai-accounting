import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDateShort } from "@/lib/utils";
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Periode</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Rekening</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">Saldo Awal</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">Saldo Akhir</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">Baris Koran</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted">
                    <td className="px-6 py-3 text-foreground">
                      {formatDateShort(s.periodStart)} — {formatDateShort(s.periodEnd)}
                    </td>
                    <td className="px-6 py-3 text-foreground">Bank ({s.currency})</td>
                    <td className="px-6 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(Number(s.openingBalance), s.currency)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(Number(s.closingBalance), s.currency)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {s._count.lines}
                    </td>
                    <td className="px-6 py-3">
                      {s.status === "locked" ? (
                        <Badge variant="success">
                          <Lock className="mr-1 h-3 w-3" aria-hidden="true" /> Terkunci
                        </Badge>
                      ) : (
                        <Badge variant="warning">Draft</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/reconciliation/${s.id}`} className="text-primary hover:underline">
                        Buka
                      </Link>
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
