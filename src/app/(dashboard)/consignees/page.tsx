import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { Ship } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConsigneesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("consignee.read");
  const t = await getT();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const [consignees, totalCount] = await Promise.all([
    prisma.consignee.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.consignee.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        title={<>{t("consignees.title", { count: totalCount })}</>}
        actions={
          <Link href="/consignees/new">
            <Button>{t("consignees.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("consignees.colCountry")}</TableHead>
              <TableHead>{t("consignees.colContact")}</TableHead>
              <TableHead>{t("common.address")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consignees.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<Ship className="h-12 w-12" />}
                    title={t("consignees.emptyTitle")}
                    description={t("consignees.emptyDescription")}
                    actionLabel={t("consignees.addNew")}
                    actionHref="/consignees/new"
                  />
                </TableCell>
              </TableRow>
            ) : (
              consignees.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/consignees/${c.id}`} className="text-primary hover:underline font-medium">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.country || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.contact || "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">{c.address || "-"}</TableCell>
                  <TableCell>
                    {c.isActive ? (
                      <Badge variant="success">{t("common.active")}</Badge>
                    ) : (
                      <Badge variant="default">{t("common.inactive")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/consignees" searchParams={params} />
      </Card>
    </div>
  );
}
