import { prisma } from "@/lib/prisma";
import {
  countStockHealth,
  summarizeInventory,
  toLowStockAlerts,
  getStockLevel,
  getStockBadgeVariant,
  STOCK_LEVEL_LABELS,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatDateShort } from "@/lib/utils";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const allItems = await prisma.item.findMany({
    include: { stock: true },
    orderBy: { name: "asc" },
  });

  const allInventory = summarizeInventory(allItems);
  const stockHealth = countStockHealth(allInventory);
  const lowStockAlerts = toLowStockAlerts(allInventory);

  const totalCount = stockHealth.totalItems;
  const totalPages = Math.ceil(totalCount / perPage);
  const inventory = allInventory.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <TermTooltip term="stok_opname">Hitung Ulang Stok</TermTooltip>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Hitungan fisik dibanding catatan sistem · stok menipis ≤ {LOW_STOCK_THRESHOLD} satuan
          </p>
          <LearnMore term="stok_opname" className="mt-1" />
        </div>
        <Link href="/inventory/update">
          <Button>Tambah / Kurangi Stok</Button>
        </Link>
      </div>

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Jumlah Barang</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stockHealth.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Stok Aman</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600">{stockHealth.healthy}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Stok Menipis</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{stockHealth.lowStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Stok Habis</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{stockHealth.empty}</p></CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card>
        <CardHeader><CardTitle>Pencocokan Stok ({totalCount})</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Barang</th>
                <th className="px-6 py-3 font-medium text-gray-500">Satuan</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Masuk</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Keluar</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Sisa Stok</th>
                <th className="px-6 py-3 font-medium text-gray-500">Pergerakan Terakhir</th>
                <th className="px-6 py-3 font-medium text-gray-500">Kondisi</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Belum ada barang di stok</td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const level = getStockLevel(item.currentStock);
                  return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-3 text-gray-500">{item.unit || "-"}</td>
                    <td className="px-6 py-3 text-right text-green-600 tabular-nums">{item.totalIn}</td>
                    <td className="px-6 py-3 text-right text-red-600 tabular-nums">{item.totalOut}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">{item.currentStock}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {item.lastMovement
                        ? `${item.lastMovement.type === "in" ? "Masuk" : "Keluar"} — ${formatDateShort(item.lastMovement.date)}`
                        : "Belum ada pergerakan"}
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
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory/opname" searchParams={params} />
      </Card>
    </div>
  );
}
