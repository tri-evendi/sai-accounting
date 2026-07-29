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
import Link from "next/link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("customer.read");
  const t = await getT();
  const params = await searchParams;
  const page = parsePageParam(params.page);
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
        title={<TermTooltip term="pelanggan">{t("customers.title", { count: totalCount })}</TermTooltip>}
        actions={
          <Link href="/customers/new" className="shrink-0">
            <Button>{t("customers.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.address")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("customers.colPic")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Users className="h-12 w-12" />}
                    title={t("customers.emptyTitle")}
                    description={t("customers.emptyDescription")}
                    actionLabel={t("customers.addNew")}
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
