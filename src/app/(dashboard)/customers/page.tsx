import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nama</TableHead>
              <TableHead>Alamat</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead>Surel</TableHead>
              <TableHead>Penanggung Jawab</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Users className="h-12 w-12" />}
                    title="Belum ada pelanggan"
                    description="Pelanggan adalah pihak yang Anda tagih. Catat pelanggan pertama agar tagihan dan piutangnya bisa dirinci per pelanggan."
                    actionLabel="+ Tambah Pelanggan"
                    actionHref="/customers/new"
                  />
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Link href={`/customers/${c.id}`} className="text-primary hover:underline font-medium">{c.name}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{c.address || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.pic || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/customers" searchParams={params} />
      </Card>
    </div>
  );
}
