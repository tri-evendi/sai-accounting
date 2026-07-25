import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ui/empty-state";
import { BookText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  general: "Umum",
  sales: "Penjualan",
  purchase: "Pembelian",
  cash: "Kas/Bank",
  adjustment: "Penyesuaian",
  reversal: "Pembalikan",
};

export default async function JournalPage() {
  await requirePagePermission("journal.read");

  const journals = await prisma.journal.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { lines: true },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title={<>Jurnal Umum ({journals.length})</>}
        actions={
          <Link href="/journal/new">
            <Button>+ Jurnal Baru</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nomor</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead className="text-right">Total (IDR)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journals.length > 0 ? (
              journals.map((j) => {
                const total = j.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/journal/${j.id}`} className="font-mono text-primary hover:underline">
                        {j.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(j.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{TYPE_LABELS[j.type] ?? j.type}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{j.note ?? "—"}</TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={total} currency="IDR" hideCurrency />
                    </TableCell>
                    <TableCell>
                      {j.isReversed ? (
                        <Badge variant="warning">Dibalik</Badge>
                      ) : j.type === "reversal" ? (
                        <Badge variant="default">Pembalikan</Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<BookText className="h-12 w-12" />}
                    title="Belum ada jurnal"
                    description="Sebagian besar jurnal dibuat otomatis dari faktur, kontrak, kas, dan stok. Jurnal manual dipakai untuk koreksi dan penyesuaian."
                    actionLabel="+ Buat Jurnal Manual"
                    actionHref="/journal/new"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
