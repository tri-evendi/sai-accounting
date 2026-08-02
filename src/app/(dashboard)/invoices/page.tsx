import { Link } from "@/components/ui/app-link";
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
import { Money } from "@/components/ui/money";
import { formatDateShort, parsePageParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Receipt } from "lucide-react";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { statusFilterLabels } from "@/lib/i18n/labels";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requirePagePermission("invoice.read");
  const t = await getT();
  const statusLabels = statusFilterLabels(await getDictionary(await getLocale()));
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 10;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "all") {
    where.status = params.status;
  }

  if (params.search) {
    where.invoiceNo = { contains: params.search };
  }

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        items: true,
        payments: true,
        // Kompensasi uang muka ikut melunasi faktur (issue #26) — kolom
        // "Pembayaran" menghitungnya juga, supaya faktur yang lunas lewat
        // uang muka tidak tampak "0 pembayaran".
        _count: { select: { advanceApplications: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.invoice.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="faktur">{t("invoices.title", { count: totalCount })}</TermTooltip>}
        actions={
          <>
            {/* Alur terpandu = tombol utama (ramah amatir); formulir polos tetap
                tersedia untuk yang sudah hafal alurnya (issue #5). */}
            <Link href="/sales/new" className="shrink-0">
              <Button>{t("invoices.recordSaleGuided")}</Button>
            </Link>
            <Link href="/invoices/new" className="shrink-0">
              <Button variant="secondary">{t("invoices.addNew")}</Button>
            </Link>
          </>
        }
      />
      <LearnMore term="faktur" className="mt-1 mb-6" label={t("invoices.learnMore")} />

      {/* Filters — hrefs membawa `search` yang sedang aktif agar berganti tab
          tidak diam-diam membuang kata kunci pencarian. `page` sengaja TIDAK
          dibawa: saringan baru = kembali ke halaman 1. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "signed", "pending", "canceled"].map((status) => {
          const query = new URLSearchParams();
          if (status !== "all") query.set("status", status);
          if (params.search) query.set("search", params.search);
          const qs = query.toString();
          return (
            <Link key={status} href={`/invoices${qs ? `?${qs}` : ""}`}>
              <Button
                variant={params.status === status || (!params.status && status === "all") ? "primary" : "secondary"}
                size="sm"
              >
                {statusLabels[status] ?? status}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Search — GET form; `status` ikut sebagai hidden input supaya mencari
          tidak mereset tab status yang sedang aktif. */}
      <form className="mb-4">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <TextInput
          type="text"
          name="search"
          placeholder={t("searchableSelect.searchPlaceholder")}
          defaultValue={params.search}
          className="w-full max-w-md"
        />
        <Button type="submit" className="ml-2">
          {t("common.search")}
        </Button>
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("invoices.colNo")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead className="text-right">{t("invoices.colItemCount")}</TableHead>
              <TableHead className="text-right">{t("invoices.colPayments")}</TableHead>
              <TableHead className="text-right">{t("invoices.colValue")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <EmptyState icon={<Receipt className="h-12 w-12" />} title={t("invoices.emptyTitle")} description={t("invoices.emptyDescription")} actionLabel={t("invoices.recordSaleGuided")} actionHref="/sales/new" />
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => {
                // Nilai faktur di mata uangnya sendiri: subtotal baris + PPN.
                // Sama seperti `invoiceSubtotal` di lib/receivables — dihitung
                // dari sumber, bukan kolom denormal, agar tak bisa basi.
                const total =
                  inv.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0) +
                  Number(inv.taxAmount ?? 0);
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link href={`/invoices/${inv.id}`} className="cursor-pointer font-medium text-primary hover:underline">
                        {inv.invoiceNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateShort(inv.date)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{inv.items.length}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {inv.payments.length + inv._count.advanceApplications}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={total} currency={inv.currency || "IDR"} />
                    </TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/invoices" searchParams={params} />
      </Card>
    </div>
  );
}
