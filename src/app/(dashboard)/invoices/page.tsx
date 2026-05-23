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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices ({totalCount})</h1>
        <Link href="/invoices/new">
          <Button>+ New Invoice</Button>
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
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Invoice No</th>
                <th className="px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 font-medium text-gray-500">Items</th>
                <th className="px-6 py-3 font-medium text-gray-500">Payments</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={<Receipt className="h-12 w-12" />} title="No invoices found" description="Create your first invoice to get started." actionLabel="+ New Invoice" actionHref="/invoices/new" /></td></tr>
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
