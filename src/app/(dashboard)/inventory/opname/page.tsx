import { prisma } from "@/lib/prisma";
import {
  countStockHealth,
  summarizeInventory,
  toLowStockAlerts,
} from "@/lib/inventory";
import { StockAlertBanner } from "@/components/dashboard/stock-alert-banner";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import { OpnameForm } from "./opname-form";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage() {
  const allItems = await prisma.item.findMany({
    include: { stock: true },
    orderBy: { name: "asc" },
  });

  const allInventory = summarizeInventory(allItems);
  const stockHealth = countStockHealth(allInventory);
  const lowStockAlerts = toLowStockAlerts(allInventory);

  const totalCount = stockHealth.totalItems;
  const opnameItems = allInventory.map((it) => ({
    id: it.id,
    name: it.name,
    unit: it.unit,
    currentStock: it.currentStock,
  }));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            <TermTooltip term="stok_opname">Hitung Ulang Stok</TermTooltip>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
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

      {/* Formulir hitung fisik → penyesuaian (issue #57) */}
      <Card>
        <CardHeader><CardTitle>Hitung Fisik & Sesuaikan ({totalCount})</CardTitle></CardHeader>
        <CardContent>
          {opnameItems.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title="Belum ada barang di stok"
              description="Stok opname membandingkan catatan dengan hitungan fisik. Catat barang masuk pertama Anda supaya ada yang dibandingkan."
              actionLabel="Tambah / Kurangi Stok"
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
