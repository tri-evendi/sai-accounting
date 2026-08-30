/**
 * Daftar Resep Produksi (issue #495 butir 3).
 *
 * Server component. Resep DINONAKTIFKAN, tidak dihapus: perintah produksi lama
 * menyebutnya lewat FK, dan meski perintah itu menyimpan salinan barisnya
 * sendiri, menghapus resepnya akan memutus jejak asal-usulnya.
 */
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
import { formatNumber } from "@/lib/utils";
import { ExperimentOutlined } from "@ant-design/icons";

export const dynamic = "force-dynamic";

const EMPTY_ICON_SIZE = 48;

interface BomRow {
  id: number;
  code: string;
  output: string;
  outputQty: string;
  components: number;
  operations: number;
  isActive: boolean;
}

export default async function BomsPage({ params }: { params: Promise<TenantScopedParams> }) {
  await requirePagePermission("bill_of_material.read", params);
  const t = await getT();

  const boms = await prisma.billOfMaterial.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: {
      outputItem: { select: { name: true, unit: true } },
      _count: { select: { components: true, operations: true } },
    },
  });

  const rows: BomRow[] = boms.map((b) => ({
    id: b.id,
    code: b.code,
    output: b.outputItem.name,
    // Kuantitas BUKAN uang — `formatNumber` id-ID, bukan topeng rupiah.
    outputQty: `${formatNumber(Number(b.outputQuantity))} ${b.outputItem.unit || "kg"}`,
    components: b._count.components,
    operations: b._count.operations,
    isActive: b.isActive,
  }));

  const muted = (value: React.ReactNode) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{value}</span>
  );

  const columns: SaiColumns<BomRow> = [
    {
      key: "code",
      dataIndex: "code",
      title: t("boms.colCode"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/boms/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: "var(--ant-font-weight-strong)" }}
        >
          {row.code}
        </Link>
      ),
    },
    { key: "output", dataIndex: "output", title: t("boms.colOutput"), align: "left" },
    {
      key: "outputQty",
      dataIndex: "outputQty",
      title: t("boms.colOutputQty"),
      align: "right",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.outputQty}</span>
      ),
    },
    {
      key: "components",
      dataIndex: "components",
      title: t("boms.colComponents"),
      align: "right",
      render: (_v, row) => muted(row.components),
    },
    {
      key: "operations",
      dataIndex: "operations",
      title: t("boms.colOperations"),
      align: "right",
      render: (_v, row) => muted(row.operations),
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
        title={t("boms.title")}
        actions={
          <ButtonLink href="/boms/new" variant="primary">
            {t("boms.addNew")}
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
              icon={<ExperimentOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("boms.emptyTitle")}
              description={t("boms.emptyDescription")}
              actionLabel={t("boms.addNew")}
              actionHref="/boms/new"
            />
          }
        />
      </Card>
    </div>
  );
}
