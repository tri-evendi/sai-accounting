import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { DeliveryOrderPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("delivery_order.read");
  const t = await getT();
  const { id } = await params;

  const order = await prisma.deliveryOrder.findUnique({
    where: { id: parseInt(id) },
    include: {
      items: true,
      contract: { select: { id: true, contractNo: true, buyer: true } },
      invoice: { select: { id: true, invoiceNo: true } },
      consignee: { select: { name: true, country: true, contact: true } },
    },
  });

  if (!order) notFound();

  const totalBags = order.items.reduce((s, i) => s + i.bags, 0);
  const totalKg = order.items.reduce((s, i) => s + Number(i.quantity), 0);

  // Buyer shown on the PDF: the linked contract's buyer, else the consignee name.
  const buyer = order.contract?.buyer ?? order.consignee?.name ?? "-";

  const info: [string, React.ReactNode][] = [
    [t("common.date"), formatDate(order.date)],
    [
      t("deliveryOrders.colConsignee"),
      order.consignee
        ? [order.consignee.name, order.consignee.country, order.consignee.contact]
            .filter(Boolean)
            .join(" · ")
        : "—",
    ],
    [
      t("deliveryOrders.infoContract"),
      order.contract ? (
        <Link href={`/contracts/${order.contract.id}`} className="text-primary hover:underline">
          {order.contract.contractNo}
        </Link>
      ) : (
        "—"
      ),
    ],
    [
      t("deliveryOrders.infoInvoice"),
      order.invoice ? (
        <Link href={`/invoices/${order.invoice.id}`} className="text-primary hover:underline">
          {order.invoice.invoiceNo}
        </Link>
      ) : (
        "—"
      ),
    ],
    [t("deliveryOrders.vehicleNo"), order.vehicleNo || "—"],
    [t("deliveryOrders.containerNo"), order.containerNo || "—"],
    [t("common.notes"), order.notes || "—"],
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("deliveryOrders.title"), href: "/delivery-orders" },
          { label: order.no },
        ]}
        title={t("deliveryOrders.detailTitle", { no: order.no })}
        description={formatDate(order.date)}
        actions={
          <>
          <Badge variant={order.status === "canceled" ? "danger" : "success"}>
            {order.status === "canceled"
              ? t("status.contract.canceled")
              : t("deliveryOrders.statusIssued")}
          </Badge>
          <DeliveryOrderPdfButton
            order={{
              no: order.no,
              date: order.date.toISOString(),
              buyer,
              consignee: order.consignee?.name ?? null,
              vehicleNo: order.vehicleNo,
              containerNo: order.containerNo,
              items: order.items.map((i) => ({
                itemName: i.itemName,
                bags: i.bags,
                kgPerBag: Number(i.kgPerBag),
              })),
            }}
          />
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("deliveryOrders.infoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {info.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("deliveryOrders.goodsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.item")}</TableHead>
                <TableHead className="text-right">{t("common.bags")}</TableHead>
                <TableHead className="text-right">{t("common.kgPerBag")}</TableHead>
                <TableHead className="text-right">{t("deliveryOrders.colTotalKg")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="text-foreground">{it.itemName}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(it.bags)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(Number(it.kgPerBag))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatNumber(Number(it.quantity))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-transparent">
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell className="text-foreground">{t("common.total")}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {formatNumber(totalBags)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-foreground">
                  {formatNumber(totalKg)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
