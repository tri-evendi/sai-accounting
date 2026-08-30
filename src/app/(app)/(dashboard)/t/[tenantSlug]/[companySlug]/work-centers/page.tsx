/**
 * Daftar Stasiun Kerja (issue #495 butir 3).
 *
 * Server component — tanpa `antd`, tanpa `theme.useToken()`. Stasiun
 * DINONAKTIFKAN, tidak dihapus: baris nonaktif tetap tampil (diurutkan
 * belakangan), sebab routing lama yang menyebutnya harus tetap terbaca.
 */
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { ToolOutlined } from "@ant-design/icons";
import { TermTooltip } from "@/components/ui/term-tooltip";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;

interface WorkCenterRow {
  id: number;
  code: string;
  name: string;
  laborRate: number;
  overheadRate: number;
  isActive: boolean;
}

export default async function WorkCentersPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("work_center.manage", params);
  const t = await getT();

  const centers = await prisma.workCenter.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows: WorkCenterRow[] = centers.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    laborRate: Number(w.laborRate),
    overheadRate: Number(w.overheadRate),
    isActive: w.isActive,
  }));

  const columns: SaiColumns<WorkCenterRow> = [
    { key: "code", dataIndex: "code", title: t("workCenters.colCode"), align: "left" },
    {
      key: "name",
      dataIndex: "name",
      title: t("common.name"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{row.name}</span>
      ),
    },
    {
      key: "laborRate",
      dataIndex: "laborRate",
      title: t("workCenters.colLabor"),
      align: "right",
      render: (_v, row) => <Money value={row.laborRate} currency="IDR" />,
    },
    {
      key: "overheadRate",
      dataIndex: "overheadRate",
      title: <TermTooltip term="overhead_pabrik">{t("workCenters.colOverhead")}</TermTooltip>,
      align: "right",
      render: (_v, row) => <Money value={row.overheadRate} currency="IDR" />,
    },
    {
      key: "isActive",
      dataIndex: "isActive",
      title: t("common.status"),
      align: "left",
      render: (_v, row) =>
        row.isActive ? (
          <Badge variant="success">{t("common.active")}</Badge>
        ) : (
          <Badge variant="default">{t("common.inactive")}</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("workCenters.title")}
        actions={
          <ButtonLink href="/work-centers/new" variant="primary">
            {t("workCenters.addNew")}
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
              icon={<ToolOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("workCenters.emptyTitle")}
              description={t("workCenters.emptyDescription")}
              actionLabel={t("workCenters.addNew")}
              actionHref="/work-centers/new"
            />
          }
        />
      </Card>
    </div>
  );
}
