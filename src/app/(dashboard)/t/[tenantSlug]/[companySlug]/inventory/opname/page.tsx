import { prisma } from "@/lib/prisma";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import {
  countStockHealth,
  stockLevelsFromTotals,
  toLowStockAlerts,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import { OpnameForm } from "./opname-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  // Sama seperti /inventory: semua peran boleh, tapi wajib login (audit RBAC fase 0).
  await requirePagePermission("inventory.write", params);
  const t = await getT();
  /*
   * RINGKASAN, BUKAN SELURUH GERAKAN STOK — pola yang sama dengan Beranda.
   *
   * Sebelumnya baris ini memuat SETIAP barang beserta SELURUH riwayat gerakannya
   * (semua kolom), lalu `summarizeInventory` menghitung biaya rata-rata
   * tertimbang, nilai persediaan, dan gerakan terakhir untuk tiap barang —
   * padahal halaman ini memakai SATU angka saja: saldo saat ini. Pekerjaannya
   * tumbuh seumur perusahaan dan diulang tiap kali halaman dibuka.
   *
   * Penjumlahannya kini dilakukan basis data, lalu `stockLevelsFromTotals`
   * menerapkan aturan saldo yang sama persis dengan `calculateStockTotals`
   * (dibuktikan tests/inventory-value.test.ts). Angkanya identik; yang hilang
   * hanya pekerjaannya.
   */
  const [allItems, movementTotals] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.groupBy({ by: ["itemId", "type"], _sum: { quantity: true } }),
  ]);

  const opnameItems = stockLevelsFromTotals(
    allItems,
    movementTotals.map((row) => ({
      itemId: row.itemId,
      type: row.type,
      quantity: Number(row._sum.quantity ?? 0),
    }))
  );

  const stockHealth = countStockHealth(opnameItems);
  const lowStockAlerts = toLowStockAlerts(opnameItems);
  const totalCount = stockHealth.totalItems;

  return (
    <div>
      <PageHeader
        className="mb-1"
        // Sub-halaman Stok tanpa remah roti memaksa pengguna kembali lewat menu
        // samping — satu-satunya jalan pulang sebelum ini.
        breadcrumbs={[
          { label: t("nav.items.inventory"), href: "/inventory" },
          { label: t("nav.items.inventoryOpname") },
        ]}
        title={<TermTooltip term="stok_opname">{t("nav.items.inventoryOpname")}</TermTooltip>}
        description={t("inventory.opnameDescription", { threshold: LOW_STOCK_THRESHOLD })}
        actions={
          <>
            {/* Hitung ulang yang SUDAH terjadi punya halamannya sendiri: layar
                ini adalah formulir untuk menghitung HARI INI, dan menyaringnya
                per minggu/bulan/tahun tidak punya arti — yang disaring per
                periode adalah riwayatnya (issue #129). */}
            <Link href="/inventory/opname/history">
              <Button variant="secondary">{t("opnameHistory.linkLabel")}</Button>
            </Link>
            <Link href="/inventory/update">
              <Button>{t("common.addRemoveStock")}</Button>
            </Link>
          </>
        }
      />
      <LearnMore term="stok_opname" className="mt-1 mb-6" />

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
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

      {/* Formulir hitung fisik → penyesuaian (issue #57) */}
      <Card>
        <CardHeader><CardTitle>{t("inventory.opnameFormTitle", { count: totalCount })}</CardTitle></CardHeader>
        <CardContent>
          {opnameItems.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title={t("inventory.emptyTitle")}
              description={t("inventory.opnameEmptyDescription")}
              actionLabel={t("common.addRemoveStock")}
              actionHref="/inventory/update"
            />
          ) : (
            <OpnameForm items={opnameItems} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
