/**
 * Daftar Pemasok — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 * Pemasok DINONAKTIFKAN, tidak dihapus: baris nonaktif tetap tampil dengan
 * lencananya, karena itulah satu-satunya penjelasan mengapa namanya tak lagi
 * muncul di pemilih pembelian.
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
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import { Truck } from "lucide-react";

export const dynamic = "force-dynamic";

/** `marginLG` 24 · `marginXS` 8 — token AntD sebagai angka (tanpa hook di sini). */
const SECTION_GAP = 24;
const INLINE_GAP = 8;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

interface SupplierRow {
  id: number;
  name: string;
  isActive: boolean;
  address: string;
  phone: string;
  email: string;
  transactionCount: number;
}

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("supplier.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      // Nonaktif diurutkan belakangan & diberi lencana — pola consignees.
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      // A real count, not a `take: 3` relation whose length saturates at 3.
      include: { _count: { select: { transactions: true } } },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.supplier.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    address: s.address || "-",
    phone: s.phone || "-",
    email: s.email || "-",
    transactionCount: s._count.transactions,
  }));

  const muted = (value: React.ReactNode) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{value}</span>
  );

  const columns: SaiColumns<SupplierRow> = [
    {
      key: "name",
      dataIndex: "name",
      title: t("common.name"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: INLINE_GAP,
          }}
        >
          <Link
            href={`/suppliers/${row.id}`}
            style={{
              color: "var(--ant-color-link)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {row.name}
          </Link>
          {/* Lencana menjelaskan mengapa pemasok ini tak muncul di
              pemilih pembelian — tanpa ini nonaktif tak terlihat. */}
          {!row.isActive && <Badge variant="default">{t("common.inactive")}</Badge>}
        </span>
      ),
    },
    {
      key: "address",
      dataIndex: "address",
      title: t("common.address"),
      align: "left",
      render: (_v, row) => muted(row.address),
    },
    {
      key: "phone",
      dataIndex: "phone",
      title: t("common.phone"),
      align: "left",
      render: (_v, row) => muted(row.phone),
    },
    {
      key: "email",
      dataIndex: "email",
      title: t("common.email"),
      align: "left",
      render: (_v, row) => muted(row.email),
    },
    {
      key: "transactionCount",
      dataIndex: "transactionCount",
      title: t("suppliers.colTransactions"),
      align: "right",
      // KUANTITAS, bukan uang: id-ID + tabular-nums, tanpa "Rp".
      render: (_v, row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {row.transactionCount}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="pemasok">{t("suppliers.title", { count: totalCount })}</TermTooltip>}
        description={t("suppliers.description")}
        actions={
          <Link href="/suppliers/new">
            <Button>{t("suppliers.addNew")}</Button>
          </Link>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="pembelian" label={t("suppliers.learnMore")} />
      </div>

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Truck size={EMPTY_ICON_SIZE} />}
              title={t("suppliers.emptyTitle")}
              description={t("suppliers.emptyDescription")}
              actionLabel={t("suppliers.addNew")}
              actionHref="/suppliers/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/suppliers" searchParams={filters} />
      </Card>
    </div>
  );
}
