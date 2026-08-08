import { parsePageParam } from "@/lib/utils";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import {
  countStockHealth,
  summarizeInventory,
  toLowStockAlerts,
  getStockLevel,
  getStockBadgeVariant,
  toClientInventory,
  type StockLevel,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { ChartCard } from "@/components/dashboard/chart-card";
import { StockStatusChart, StockLevelChart } from "@/components/shared/dashboard-charts";
import { stockLevelChartHeight, stockLevelSeries } from "@/lib/chart-data";
import { InventoryPageActions } from "./inventory-actions";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { qtyColumn, textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ContainerOutlined } from "@ant-design/icons";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Halaman Persediaan — dikonversi ke `StaticTable` + token AntD (issue #198).
 *
 * **Tetap server component**: seluruh isinya dibaca Prisma dan tabelnya hanya
 * MENAMPILKAN (paginasinya di server). Warna kondisi stok tetap lewat `Badge`
 * berteks, dan kuantitas — `Decimal(15,3)` — tetap lewat `qtyColumn`, bukan
 * `Money`: memformatnya sebagai uang akan mencetak "Rp" di kolom satuan barang.
 */

/** `marginLG` 24 · `margin` 16 — token AntD sebagai angka (berkas ini server). */
const SECTION_GAP = 24;
const CARD_GAP = 16;
const STAT_BASIS = 160;
const CHART_BASIS = 320;
const EMPTY_ICON_SIZE = 48;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

/**
 * `qtyColumn` yang diberi warna arah — MEMBUNGKUS, bukan menggantikan: aturan
 * kuantitas (rata kanan · tabular-nums · id-ID · "—" untuk nilai tak diketahui)
 * tetap milik satu pembantu, dan yang ditambahkan di sini hanya warnanya.
 */
function qtyStyled<T>(
  dataIndex: Extract<keyof T, string>,
  title: string,
  style: React.CSSProperties
): SaiColumns<T>[number] {
  const base = qtyColumn<T>({ dataIndex, title });
  return {
    ...base,
    render: (raw, row, index) => <span style={style}>{base.render?.(raw, row, index)}</span>,
  };
}

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  // Stok terbuka untuk semua peran, tapi tetap wajib login — tanpa penjaga,
  // data stok server-rendered bisa terbaca tanpa autentikasi (audit RBAC fase 0).
  await requirePagePermission("inventory.read", params);
  const t = await getT();
  const filters = await searchParams;
  const page = parsePageParam(filters.page);
  const perPage = 10;

  // Get all items for summary cards
  /*
   * Halaman ini memang perlu SETIAP gerakan, dan itu bukan kelalaian: nilai
   * persediaan memakai biaya rata-rata tertimbang, yang hanya bisa dihitung
   * dari gerakan `in` beserta biayanya satu per satu. Menuliskannya ulang
   * sebagai agregat SQL berarti punya DUA implementasi aturan costing — dan
   * saat keduanya berselisih, neraca dan HPP akan menyebut angka berbeda untuk
   * barang yang sama. Satu sumber kebenaran lebih berharga daripada satu query
   * yang lebih cepat (lihat weightedAverageUnitCost di lib/posting/cogs.ts).
   *
   * Yang bisa dihemat tanpa mengorbankan itu: KOLOM. Hanya empat kolom yang
   * dipakai perhitungannya, jadi `id`, `item_id`, `note`, `cost_center_id`, dan
   * stempel waktunya tidak perlu ikut menyeberang. Beranda — yang jauh lebih
   * sering dibuka — sudah tidak memuat gerakan sama sekali.
   */
  const allItems = await prisma.item.findMany({
    include: {
      stockMovements: {
        select: { quantity: true, type: true, date: true, unitCost: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const allInventory = summarizeInventory(allItems);
  const stockHealth = countStockHealth(allInventory);
  const lowStockAlerts = toLowStockAlerts(allInventory);

  // Nilai persediaan total (issue #58) — jumlah nilai item yang punya dasar
  // biaya. Item tanpa biaya (legacy tanpa unit_cost) tidak dijumlahkan dan
  // dihitung terpisah agar totalnya tidak diam-diam menganggapnya bernilai nol.
  const totalStockValue = allInventory.reduce((s, i) => s + (i.stockValue ?? 0), 0);
  const uncostedCount = allInventory.filter(
    (i) => i.stockValue === null && i.currentStock > 0
  ).length;

  // Paginate the inventory for table display
  const totalCount = stockHealth.totalItems;
  const totalPages = Math.ceil(totalCount / perPage);
  const inventory = allInventory.slice((page - 1) * perPage, page * perPage);

  const levelLabels: Record<StockLevel, string> = {
    empty: t("inventory.levelEmpty"),
    low: t("inventory.levelLow"),
    healthy: t("inventory.levelHealthy"),
  };

  /*
   * Grafik stok (dipindah dari Beranda).
   *
   * Keduanya membaca `allInventory` — kueri yang halaman ini SUDAH jalankan
   * untuk kartu ringkasan dan tabel; tidak ada kueri tambahan. Grafiknya
   * tinggal di sini karena ini halaman tempat angkanya bisa langsung dicek
   * barisnya, sementara Beranda dipakai untuk mengerjakan, bukan melihat.
   *
   * Urutan `stockStatusData` (aman → menipis → habis) MENENTUKAN warnanya:
   * `StockStatusChart` memasangkan hijau/kuning/merah per POSISI, bukan per
   * teks label — jangan diurutkan ulang.
   */
  const stockStatusData = [
    { name: levelLabels.healthy, value: stockHealth.healthy },
    { name: levelLabels.low, value: stockHealth.lowStock },
    { name: levelLabels.empty, value: stockHealth.empty },
  ];
  const stockLevelData = stockLevelSeries(allInventory);

  type InventoryRow = (typeof inventory)[number];

  const columns: SaiColumns<InventoryRow> = [
    {
      ...textColumn<InventoryRow>({ dataIndex: "name", title: t("common.item") }),
      render: (raw) => <span style={{ fontWeight: STRONG }}>{String(raw)}</span>,
    },
    {
      ...textColumn<InventoryRow>({ dataIndex: "unit", title: t("common.unit") }),
      render: (raw) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {raw ? String(raw) : "-"}
        </span>
      ),
    },
    // Masuk hijau / keluar merah — token UANG (#186), yang lolos 4,5:1 sebagai
    // teks 14px; angkanya sendiri tetap penanda non-warnanya.
    qtyStyled<InventoryRow>("totalIn", t("inventory.colTotalIn"), {
      color: "var(--ant-color-money-positive)",
    }),
    qtyStyled<InventoryRow>("totalOut", t("inventory.colTotalOut"), {
      color: "var(--ant-color-money-negative)",
    }),
    qtyStyled<InventoryRow>("currentStock", t("inventory.colCurrentStock"), { fontWeight: STRONG }),
    moneyColumn<InventoryRow>({ dataIndex: "unitCost", title: t("inventory.colUnitCost") }),
    {
      ...moneyColumn<InventoryRow>({ dataIndex: "stockValue", title: t("inventory.colValue") }),
      render: (_v, row) => (
        <Money
          value={row.stockValue}
          currency="IDR"
          style={{ fontWeight: STRONG }}
          // Barang tanpa dasar biaya menampilkan "—"; judul tetiknya menjelaskan
          // KENAPA, tanpa menambah kolom untuk satu keadaan.
          title={row.stockValue === null ? t("inventory.noCostYet") : undefined}
        />
      ),
    },
    {
      key: "condition",
      dataIndex: "currentStock",
      title: t("inventory.colCondition"),
      align: "left",
      render: (_v, row) => {
        const level = getStockLevel(row.currentStock);
        return <Badge variant={getStockBadgeVariant(level)}>{levelLabels[level]}</Badge>;
      },
    },
  ];

  /** Kartu angka ringkas: keterangan kecil di atas, angkanya besar di bawah. */
  const statCard = (label: string, value: number, color?: string) => (
    <Card>
      <div style={{ padding: "var(--ant-padding)" }}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>{label}</p>
        <p
          style={{
            margin: 0,
            marginTop: "var(--ant-margin-xxs)",
            fontSize: "var(--ant-font-size-heading-3)",
            fontWeight: STRONG,
            fontVariantNumeric: "tabular-nums",
            color,
          }}
        >
          {value}
        </p>
      </div>
    </Card>
  );

  return (
    <div>
      {/* `mb-1` lama tidak pernah berlaku: `PageHeader` menulis `marginBottom`
          sebaris, dan gaya sebaris selalu menang atas kelas. */}
      <PageHeader
        title={<TermTooltip term="persediaan">{t("nav.items.inventory")}</TermTooltip>}
        description={t("inventory.lowStockNote", { threshold: LOW_STOCK_THRESHOLD })}
        actions={
          <>
            <InventoryPageActions items={toClientInventory(allInventory)} />
            {/* Halaman ini menjawab "berapa yang saya punya SEKARANG" dan sengaja
                tanpa periode; pertanyaan "apa yang bergerak bulan lalu" dijawab
                Kartu Stok, yang punya saldo awal & akhir sendiri (issue #126). */}
            <ButtonLink href="/inventory/movement" variant="secondary">{t("stockMovement.linkLabel")}</ButtonLink>
            <ButtonLink href="/inventory/update" variant="primary">{t("common.addRemoveStock")}</ButtonLink>
            <ButtonLink href="/inventory/opname" variant="secondary">{t("nav.items.inventoryOpname")}</ButtonLink>
          </>
        }
      />
      <div style={{ marginBottom: SECTION_GAP }}>
        <LearnMore term="stok_opname" label={t("inventory.learnMore")} />
      </div>

      <div style={{ marginBottom: SECTION_GAP }}>
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_BASIS}px, 1fr))`,
          marginBottom: CARD_GAP,
        }}
      >
        {statCard(t("dashboard.statItems"), stockHealth.totalItems)}
        {statCard(
          t("dashboard.statHealthy"),
          stockHealth.healthy,
          "var(--ant-color-money-positive)"
        )}
        {statCard(t("dashboard.statLow"), stockHealth.lowStock, "var(--ant-color-money-pending)")}
        {statCard(t("dashboard.statEmpty"), stockHealth.empty, "var(--ant-color-money-negative)")}
      </div>

      {/* Nilai persediaan (issue #58) — rata-rata tertimbang, sumber biaya sama dengan HPP */}
      <Card style={{ marginBottom: SECTION_GAP }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            padding: "var(--ant-padding)",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
              {t("inventory.stockValueTitle")}
            </p>
            {uncostedCount > 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size-sm)",
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("inventory.uncostedNote", { count: uncostedCount })}
              </p>
            )}
          </div>
          <Money
            value={totalStockValue}
            currency="IDR"
            style={{ fontSize: "var(--ant-font-size-heading-3)", fontWeight: STRONG }}
          />
        </div>
      </Card>

      {/* Grafik: sebaran kondisi + stok terbanyak, tepat di atas tabelnya */}
      <div
        style={{
          display: "grid",
          gap: SECTION_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${CHART_BASIS}px, 1fr))`,
          marginBottom: SECTION_GAP,
        }}
      >
        <ChartCard
          title={t("dashboard.chartStockConditionTitle")}
          description={t("dashboard.chartStockConditionDesc")}
        >
          <StockStatusChart data={stockStatusData} />
        </ChartCard>
        <ChartCard
          title={t("dashboard.chartTopStockTitle")}
          description={t("dashboard.chartTopStockDesc")}
          chartMinHeight={stockLevelChartHeight(stockLevelData)}
        >
          <StockLevelChart data={stockLevelData} />
        </ChartCard>
      </div>

      {/* Stock Table */}
      <Card>
        <div
          style={{
            padding: "var(--ant-padding-lg)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
            {t("inventory.summaryTitle", { count: totalCount })}
          </h2>
        </div>
        <StaticTable<InventoryRow>
          columns={columns}
          rows={inventory}
          rowKey={(item) => item.id}
          empty={
            <EmptyState
              icon={<ContainerOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("inventory.emptyTitle")}
              description={t("inventory.emptyDescription")}
              actionLabel={t("common.addRemoveStock")}
              actionHref="/inventory/update"
            />
          }
        />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory" searchParams={filters} />
      </Card>
    </div>
  );
}
