import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { FileText } from "lucide-react";
import { STATUS_FILTER_LABELS } from "@/lib/constants";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="kontrak">Kontrak ({totalCount})</TermTooltip>
          </h1>
          <LearnMore term="kontrak" className="mt-1" label="Pelajari ini: apa itu kontrak penjualan" />
        </div>
        <Link href="/contracts/new" className="shrink-0">
          <Button>+ Buat Kontrak</Button>
        </Link>
      </div>

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
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button type="submit" className="ml-2 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Cari</button>
      </form>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">No. Kontrak</th>
                <th className="px-6 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-6 py-3 font-medium text-gray-500">Pembeli</th>
                <th className="px-6 py-3 font-medium text-gray-500">
                  <TermTooltip term="penerima_barang">Penerima Barang</TermTooltip>
                </th>
                <th className="px-6 py-3 font-medium text-gray-500">Jumlah Barang</th>
                <th className="px-6 py-3 font-medium text-gray-500">Mata Uang</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={<FileText className="h-12 w-12" />} title="Belum ada kontrak" description="Buat kontrak pertama sebelum barang dikirim." actionLabel="+ Buat Kontrak" actionHref="/contracts/new" /></td></tr>
              ) : (
                contracts.map((contract) => (
                  <tr key={contract.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link href={`/contracts/${contract.id}`} className="text-blue-600 hover:underline font-medium">
                        {contract.contractNo}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{formatDateShort(contract.date)}</td>
                    <td className="px-6 py-3 text-gray-700">{contract.buyer}</td>
                    <td className="px-6 py-3 text-gray-500">{contract.consigneeRef?.name || contract.consignee || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{contract.items.length}</td>
                    <td className="px-6 py-3 text-gray-500">{contract.currency}</td>
                    <td className="px-6 py-3"><StatusBadge status={contract.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/contracts" searchParams={params} />
      </Card>
    </div>
  );
}
