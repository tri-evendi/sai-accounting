import { parsePageParam } from "@/lib/utils";
import Link from "next/link";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Package as PackageIcon } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Stok terbuka untuk semua peran, tapi tetap wajib login — tanpa penjaga,
  // data stok server-rendered bisa terbaca tanpa autentikasi (audit RBAC fase 0).
  await requirePagePermission("inventory.read");
  const t = await getT();
  const params = await searchParams;
  const page = parsePageParam(params.page);
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

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="persediaan">{t("nav.items.inventory")}</TermTooltip>}
        description={t("inventory.lowStockNote", { threshold: LOW_STOCK_THRESHOLD })}
        actions={
          <>
            <InventoryPageActions items={toClientInventory(allInventory)} />
            {/* Halaman ini menjawab "berapa yang saya punya SEKARANG" dan sengaja
                tanpa periode; pertanyaan "apa yang bergerak bulan lalu" dijawab
                Kartu Stok, yang punya saldo awal & akhir sendiri (issue #126). */}
            <Link href="/inventory/movement"><Button variant="secondary">{t("stockMovement.linkLabel")}</Button></Link>
            <Link href="/inventory/update"><Button>{t("common.addRemoveStock")}</Button></Link>
            <Link href="/inventory/opname"><Button variant="secondary">{t("nav.items.inventoryOpname")}</Button></Link>
          </>
        }
      />
      <LearnMore term="stok_opname" className="mt-1 mb-6" label={t("inventory.learnMore")} />

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">{t("dashboard.statItems")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stockHealth.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">{t("dashboard.statHealthy")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-success">{stockHealth.healthy}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">{t("dashboard.statLow")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-warning">{stockHealth.lowStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">{t("dashboard.statEmpty")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{stockHealth.empty}</p></CardContent>
        </Card>
      </div>

      {/* Nilai persediaan (issue #58) — rata-rata tertimbang, sumber biaya sama dengan HPP */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-2 py-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("inventory.stockValueTitle")}</p>
            {uncostedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("inventory.uncostedNote", { count: uncostedCount })}
              </p>
            )}
          </div>
          <Money value={totalStockValue} currency="IDR" className="text-2xl font-bold" />
        </CardContent>
      </Card>

      {/* Grafik: sebaran kondisi + stok terbanyak, tepat di atas tabelnya */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
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
        <CardHeader>
          <CardTitle>{t("inventory.summaryTitle", { count: totalCount })}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.item")}</TableHead>
              <TableHead>{t("common.unit")}</TableHead>
              <TableHead className="text-right">{t("inventory.colTotalIn")}</TableHead>
              <TableHead className="text-right">{t("inventory.colTotalOut")}</TableHead>
              <TableHead className="text-right">{t("inventory.colCurrentStock")}</TableHead>
              <TableHead className="text-right">{t("inventory.colUnitCost")}</TableHead>
              <TableHead className="text-right">{t("inventory.colValue")}</TableHead>
              <TableHead>{t("inventory.colCondition")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={8} className="p-0"><EmptyState icon={<PackageIcon className="h-12 w-12" />} title={t("inventory.emptyTitle")} description={t("inventory.emptyDescription")} actionLabel={t("common.addRemoveStock")} actionHref="/inventory/update" /></TableCell></TableRow>
            ) : (
              inventory.map((item) => {
                const level = getStockLevel(item.currentStock);
                return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.unit || "-"}</TableCell>
                  <TableCell className="text-right text-success tabular-nums">{item.totalIn}</TableCell>
                  <TableCell className="text-right text-destructive tabular-nums">{item.totalOut}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{item.currentStock}</TableCell>
                  <TableCell className="text-right">
                    {item.unitCost !== null ? (
                      <Money value={item.unitCost} currency="IDR" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.stockValue !== null ? (
                      <Money value={item.stockValue} currency="IDR" className="font-semibold" />
                    ) : (
                      <span className="text-muted-foreground" title={t("inventory.noCostYet")}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStockBadgeVariant(level)}>
                      {levelLabels[level]}
                    </Badge>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory" searchParams={params} />
      </Card>
    </div>
  );
}
