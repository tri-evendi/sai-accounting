/**
 * Daftar Penerima Barang — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 * Penerima DINONAKTIFKAN, tidak dihapus: baris nonaktif tetap tampil
 * (diurutkan belakangan) dengan kolom Status yang menjelaskannya.
 */
import { parsePageParam } from "@/lib/utils";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { GlobalOutlined } from "@ant-design/icons";
import { Link } from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Lebar maksimum kolom alamat (`max-w-xs` lama = 20rem). */
const ADDRESS_MAX_WIDTH = 320;

interface ConsigneeRow {
  id: number;
  name: string;
  country: string;
  contact: string;
  address: string;
  isActive: boolean;
}

export default async function ConsigneesPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("consignee.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  const [consignees, totalCount] = await Promise.all([
    prisma.consignee.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.consignee.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: ConsigneeRow[] = consignees.map((c) => ({
    id: c.id,
    name: c.name,
    country: c.country || "-",
    contact: c.contact || "-",
    address: c.address || "-",
    isActive: c.isActive,
  }));

  const muted = (value: React.ReactNode) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{value}</span>
  );

  const columns: SaiColumns<ConsigneeRow> = [
    {
      key: "name",
      dataIndex: "name",
      title: t("common.name"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/consignees/${row.id}`}
          style={{
            color: "var(--ant-color-link)",
            fontWeight: "var(--ant-font-weight-strong)",
          }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "country",
      dataIndex: "country",
      title: t("consignees.colCountry"),
      align: "left",
      render: (_v, row) => muted(row.country),
    },
    {
      key: "contact",
      dataIndex: "contact",
      title: t("consignees.colContact"),
      align: "left",
      render: (_v, row) => muted(row.contact),
    },
    {
      key: "address",
      dataIndex: "address",
      title: t("common.address"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            display: "block",
            maxWidth: ADDRESS_MAX_WIDTH,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--ant-color-text-secondary)",
          }}
          title={row.address}
        >
          {row.address}
        </span>
      ),
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
        title={t("consignees.title", { count: totalCount })}
        actions={
          <Link href="/consignees/new">
            <Button>{t("consignees.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<GlobalOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("consignees.emptyTitle")}
              description={t("consignees.emptyDescription")}
              actionLabel={t("consignees.addNew")}
              actionHref="/consignees/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/consignees" searchParams={filters} />
      </Card>
    </div>
  );
}
