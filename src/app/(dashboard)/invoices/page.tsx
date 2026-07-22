import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateShort } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Receipt } from "lucide-react";
import { STATUS_FILTER_LABELS } from "@/lib/constants";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="faktur">Tagihan Penjualan ({totalCount})</TermTooltip>
          </h1>
          <LearnMore term="faktur" className="mt-1" label="Pelajari ini: apa itu tagihan penjualan" />
        </div>
        <Link href="/invoices/new" className="shrink-0">
          <Button>+ Buat Tagihan</Button>
        </Link>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">No. Tagihan</th>
                <th className="px-6 py-3 font-medium text-gray-500">Tanggal</th>
                <th className="px-6 py-3 font-medium text-gray-500">Jumlah Barang</th>
                <th className="px-6 py-3 font-medium text-gray-500">Pembayaran</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={<Receipt className="h-12 w-12" />} title="Belum ada tagihan penjualan" description="Buat tagihan pertama untuk pelanggan Anda." actionLabel="+ Buat Tagihan" actionHref="/invoices/new" /></td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline font-medium">
                        {inv.invoiceNo}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{formatDateShort(inv.date)}</td>
                    <td className="px-6 py-3 text-gray-500">{inv.items.length}</td>
                    <td className="px-6 py-3 text-gray-500">{inv.payments.length}</td>
                    <td className="px-6 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/invoices" searchParams={params} />
      </Card>
    </div>
  );
}
