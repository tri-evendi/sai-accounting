import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
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
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { FileText } from "lucide-react";
import { STATUS_FILTER_LABELS } from "@/lib/constants";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "all") {
    where.status = params.status;
  }

  if (params.search) {
    where.OR = [
      { contractNo: { contains: params.search } },
      { buyer: { contains: params.search } },
      { consignee: { contains: params.search } },
      { consigneeRef: { name: { contains: params.search } } },
    ];
  }

  const [contracts, totalCount] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { date: "desc" },
      include: { items: true, payments: true, consigneeRef: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.contract.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="kontrak">Kontrak ({totalCount})</TermTooltip>}
        actions={
          <Link href="/contracts/new" className="shrink-0">
            <Button>+ Buat Kontrak</Button>
          </Link>
        }
      />
      <LearnMore term="kontrak" className="mt-1 mb-6" label="Pelajari ini: apa itu kontrak penjualan" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "signed", "pending", "canceled"].map((status) => (
          <Link
            key={status}
            href={`/contracts${status === "all" ? "" : `?status=${status}`}`}
          >
            <Button
              variant={params.status === status || (!params.status && status === "all") ? "primary" : "secondary"}
              size="sm"
            >
              {STATUS_FILTER_LABELS[status] ?? status}
            </Button>
          </Link>
        ))}
      </div>

      {/* Search */}
      <form className="mb-4">
        <input
          type="text"
          name="search"
          placeholder="Cari no. kontrak, pembeli, atau penerima barang..."
          defaultValue={params.search}
          className="w-full max-w-md rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="submit" className="ml-2 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary focus:outline-none focus:ring-2 focus:ring-ring">Cari</button>
      </form>

      {/* Table */}
      <Card>
        <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>No. Kontrak</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Pembeli</TableHead>
                <TableHead>
                  <TermTooltip term="penerima_barang">Penerima Barang</TermTooltip>
                </TableHead>
                <TableHead className="text-right">Jumlah Barang</TableHead>
                <TableHead>Mata Uang</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState icon={<FileText className="h-12 w-12" />} title="Belum ada kontrak" description="Buat kontrak pertama sebelum barang dikirim." actionLabel="+ Buat Kontrak" actionHref="/contracts/new" />
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <Link href={`/contracts/${contract.id}`} className="cursor-pointer font-medium text-primary hover:underline">
                        {contract.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(contract.date)}</TableCell>
                    <TableCell className="text-foreground">{contract.buyer}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.consigneeRef?.name || contract.consignee || "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{contract.items.length}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.currency}</TableCell>
                    <TableCell><StatusBadge status={contract.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/contracts" searchParams={params} />
      </Card>
    </div>
  );
}
