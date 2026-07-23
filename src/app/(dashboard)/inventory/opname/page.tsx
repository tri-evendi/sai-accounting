import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-auth";
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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import { OpnameForm } from "./opname-form";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage() {
  // Sama seperti /inventory: semua peran boleh, tapi wajib login (audit RBAC fase 0).
  await requirePagePermission("inventory.write");
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
      <PageHeader
        className="mb-1"
        title={<TermTooltip term="stok_opname">Hitung Ulang Stok</TermTooltip>}
        description={
          <>Hitungan fisik dibanding catatan sistem · stok menipis ≤ {LOW_STOCK_THRESHOLD} satuan</>
        }
        actions={
          <Link href="/inventory/update">
            <Button>Tambah / Kurangi Stok</Button>
          </Link>
        }
      />
      <LearnMore term="stok_opname" className="mt-1 mb-6" />

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
