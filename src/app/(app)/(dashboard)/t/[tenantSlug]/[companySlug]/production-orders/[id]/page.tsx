/**
 * Detail Perintah Produksi (issue #495 butir 3).
 *
 * Server component; dua tindakan yang menulis ke buku besar hidup di pulau
 * client `actions.tsx`. Panel varians memakai `variansPerintahProduksi` —
 * aritmetika yang sama dengan laporannya, bukan salinan kedua.
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { variansPerintahProduksi } from "@/lib/manufacturing/variance-report";
import { ProductionOrderActions } from "./actions";
import { statusLabelKey, statusVariant } from "../status";

export const dynamic = "force-dynamic";

const SECTION_GAP = 24;

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<TenantScopedParams & { id: string }>;
}) {
  await requirePagePermission("production_order.read", params);
  const t = await getT();
  const { id } = await params;
  const orderId = parseInt(id);

  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      outputItem: true,
      components: true,
      operations: { orderBy: { sequence: "asc" } },
    },
  });
  if (!order) notFound();

  const laporan = await variansPerintahProduksi(prisma, orderId);
  const unit = order.outputItem.unit || "kg";
  const num = (n: number) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(n)}</span>
  );

  interface KomponenRow {
    id: number;
    itemName: string;
    planned: number;
    issued: number | null;
    cost: number | null;
  }
  const komponenRows: KomponenRow[] = order.components.map((c) => ({
    id: c.id,
    itemName: c.itemName,
    planned: Number(c.plannedQuantity),
    issued: c.issuedQuantity == null ? null : Number(c.issuedQuantity),
    cost: c.issuedCost == null ? null : Number(c.issuedCost),
  }));

  const komponenColumns: SaiColumns<KomponenRow> = [
    { key: "itemName", dataIndex: "itemName", title: t("common.name"), align: "left" },
    {
      key: "planned",
      dataIndex: "planned",
      title: t("productionOrders.colPlannedQty"),
      align: "right",
      render: (_v, r) => num(r.planned),
    },
    {
      key: "issued",
      dataIndex: "issued",
      title: t("productionOrders.colIssuedQty"),
      align: "right",
      // Belum dikeluarkan = "-", bukan nol. Nol berarti "dikeluarkan sebanyak
      // nol", dan itu keadaan yang berbeda.
      render: (_v, r) => (r.issued == null ? "-" : num(r.issued)),
    },
    {
      key: "cost",
      dataIndex: "cost",
      title: t("productionOrders.colIssuedCost"),
      align: "right",
      render: (_v, r) => (r.cost == null ? "-" : <Money value={r.cost} currency="IDR" />),
    },
  ];

  interface OperasiRow {
    id: number;
    label: string;
    standardHours: number;
    actualHours: number | null;
  }
  const operasiRows: OperasiRow[] = order.operations.map((op) => ({
    id: op.id,
    label: `${op.sequence}. ${op.name}`,
    standardHours: Number(op.standardHours),
    actualHours: op.actualHours == null ? null : Number(op.actualHours),
  }));

  const operasiColumns: SaiColumns<OperasiRow> = [
    { key: "label", dataIndex: "label", title: t("common.name"), align: "left" },
    {
      key: "standardHours",
      dataIndex: "standardHours",
      title: t("productionOrders.colStandardHours"),
      align: "right",
      render: (_v, r) => num(r.standardHours),
    },
    {
      key: "actualHours",
      dataIndex: "actualHours",
      title: t("productionOrders.actualHours"),
      align: "right",
      render: (_v, r) => (r.actualHours == null ? "-" : num(r.actualHours)),
    },
  ];

  /** Arah varians disebut dengan KATA — warna hanya penanda kedua. */
  const arahLabel = (arah: string) =>
    arah === "menguntungkan"
      ? t("productionOrders.favourable")
      : arah === "merugikan"
        ? t("productionOrders.unfavourable")
        : t("productionOrders.onTarget");

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("productionOrders.breadcrumb"), href: "/production-orders" },
          { label: order.orderNo },
        ]}
        title={order.orderNo}
        description={`${order.outputItem.name} · ${formatNumber(Number(order.plannedQuantity))} ${unit} · ${formatDate(order.date)}`}
        actions={
          <Badge variant={statusVariant(order.status)}>{t(statusLabelKey(order.status))}</Badge>
        }
      />

      <ProductionOrderActions
        orderId={order.id}
        status={order.status}
        operations={operasiRows.map((o) => ({
          id: o.id,
          sequence: order.operations.find((x) => x.id === o.id)!.sequence,
          name: order.operations.find((x) => x.id === o.id)!.name,
          standardHours: o.standardHours,
          actualHours: o.actualHours,
        }))}
      />

      <Card style={{ marginBottom: SECTION_GAP }}>
        <CardHeader>
          <CardTitle level={2}>{t("productionOrders.componentsTitle")}</CardTitle>
        </CardHeader>
        <StaticTable columns={komponenColumns} rows={komponenRows} rowKey={(r) => r.id} />
      </Card>

      {operasiRows.length > 0 && (
        <Card style={{ marginBottom: SECTION_GAP }}>
          <CardHeader>
            <CardTitle level={2}>{t("productionOrders.operationsTitle")}</CardTitle>
          </CardHeader>
          <StaticTable columns={operasiColumns} rows={operasiRows} rowKey={(r) => r.id} />
        </Card>
      )}

      {laporan && (
        <Card>
          <CardHeader>
            <CardTitle level={2}>{t("productionOrders.varianceTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl style={{ display: "grid", gap: 8, margin: 0 }}>
              {(
                [
                  [t("productionOrders.unitCost"), laporan.hargaPokokPerUnit],
                  [t("productionOrders.varianceMaterial"), laporan.varians.totalBahan],
                  [t("productionOrders.varianceLabor"), laporan.varians.totalUpah],
                  [t("productionOrders.varianceOverhead"), laporan.varians.totalOverhead],
                  [t("productionOrders.varianceTotal"), laporan.varians.totalMasukan],
                ] as const
              ).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <dt style={{ color: "var(--ant-color-text-secondary)" }}>{label}</dt>
                  <dd style={{ margin: 0 }}>
                    <Money value={value} currency="IDR" />
                  </dd>
                </div>
              ))}
              {laporan.varians.hasil && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <dt style={{ color: "var(--ant-color-text-secondary)" }}>
                    {t("productionOrders.varianceYield")}
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {formatNumber(laporan.varians.hasil.selisih)} {unit} —{" "}
                    {arahLabel(laporan.varians.hasil.arah)}
                  </dd>
                </div>
              )}
            </dl>
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: "var(--ant-font-size-sm)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              {t("productionOrders.varianceNote")} — {arahLabel(laporan.varians.arah)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
