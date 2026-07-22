import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const [customers, totalCount] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <TermTooltip term="pelanggan">Pelanggan ({totalCount})</TermTooltip>
        </h1>
        <Link href="/customers/new" className="shrink-0">
          <Button>+ Tambah Pelanggan</Button>
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
                <th className="px-6 py-3 font-medium text-gray-500">Penanggung Jawab</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Users className="h-12 w-12" />}
                      title="Belum ada pelanggan"
                      description="Pelanggan adalah pihak yang Anda tagih. Catat pelanggan pertama agar tagihan dan piutangnya bisa dirinci per pelanggan."
                      actionLabel="+ Tambah Pelanggan"
                      actionHref="/customers/new"
                    />
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3"><Link href={`/customers/${c.id}`} className="text-blue-600 hover:underline font-medium">{c.name}</Link></td>
                    <td className="px-6 py-3 text-gray-500">{c.address || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{c.phone || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{c.email || "-"}</td>
                    <td className="px-6 py-3 text-gray-500">{c.pic || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/customers" searchParams={params} />
      </Card>
    </div>
  );
}
