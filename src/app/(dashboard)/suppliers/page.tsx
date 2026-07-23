import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
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
  await requirePagePermission("supplier.read");
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
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="pemasok">Pemasok ({totalCount})</TermTooltip>}
        description="Buka salah satu pemasok untuk mencatat pembelian dan pembayarannya."
        actions={
          <Link href="/suppliers/new" className="shrink-0">
            <Button>+ Tambah Pemasok</Button>
          </Link>
        }
      />
      <LearnMore term="pembelian" className="mt-1 mb-6" label="Pelajari ini: cara mencatat pembelian" />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Nama</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Alamat</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Telepon</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Surel</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Transaksi</th>
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
                  <tr key={s.id} className="border-b border-border hover:bg-muted">
                    <td className="px-6 py-3">
                      <Link href={`/suppliers/${s.id}`} className="text-primary hover:underline font-medium">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{s.address || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{s.phone || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{s.email || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{s.transactions.length}</td>
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
