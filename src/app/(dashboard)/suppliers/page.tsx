import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { EmptyState } from "@/components/ui/empty-state";
import { Truck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        transactions: { orderBy: { date: "desc" }, take: 3 },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.supplier.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="pemasok">Pemasok ({totalCount})</TermTooltip>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Buka salah satu pemasok untuk mencatat pembelian dan pembayarannya.
          </p>
          <LearnMore term="pembelian" className="mt-1" label="Pelajari ini: cara mencatat pembelian" />
        </div>
        <Link href="/suppliers/new" className="shrink-0">
          <Button>+ Tambah Pemasok</Button>
        </Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Nama</th>
                <th className="px-6 py-3 font-medium text-gray-500">Alamat</th>
                <th className="px-6 py-3 font-medium text-gray-500">Telepon</th>
                <th className="px-6 py-3 font-medium text-gray-500">Surel</th>
                <th className="px-6 py-3 font-medium text-gray-500">Transaksi</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Truck className="h-12 w-12" />}
                      title="Belum ada pemasok"
                      description="Pemasok adalah pihak tempat Anda membeli barang. Catat pemasok pertama agar pembelian dan utangnya bisa dilacak."
                      actionLabel="+ Tambah Pemasok"
                      actionHref="/suppliers/new"
                    />
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link href={`/suppliers/${s.id}`} className="text-blue-600 hover:underline font-medium">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{s.address || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{s.phone || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{s.email || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{s.transactions.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/suppliers" searchParams={params} />
      </Card>
    </div>
  );
}
