/**
 * Surat Jalan / Delivery Order — daftar (issue #14).
 *
 * Surat jalan kini dokumen tersimpan (bukan sekadar PDF): setiap baris menyebut
 * dokumen sumber (kontrak/faktur) dan consignee, membawa total kuantitas (kg),
 * dan menautkan ke detail + cetak PDF. Kuantitas rata-kanan & tabular per MASTER.
 */
import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
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
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber, formatDateShort, parsePageParam } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { Truck, Plus, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeliveryOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  await requirePagePermission("delivery_order.read");
  const t = await getT();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const perPage = 20;

  // Pencarian menutup nomor SJ dan nama consignee — dua kolom pengenal yang
  // benar-benar tampil di daftar (pola /contracts).
  const where: Record<string, unknown> = {};
  if (params.search) {
    where.OR = [
      { no: { contains: params.search } },
      { consignee: { name: { contains: params.search } } },
    ];
  }

  const [orders, totalCount] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        items: true,
        contract: { select: { contractNo: true } },
        invoice: { select: { invoiceNo: true } },
        consignee: { select: { name: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.deliveryOrder.count({ where }),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <PageHeader
        title={t("deliveryOrders.title")}
        description={t("deliveryOrders.description")}
        actions={
          <Link href="/delivery-orders/new">
            <Button className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("deliveryOrders.addNew")}
            </Button>
          </Link>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t("deliveryOrders.stockNoteA")} <strong>{t("deliveryOrders.stockNoteStrong")}</strong>{" "}
          {t("deliveryOrders.stockNoteB")}
        </span>
      </p>

      {/* Search — GET form (pola /contracts); saringan baru = kembali ke hal. 1. */}
      <form className="mb-4">
        <TextInput
          type="text"
          name="search"
          placeholder={t("common.search")}
          defaultValue={params.search}
          className="w-full max-w-md"
        />
        <Button type="submit" className="ml-2">
          {t("common.search")}
        </Button>
      </form>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-12 w-12" />}
          title={t("deliveryOrders.emptyTitle")}
          description={t("deliveryOrders.emptyDescription")}
          actionLabel={t("deliveryOrders.addNew")}
          actionHref="/delivery-orders/new"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("deliveryOrders.colNo")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("deliveryOrders.colConsignee")}</TableHead>
                <TableHead>{t("deliveryOrders.colSource")}</TableHead>
                <TableHead className="text-right">{t("common.bags")}</TableHead>
                <TableHead className="text-right">{t("deliveryOrders.colTotalKg")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const totalBags = o.items.reduce((s, i) => s + i.bags, 0);
                const totalKg = o.items.reduce((s, i) => s + Number(i.quantity), 0);
                const source =
                  o.contract?.contractNo || o.invoice?.invoiceNo || "—";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link
                        href={`/delivery-orders/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        {o.no}
                      </Link>
                    </TableCell>
                    <TableCell className="text-foreground">{formatDateShort(o.date)}</TableCell>
                    <TableCell className="text-foreground">{o.consignee?.name || "—"}</TableCell>
                    <TableCell className="text-foreground">{source}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(totalBags)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatNumber(totalKg)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.status === "canceled" ? "danger" : "success"}>
                        {o.status === "canceled"
                          ? t("status.contract.canceled")
                          : t("deliveryOrders.statusIssued")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/delivery-orders"
            searchParams={params}
          />
        </Card>
      )}
    </div>
  );
}
