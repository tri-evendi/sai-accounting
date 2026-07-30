import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { Lock, Scale } from "lucide-react";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ReconciliationListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePagePermission("reconciliation.read");
  const t = await getT();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 20;

  // Saringan status memakai dua nilai yang memang ada di kolomnya; nilai lain
  // (atau kosong) berarti "semua" — URL editan tangan tidak bisa membuat 500.
  const status =
    params.status === "locked" || params.status === "draft" ? params.status : undefined;
  const where = status ? { status } : {};

  const [statements, totalCount] = await Promise.all([
    prisma.bankStatement.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
      include: { _count: { select: { lines: true } } },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.bankStatement.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const statusFilters = [
    { value: undefined, label: t("common.all") },
    { value: "locked", label: t("reconciliation.statusLocked") },
    { value: "draft", label: t("reconciliation.statusDraft") },
  ] as const;

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="rekonsiliasi_bank">{t("reconciliation.title")}</TermTooltip>}
        description={t("reconciliation.description")}
        actions={
          <Link href="/reconciliation/new">
            <Button>{t("reconciliation.addNew")}</Button>
          </Link>
        }
      />
      {/* issue #21 — jalan pintas ke penjelasan istilah layar ini. */}
      <LearnMore term="rekonsiliasi_bank" className="mt-1 mb-6" />

      {/* Saringan status — chip GET (pola /contracts); saringan baru = hal. 1. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/reconciliation?status=${f.value}` : "/reconciliation"}
          >
            <Button variant={status === f.value ? "primary" : "secondary"} size="sm">
              {f.label}
            </Button>
          </Link>
        ))}
      </div>

      {statements.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-12 w-12" />}
          title={t("reconciliation.emptyTitle")}
          description={t("reconciliation.emptyDescription")}
          actionLabel={t("reconciliation.emptyAction")}
          actionHref="/reconciliation/new"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.listTitle", { count: totalCount })}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("reconciliation.colPeriod")}</TableHead>
                <TableHead>{t("reconciliation.colAccount")}</TableHead>
                <TableHead className="text-right">{t("reconciliation.colOpening")}</TableHead>
                <TableHead className="text-right">{t("reconciliation.colClosing")}</TableHead>
                <TableHead className="text-right">{t("reconciliation.colStatementLines")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-foreground">
                    {formatDateShort(s.periodStart)} — {formatDateShort(s.periodEnd)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {t("reconciliation.accountBank", { currency: s.currency })}
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(s.openingBalance)}
                      currency={s.currency}
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="text-foreground"
                      value={Number(s.closingBalance)}
                      currency={s.currency}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {s._count.lines}
                  </TableCell>
                  <TableCell>
                    {s.status === "locked" ? (
                      <Badge variant="success">
                        <Lock className="mr-1 h-3 w-3" aria-hidden="true" /> {t("reconciliation.statusLocked")}
                      </Badge>
                    ) : (
                      <Badge variant="warning">{t("reconciliation.statusDraft")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/reconciliation/${s.id}`} className="text-primary hover:underline">
                      {t("reconciliation.open")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/reconciliation"
            searchParams={params}
          />
        </Card>
      )}
    </div>
  );
}
