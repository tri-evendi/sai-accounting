/** Daftar Perintah Produksi (issue #495 butir 3). Server component. */
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { SettingOutlined } from "@ant-design/icons";
import { statusLabelKey, statusVariant } from "./status";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;

interface OrderRow {
  id: number;
  orderNo: string;
  date: string;
  output: string;
  planned: string;
  produced: string;
  status: string;
}

export default async function ProductionOrdersPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("production_order.read", params);
  const t = await getT();

  const orders = await prisma.productionOrder.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 100,
    include: { outputItem: { select: { name: true, unit: true } } },
  });

  const rows: OrderRow[] = orders.map((o) => {
    const unit = o.outputItem.unit || "kg";
    return {
      id: o.id,
      orderNo: o.orderNo,
      date: formatDate(o.date),
      output: o.outputItem.name,
      planned: `${formatNumber(Number(o.plannedQuantity))} ${unit}`,
      // Belum selesai = belum ada hasil. "-" berbeda dari nol, dan bedanya penting.
      produced:
        o.producedQuantity == null ? "-" : `${formatNumber(Number(o.producedQuantity))} ${unit}`,
      status: o.status,
    };
  });

  const num = (v: string) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>;

  const columns: SaiColumns<OrderRow> = [
    {
      key: "orderNo",
      dataIndex: "orderNo",
      title: t("productionOrders.colNo"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/production-orders/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.orderNo}
        </Link>
      ),
    },
    { key: "date", dataIndex: "date", title: t("productionOrders.colDate"), align: "left" },
    { key: "output", dataIndex: "output", title: t("productionOrders.colOutput"), align: "left" },
    {
      key: "planned",
      dataIndex: "planned",
      title: t("productionOrders.colPlanned"),
      align: "right",
      render: (_v, row) => num(row.planned),
    },
    {
      key: "produced",
      dataIndex: "produced",
      title: t("productionOrders.colProduced"),
      align: "right",
      render: (_v, row) => num(row.produced),
    },
    {
      key: "status",
      dataIndex: "status",
      title: t("productionOrders.colStatus"),
      align: "left",
      render: (_v, row) => (
        <Badge variant={statusVariant(row.status)}>{t(statusLabelKey(row.status))}</Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("productionOrders.title")}
        actions={
          <ButtonLink href="/production-orders/new" variant="primary">
            {t("productionOrders.addNew")}
          </ButtonLink>
        }
      />
      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<SettingOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("productionOrders.emptyTitle")}
              description={t("productionOrders.emptyDescription")}
              actionLabel={t("productionOrders.addNew")}
              actionHref="/production-orders/new"
            />
          }
        />
      </Card>
    </div>
  );
}
