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
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Low stock threshold: ≤ {LOW_STOCK_THRESHOLD} units
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InventoryPageActions items={toClientInventory(allInventory)} />
          <Link href="/inventory/update"><Button>Update Stock</Button></Link>
          <Link href="/inventory/opname"><Button variant="secondary">Stock Opname</Button></Link>
        </div>
      </div>

      <div className="mb-6">
        <StockAlertBanner items={lowStockAlerts} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Total Items</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stockHealth.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Healthy Stock</CardTitle></CardHeader>
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

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Overview ({totalCount})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Item</th>
                <th className="px-6 py-3 font-medium text-gray-500">Unit</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total In</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Total Out</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Current Stock</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={<PackageIcon className="h-12 w-12" />} title="No items in inventory" description="Add your first inventory item to get started." actionLabel="Update Stock" actionHref="/inventory/update" /></td></tr>
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
