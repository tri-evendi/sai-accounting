import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("customer.read");
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
      <PageHeader
        title={<TermTooltip term="pelanggan">Pelanggan ({totalCount})</TermTooltip>}
        actions={
          <Link href="/customers/new" className="shrink-0">
            <Button>+ Tambah Pelanggan</Button>
          </Link>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Nama</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Alamat</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Telepon</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Surel</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Penanggung Jawab</th>
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
                  <tr key={c.id} className="border-b border-border hover:bg-muted">
                    <td className="px-6 py-3"><Link href={`/customers/${c.id}`} className="text-primary hover:underline font-medium">{c.name}</Link></td>
                    <td className="px-6 py-3 text-muted-foreground">{c.address || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{c.phone || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{c.email || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{c.pic || "-"}</td>
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
