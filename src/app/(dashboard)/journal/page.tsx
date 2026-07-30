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
import { MoneyCell } from "@/components/ui/money";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BookText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("journal.read");
  const t = await getT();
  const typeLabels: Record<string, string> = {
    general: t("journal.type.general"),
    sales: t("journal.type.sales"),
    purchase: t("journal.type.purchase"),
    cash: t("journal.type.cash"),
    adjustment: t("journal.type.adjustment"),
    reversal: t("journal.type.reversal"),
  };

  // Paginated with a real count — the old hard `take: 100` made journal #101
  // unreachable from any UI surface and froze the heading at "(100)" forever.
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 25;
  const [journals, totalCount] = await Promise.all([
    prisma.journal.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: { lines: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.journal.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        title={t("journal.title", { count: totalCount })}
        actions={
          <Link href="/journal/new">
            <Button>{t("journal.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("journal.colNumber")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("journal.colType")}</TableHead>
              <TableHead>{t("common.description")}</TableHead>
              <TableHead className="text-right">{t("journal.colTotalIdr")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journals.length > 0 ? (
              journals.map((j) => {
                const total = j.lines.reduce((s, l) => s + Number(l.baseDebit), 0);
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/journal/${j.id}`} className="font-mono text-primary hover:underline">
                        {j.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(j.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{typeLabels[j.type] ?? j.type}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{j.note ?? "—"}</TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={total} currency="IDR" hideCurrency />
                    </TableCell>
                    <TableCell>
                      {j.isReversed ? (
                        <Badge variant="warning">{t("journal.statusReversed")}</Badge>
                      ) : j.type === "reversal" ? (
                        <Badge variant="default">{t("journal.statusReversal")}</Badge>
                      ) : (
                        <Badge variant="success">{t("common.active")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={<BookText className="h-12 w-12" />}
                    title={t("journal.emptyTitle")}
                    description={t("journal.emptyDescription")}
                    actionLabel={t("journal.emptyAction")}
                    actionHref="/journal/new"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/journal" searchParams={params} />
      </Card>
    </div>
  );
}
