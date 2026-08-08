/**
 * Pusat Biaya — master dimensi (issue #91), dikonversi ke token Ant Design
 * pada issue #196.
 *
 * Daftar hierarkis (induk dulu, anak bersarang), pola yang sama dengan Daftar
 * Akun. Tidak ada tombol hapus, dan itu disengaja: pusat biaya yang pernah
 * disebut baris jurnal harus tetap terbaca namanya selamanya, jadi cara
 * menyingkirkannya adalah menonaktifkannya lewat form Ubah — karena itu kolom
 * Status wajib ada di daftar ini, bukan barisnya yang hilang.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`
 * (`tests/rsc-boundary.test.ts`). Warna datang dari primitif yang mewarnai
 * dirinya sendiri (`Badge`) dan dari variabel `--ant-…` yang hanya dipakai DI
 * DALAM pohon `<Card>` — alasannya panjang di kepala `shared/aging.tsx`.
 *
 * Hierarkinya DIRATAKAN lebih dulu menjadi baris ber-`depth`, bukan dirender
 * sebagai `Table` `expandable` AntD: yang terakhir itu komponen client, dan
 * memakainya berarti seluruh daftar pusat biaya ikut disalin ke peramban demi
 * kemampuan melipat cabang yang daftar sependek ini tidak membutuhkannya
 * (aturan pemilihan perender, issue #189).
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { BranchesOutlined } from "@ant-design/icons";
import { Link } from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Lekukan satu tingkat hierarki, dalam piksel. Sama seperti sebelum migrasi. */
const INDENT = 20;

/** Satu baris daftar, sudah diratakan dari pohonnya. */
interface CostCenterRow {
  id: number;
  code: string;
  name: string;
  depth: number;
  childCount: number;
  isActive: boolean;
}

export default async function CostCentersPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("cost_center.manage", params);
  const t = await getT();

  const costCenters = await prisma.costCenter.findMany({ orderBy: { code: "asc" } });

  const childrenOf = new Map<number | null, typeof costCenters>();
  for (const c of costCenters) {
    const key = c.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(c);
  }

  const rows: CostCenterRow[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const c of childrenOf.get(parentId) ?? []) {
      rows.push({
        id: c.id,
        code: c.code,
        name: c.name,
        depth,
        childCount: (childrenOf.get(c.id) ?? []).length,
        isActive: c.isActive,
      });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);

  const columns: SaiColumns<CostCenterRow> = [
    {
      key: "code",
      dataIndex: "code",
      title: t("costCenters.codeField"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontFamily: "var(--ant-font-family-code)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      key: "name",
      dataIndex: "name",
      title: t("costCenters.nameField"),
      align: "left",
      render: (_v, row) => (
        <span style={{ display: "inline-block", paddingLeft: row.depth * INDENT }}>
          {/* Penanda kedalaman: bentuk, bukan warna — ia harus tetap terbaca
              saat halaman dicetak hitam-putih. */}
          {row.depth > 0 && (
            <span aria-hidden="true" style={{ color: "var(--ant-color-text-secondary)" }}>
              └{" "}
            </span>
          )}
          <Link
            href={`/cost-centers/${row.id}/edit`}
            style={{
              color: "var(--ant-color-link)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      key: "childCount",
      dataIndex: "childCount",
      title: t("costCenters.colChildren"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {/* Nol anak ditulis "—": cabang tanpa turunan bukan "0 turunan". */}
          {row.childCount || "—"}
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
        title={t("costCenters.title", { count: costCenters.length })}
        description={t("costCenters.intro")}
        actions={
          <ButtonLink href="/cost-centers/new" variant="primary">
            {t("costCenters.addNew")}
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
              icon={<BranchesOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("costCenters.emptyTitle")}
              description={t("costCenters.emptyDescription")}
              actionLabel={t("costCenters.addNew")}
              actionHref="/cost-centers/new"
            />
          }
        />
      </Card>
    </div>
  );
}
