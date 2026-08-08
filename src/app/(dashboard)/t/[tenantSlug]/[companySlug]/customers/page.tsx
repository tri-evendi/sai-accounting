/**
 * Daftar Pelanggan — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`.
 * Warna: `Badge` (mewarnai dirinya sendiri) + variabel `--ant-…` di dalam
 * `<Card>`.
 *
 * Pelanggan DINONAKTIFKAN, tidak dihapus: baris nonaktif tetap ditampilkan
 * (diurutkan belakangan) dan diberi lencana, karena itulah satu-satunya
 * penjelasan mengapa nama tersebut tak lagi muncul di pemilih faktur.
 *
 * ── Sortir kolom lewat URL (issue #265) ────────────────────────────────────
 * Hanya kolom Nama, dan itu keputusan: alamat/telepon/email/PIC disimpan
 * sebagai teks bebas yang boleh kosong, dan mengurutkannya menaik akan menaikkan
 * blok baris "-" ke puncak (MySQL menganggap string kosong maupun NULL paling
 * kecil, dan tidak punya `NULLS LAST` — lihat kepala `lib/table-sort.ts`).
 *
 * Perhatikan `SORTABLE.name`: `isActive` tetap kunci PERTAMA di kedua arah,
 * jadi pelanggan nonaktif tidak naik ke puncak hanya karena pengguna membalik
 * urutan nama. Urutan bawaan halaman ini memang bertingkat, dan sortir kolom
 * mengganti tingkat KEDUAnya saja.
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
import { Link } from "@/components/ui/app-link";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { TeamOutlined } from "@ant-design/icons";
import {
  parseSort,
  sortOrderBy,
  sortableKeys,
  type SortSpec,
} from "@/lib/table-sort";
import type { Prisma } from "@/generated/prisma/client";
export const dynamic = "force-dynamic";

/**
 * Kunci kolom yang bisa diurutkan → `orderBy` Prisma-nya (issue #265).
 * `isActive` tetap kunci pertama — lihat kepala berkas.
 */
const SORTABLE: SortSpec<Prisma.CustomerOrderByWithRelationInput[]> = {
  name: (dir) => [{ isActive: "desc" }, { name: dir }, { id: dir }],
};

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** `marginXS` 8 — token AntD sebagai angka (tanpa hook di berkas server). */
const INLINE_GAP = 8;

interface CustomerRow {
  id: number;
  name: string;
  isActive: boolean;
  address: string;
  phone: string;
  email: string;
  pic: string;
}

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>;
}) {
  await requirePagePermission("customer.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  // Tanpa `?sort=` urutannya persis seperti sebelum #265.
  const sort = parseSort(filters, SORTABLE);

  const [customers, totalCount] = await Promise.all([
    prisma.customer.findMany({
      // Nonaktif diurutkan belakangan & diberi lencana — pola consignees.
      orderBy: sortOrderBy(sort, SORTABLE, [{ isActive: "desc" }, { name: "asc" }]),
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  const rows: CustomerRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    address: c.address || "-",
    phone: c.phone || "-",
    email: c.email || "-",
    pic: c.pic || "-",
  }));

  const muted = (value: React.ReactNode) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{value}</span>
  );

  const columns: SaiColumns<CustomerRow> = [
    {
      key: "name",
      dataIndex: "name",
      title: t("common.name"),
      align: "left",
      sorter: true,
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
            href={`/customers/${row.id}`}
            style={{
              color: "var(--ant-color-link)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {row.name}
          </Link>
          {/* Lencana menjelaskan mengapa pelanggan ini tak muncul di
              pemilih faktur — tanpa ini nonaktif tak terlihat. */}
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
      key: "pic",
      dataIndex: "pic",
      title: t("customers.colPic"),
      align: "left",
      render: (_v, row) => muted(row.pic),
    },
  ];

  return (
    <div>
      <PageHeader
        title={<TermTooltip term="pelanggan">{t("customers.title", { count: totalCount })}</TermTooltip>}
        actions={
          <Link href="/customers/new">
            <Button>{t("customers.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          sort={{
            basePath: "/customers",
            params: filters,
            keys: sortableKeys(SORTABLE),
            active: sort,
          }}
          empty={
            <EmptyState
              icon={<TeamOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("customers.emptyTitle")}
              description={t("customers.emptyDescription")}
              actionLabel={t("customers.addNew")}
              actionHref="/customers/new"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/customers" searchParams={filters} />
      </Card>
    </div>
  );
}
