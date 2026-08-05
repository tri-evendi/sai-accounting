/**
 * Rincian Surat Jalan — dikonversi ke token Ant Design pada issue #195.
 *
 * **Tetap server component** (tanpa `antd`). Warna lewat primitif yang
 * mewarnai dirinya sendiri + variabel `--ant-…` yang hanya dipakai di dalam
 * pohon `<Card>`. Seluruh angka di sini KUANTITAS (`Decimal(15,3)`), jadi
 * semuanya lewat `formatNumber` — tidak ada satu pun kolom uang di halaman ini.
 */

import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Link } from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { DeliveryOrderPdfButton } from "./pdf-button";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `marginSM` 12 — token AntD sebagai angka (server component). */
const SECTION_GAP = 24;
const INFO_GAP = 12;
/** Lebar dasar satu pasang istilah–nilai pada daftar info. */
const INFO_BASIS = 240;

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("delivery_order.read", params);
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
        <Link href={`/contracts/${order.contract.id}`} style={{ color: "var(--ant-color-link)" }}>
          {order.contract.contractNo}
        </Link>
      ) : (
        "—"
      ),
    ],
    [
      t("deliveryOrders.infoInvoice"),
      order.invoice ? (
        <Link href={`/invoices/${order.invoice.id}`} style={{ color: "var(--ant-color-link)" }}>
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

  const itemColumns: SaiColumns<(typeof order.items)[number]> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.item"), align: "left" },
    {
      key: "bags",
      dataIndex: "bags",
      title: t("common.bags"),
      align: "right",
      render: (_v, it) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(it.bags)}</span>
      ),
    },
    {
      key: "kgPerBag",
      dataIndex: "kgPerBag",
      title: t("common.kgPerBag"),
      align: "right",
      // `Decimal(15,3)`: 12,5 kg harus tetap 12,5 — bukan dibulatkan.
      render: (_v, it) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatNumber(Number(it.kgPerBag))}
        </span>
      ),
    },
    {
      key: "quantity",
      dataIndex: "quantity",
      title: t("deliveryOrders.colTotalKg"),
      align: "right",
      render: (_v, it) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatNumber(Number(it.quantity))}
        </span>
      ),
    },
  ];

  return (
    <div>
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

      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle>{t("deliveryOrders.infoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* `sm:grid-cols-2` diganti baris yang membungkus sendiri: satu kolom
              di 375px, dua atau lebih begitu ruangnya ada. */}
          <dl
            style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: INFO_GAP }}
          >
            {info.map(([label, value]) => (
              <div key={label} style={{ flex: `1 1 ${INFO_BASIS}px`, minWidth: 0 }}>
                <dt style={{ color: "var(--ant-color-text-secondary)" }}>
                  <small>{label}</small>
                </dt>
                <dd style={{ margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("deliveryOrders.goodsTitle")}</CardTitle>
        </CardHeader>
        {/* Tabelnya menempel tepi kartu — `CardContent px-0` lama hanya ada
            untuk itu, jadi pembungkusnya dilepas seluruhnya. */}
        <StaticTable
          columns={itemColumns}
          rows={order.items}
          rowKey={(it) => it.id}
          summary={{
            itemName: t("common.total"),
            bags: (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(totalBags)}
              </span>
            ),
            quantity: (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(totalKg)}
              </span>
            ),
          }}
        />
      </Card>
    </div>
  );
}
