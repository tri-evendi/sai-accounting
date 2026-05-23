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
          <h1 className="text-2xl font-bold text-gray-900">Stock Opname</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Physical count vs system · low stock ≤ {LOW_STOCK_THRESHOLD} units
          </p>
        </div>
        <Link href="/inventory/update">
          <Button>Update Stock</Button>
        </Link>
      </div>

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Total Items</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stockHealth.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Healthy</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600">{stockHealth.healthy}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Low Stock</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{stockHealth.lowStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Out of Stock</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{stockHealth.empty}</p></CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card>
        <CardHeader><CardTitle>Stock Reconciliation ({totalCount})</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Item</th>
                <th className="px-6 py-3 font-medium text-gray-500">Unit</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total In</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Out</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Current Stock</th>
                <th className="px-6 py-3 font-medium text-gray-500">Last Movement</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No items in inventory</td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const level = getStockLevel(item.currentStock);
                  return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-3 text-gray-500">{item.unit || "-"}</td>
                    <td className="px-6 py-3 text-right text-green-600">{item.totalIn}</td>
                    <td className="px-6 py-3 text-right text-red-600">{item.totalOut}</td>
                    <td className="px-6 py-3 text-right font-semibold">{item.currentStock}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {item.lastMovement
                        ? `${item.lastMovement.type === "in" ? "In" : "Out"} — ${formatDateShort(item.lastMovement.date)}`
                        : "No movement"}
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
