import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { FileText } from "lucide-react";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { statusFilterLabels } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requirePagePermission("contract.read");
  const t = await getT();
  const statusLabels = statusFilterLabels(await getDictionary(await getLocale()));
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "all") {
    where.status = params.status;
  }

  if (params.search) {
    where.OR = [
      { contractNo: { contains: params.search } },
      { buyer: { contains: params.search } },
      { consignee: { contains: params.search } },
      { consigneeRef: { name: { contains: params.search } } },
    ];
  }

  const [contracts, totalCount] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { date: "desc" },
      include: { items: true, payments: true, consigneeRef: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.contract.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="kontrak">{t("contracts.title", { count: totalCount })}</TermTooltip>}
        actions={
          <Link href="/contracts/new" className="shrink-0">
            <Button>{t("contracts.addNew")}</Button>
          </Link>
        }
      />
      <LearnMore term="kontrak" className="mt-1 mb-6" label={t("contracts.learnMoreList")} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "signed", "pending", "canceled"].map((status) => (
          <Link
            key={status}
            href={`/contracts${status === "all" ? "" : `?status=${status}`}`}
          >
            <Button
              variant={params.status === status || (!params.status && status === "all") ? "primary" : "secondary"}
              size="sm"
            >
              {statusLabels[status] ?? status}
            </Button>
          </Link>
        ))}
      </div>

      {/* Search */}
      <form className="mb-4">
        <TextInput
          type="text"
          name="search"
          placeholder={t("contracts.searchPlaceholder")}
          defaultValue={params.search}
          className="w-full max-w-md"
        />
        <Button type="submit" className="ml-2">
          {t("common.search")}
        </Button>
      </form>

      {/* Table */}
      <Card>
        <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("contracts.colNo")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("contracts.colBuyer")}</TableHead>
                <TableHead>
                  <TermTooltip term="penerima_barang">{t("contracts.colConsignee")}</TermTooltip>
                </TableHead>
                <TableHead className="text-right">{t("contracts.colItemCount")}</TableHead>
                <TableHead>{t("common.currency")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState icon={<FileText className="h-12 w-12" />} title={t("contracts.emptyTitle")} description={t("contracts.emptyDescription")} actionLabel={t("contracts.addNew")} actionHref="/contracts/new" />
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <Link href={`/contracts/${contract.id}`} className="cursor-pointer font-medium text-primary hover:underline">
                        {contract.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(contract.date)}</TableCell>
                    <TableCell className="text-foreground">{contract.buyer}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.consigneeRef?.name || contract.consignee || "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{contract.items.length}</TableCell>
                    <TableCell className="text-muted-foreground">{contract.currency}</TableCell>
                    <TableCell><StatusBadge status={contract.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/contracts" searchParams={params} />
      </Card>
    </div>
  );
}
