import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateShort } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Receipt } from "lucide-react";
import { STATUS_FILTER_LABELS } from "@/lib/constants";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requirePagePermission("invoice.read");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "all") {
    where.status = params.status;
  }

  if (params.search) {
    where.invoiceNo = { contains: params.search };
  }

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { date: "desc" },
      include: { items: true, payments: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.invoice.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="faktur">Tagihan Penjualan ({totalCount})</TermTooltip>}
        actions={
          <>
            {/* Alur terpandu = tombol utama (ramah amatir); formulir polos tetap
                tersedia untuk yang sudah hafal alurnya (issue #5). */}
            <Link href="/sales/new" className="shrink-0">
              <Button>Catat Penjualan (dipandu)</Button>
            </Link>
            <Link href="/invoices/new" className="shrink-0">
              <Button variant="secondary">+ Buat Tagihan</Button>
            </Link>
          </>
        }
      />
      <LearnMore term="faktur" className="mt-1 mb-6" label="Pelajari ini: apa itu tagihan penjualan" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "signed", "pending", "canceled"].map((status) => (
          <Link key={status} href={`/invoices${status === "all" ? "" : `?status=${status}`}`}>
            <Button
              variant={params.status === status || (!params.status && status === "all") ? "primary" : "secondary"}
              size="sm"
            >
              {STATUS_FILTER_LABELS[status] ?? status}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>No. Tagihan</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Jumlah Barang</TableHead>
              <TableHead className="text-right">Pembayaran</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState icon={<Receipt className="h-12 w-12" />} title="Belum ada tagihan penjualan" description="Catat penjualan pertama Anda — alurnya dipandu langkah demi langkah." actionLabel="Catat Penjualan (dipandu)" actionHref="/sales/new" />
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link href={`/invoices/${inv.id}`} className="cursor-pointer font-medium text-primary hover:underline">
                      {inv.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(inv.date)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{inv.items.length}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{inv.payments.length}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/invoices" searchParams={params} />
      </Card>
    </div>
  );
}
