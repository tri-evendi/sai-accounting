import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
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
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Package as PackageIcon } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Stok terbuka untuk semua peran, tapi tetap wajib login — tanpa penjaga,
  // data stok server-rendered bisa terbaca tanpa autentikasi (audit RBAC fase 0).
  await requirePageSession(["bos", "core", "ptg"]);
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

  return (
    <div>
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="persediaan">Stok Barang</TermTooltip>}
        description={<>Batas stok menipis: ≤ {LOW_STOCK_THRESHOLD} satuan</>}
        actions={
          <>
            <InventoryPageActions items={toClientInventory(allInventory)} />
            <Link href="/inventory/update"><Button>Tambah / Kurangi Stok</Button></Link>
            <Link href="/inventory/opname"><Button variant="secondary">Hitung Ulang Stok</Button></Link>
          </>
        }
      />
      <LearnMore term="stok_opname" className="mt-1 mb-6" label="Pelajari ini: hitung ulang stok" />

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
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

      {/* Nilai persediaan (issue #58) — rata-rata tertimbang, sumber biaya sama dengan HPP */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-2 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Nilai Persediaan (biaya rata-rata)</p>
            {uncostedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {uncostedCount} barang belum punya biaya masuk — tidak dihitung dalam total.
              </p>
            )}
          </div>
          <Money value={totalStockValue} currency="IDR" className="text-2xl font-bold" />
        </CardContent>
      </Card>

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
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Biaya/Unit</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Nilai</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Kondisi</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={<PackageIcon className="h-12 w-12" />} title="Belum ada barang di stok" description="Catat barang masuk pertama Anda." actionLabel="Tambah / Kurangi Stok" actionHref="/inventory/update" /></td></tr>
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
                    <td className="px-6 py-3 text-right">
                      {item.unitCost !== null ? (
                        <Money value={item.unitCost} currency="IDR" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {item.stockValue !== null ? (
                        <Money value={item.stockValue} currency="IDR" className="font-semibold" />
                      ) : (
                        <span className="text-muted-foreground" title="Belum ada biaya masuk">—</span>
                      )}
                    </td>
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
