import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatDate, formatNumber } from "@/lib/utils";
import { DeliveryOrderPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(["bos", "core"]);
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
    ["Tanggal", formatDate(order.date)],
    [
      "Consignee",
      order.consignee
        ? [order.consignee.name, order.consignee.country, order.consignee.contact]
            .filter(Boolean)
            .join(" · ")
        : "—",
    ],
    [
      "Kontrak sumber",
      order.contract ? (
        <Link href={`/contracts/${order.contract.id}`} className="text-primary hover:underline">
          {order.contract.contractNo}
        </Link>
      ) : (
        "—"
      ),
    ],
    [
      "Faktur sumber",
      order.invoice ? (
        <Link href={`/invoices/${order.invoice.id}`} className="text-primary hover:underline">
          {order.invoice.invoiceNo}
        </Link>
      ) : (
        "—"
      ),
    ],
    ["No. Kendaraan", order.vehicleNo || "—"],
    ["No. Kontainer", order.containerNo || "—"],
    ["Catatan", order.notes || "—"],
  ];

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Surat Jalan", href: "/delivery-orders" }, { label: order.no }]} />
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Surat Jalan {order.no}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(order.date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={order.status === "canceled" ? "danger" : "success"}>
            {order.status === "canceled" ? "Dibatalkan" : "Diterbitkan"}
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
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Detail</CardTitle>
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
          <CardTitle>Barang</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Barang</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Bags</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Kg/Bag</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total (kg)</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id} className="border-b border-border">
                    <td className="px-4 py-3 text-foreground">{it.itemName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatNumber(it.bags)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatNumber(Number(it.kgPerBag))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatNumber(Number(it.quantity))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="px-4 py-3 text-foreground">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatNumber(totalBags)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatNumber(totalKg)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
