import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  countStockHealth,
  summarizeInventory,
  toLowStockAlerts,
  getStockLevel,
  getStockBadgeVariant,
  STOCK_LEVEL_LABELS,
  toClientInventory,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { InventoryPageActions } from "./inventory-actions";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Package as PackageIcon } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  // Get all items for summary cards
  const allItems = await prisma.item.findMany({
    include: { stock: true },
    orderBy: { name: "asc" },
  });

  const allInventory = summarizeInventory(allItems);
  const stockHealth = countStockHealth(allInventory);
  const lowStockAlerts = toLowStockAlerts(allInventory);

  // Paginate the inventory for table display
  const totalCount = stockHealth.totalItems;
  const totalPages = Math.ceil(totalCount / perPage);
  const inventory = allInventory.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            <TermTooltip term="persediaan">Stok Barang</TermTooltip>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Batas stok menipis: ≤ {LOW_STOCK_THRESHOLD} satuan
          </p>
          <LearnMore term="stok_opname" className="mt-1" label="Pelajari ini: hitung ulang stok" />
        </div>
        <div className="flex flex-wrap gap-2">
          <InventoryPageActions items={toClientInventory(allInventory)} />
          <Link href="/inventory/update"><Button>Tambah / Kurangi Stok</Button></Link>
          <Link href="/inventory/opname"><Button variant="secondary">Hitung Ulang Stok</Button></Link>
        </div>
      </div>

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Jumlah Barang</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stockHealth.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Stok Aman</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-success">{stockHealth.healthy}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Stok Menipis</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-warning">{stockHealth.lowStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Stok Habis</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{stockHealth.empty}</p></CardContent>
        </Card>
      </div>

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Stok ({totalCount})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Barang</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Satuan</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total Masuk</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total Keluar</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Sisa Stok</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Kondisi</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={<PackageIcon className="h-12 w-12" />} title="Belum ada barang di stok" description="Catat barang masuk pertama Anda." actionLabel="Tambah / Kurangi Stok" actionHref="/inventory/update" /></td></tr>
              ) : (
                inventory.map((item) => {
                  const level = getStockLevel(item.currentStock);
                  return (
                  <tr key={item.id} className="border-b border-border hover:bg-muted">
                    <td className="px-6 py-3 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{item.unit || "-"}</td>
                    <td className="px-6 py-3 text-right text-success tabular-nums">{item.totalIn}</td>
                    <td className="px-6 py-3 text-right text-destructive tabular-nums">{item.totalOut}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">{item.currentStock}</td>
                    <td className="px-6 py-3">
                      <Badge variant={getStockBadgeVariant(level)}>
                        {STOCK_LEVEL_LABELS[level]}
                      </Badge>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory" searchParams={params} />
      </Card>
    </div>
  );
}
