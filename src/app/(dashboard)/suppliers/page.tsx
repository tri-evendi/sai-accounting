import { parsePageParam } from "@/lib/utils";
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
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import { Truck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("supplier.read");
  const t = await getT();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 10;

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      // A real count, not a `take: 3` relation whose length saturates at 3.
      include: { _count: { select: { transactions: true } } },
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
        title={<TermTooltip term="pemasok">{t("suppliers.title", { count: totalCount })}</TermTooltip>}
        description={t("suppliers.description")}
        actions={
          <Link href="/suppliers/new" className="shrink-0">
            <Button>{t("suppliers.addNew")}</Button>
          </Link>
        }
      />
      <LearnMore term="pembelian" className="mt-1 mb-6" label={t("suppliers.learnMore")} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.address")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("suppliers.colTransactions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Truck className="h-12 w-12" />}
                    title={t("suppliers.emptyTitle")}
                    description={t("suppliers.emptyDescription")}
                    actionLabel={t("suppliers.addNew")}
                    actionHref="/suppliers/new"
                  />
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="text-primary hover:underline font-medium">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.address || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{s._count.transactions}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/suppliers" searchParams={params} />
      </Card>
    </div>
  );
}
