/**
 * Aset per lokasi (issue #28) — active assets grouped by location, with cost,
 * accumulated depreciation and book value per location.
 *
 * Dikonversi ke token Ant Design pada issue #197. **Tetap server component**;
 * baris totalnya kini `summary` milik `StaticTable`, dipetakan per KUNCI kolom
 * sehingga ia tak bisa meleset satu kolom.
 */
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { getFixedAssets, groupByLocation, type LocationGroup } from "@/lib/fixed-assets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { qtyColumn, type SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { EnvironmentOutlined } from "@ant-design/icons";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const SECTION_GAP = 24;
const EMPTY_ICON_SIZE = 48;

export default async function AssetsByLocationPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("fixed_asset.read", params);
  const t = await getT();

  const rows = await getFixedAssets({ status: "active" });
  const groups = groupByLocation(rows);
  const totals = groups.reduce(
    (t, g) => ({
      count: t.count + g.count,
      cost: t.cost + g.cost,
      accumulated: t.accumulated + g.accumulated,
      book: t.book + g.book,
    }),
    { count: 0, cost: 0, accumulated: 0, book: 0 }
  );

  const columns: SaiColumns<LocationGroup> = [
    {
      key: "location",
      dataIndex: "location",
      title: t("fixedAssets.colLocation"),
      align: "left",
      render: (_v, g) =>
        g.location ?? (
          // Aset tanpa lokasi tercatat — dikatakan, bukan dikosongkan.
          <span style={{ color: "var(--ant-color-text-secondary)" }}>
            {t("fixedAssets.noLocation")}
          </span>
        ),
    },
    qtyColumn<LocationGroup>({
      dataIndex: "count",
      title: t("fixedAssets.colAssetCount"),
      sorter: false,
    }),
    moneyColumn<LocationGroup>({
      dataIndex: "cost",
      title: t("fixedAssets.colCost"),
      sorter: false,
    }),
    moneyColumn<LocationGroup>({
      dataIndex: "accumulated",
      title: t("fixedAssets.colAccumulated"),
      sorter: false,
    }),
    moneyColumn<LocationGroup>({
      dataIndex: "book",
      title: t("fixedAssets.colBookValue"),
      sorter: false,
    }),
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.fixedAssets"), href: "/fixed-assets" },
          { label: t("fixedAssets.byLocation") },
        ]}
        title={t("fixedAssets.byLocation")}
        description={t("fixedAssets.byLocationDescription")}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<EnvironmentOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("fixedAssets.emptyActiveTitle")}
          description={t("fixedAssets.emptyActiveDescription")}
          actionLabel={t("fixedAssets.addNew")}
          actionHref="/fixed-assets/new"
        />
      ) : (
        <Card>
          <StaticTable<LocationGroup>
            columns={columns}
            rows={groups}
            rowKey={(g) => g.location ?? "__none__"}
            summary={{
              location: t("common.total"),
              count: (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{totals.count}</span>
              ),
              cost: <Money value={totals.cost} currency="IDR" />,
              accumulated: <Money value={totals.accumulated} currency="IDR" />,
              book: <Money value={totals.book} currency="IDR" />,
            }}
          />
        </Card>
      )}

      {/* Tautan kembali berdiri di LUAR `<Card>`, tempat `--ant-color-link`
          tidak teratasi (lihat kepala `shared/aging.tsx`). Karena itu ia
          `Button href variant="link"`: warnanya dari AntD sendiri, dan
          target sentuhnya ikut naik ke ukuran kendali. */}
      <div style={{ marginTop: SECTION_GAP }}>
        <Button href="/fixed-assets" variant="link" size="sm">
          {t("fixedAssets.backToList")}
        </Button>
      </div>
    </div>
  );
}
