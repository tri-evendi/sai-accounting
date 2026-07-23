import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals } from "@/lib/inventory";
import { listClosedPeriods } from "@/lib/period";
import { StockUpdateForm } from "./stock-form";

export const dynamic = "force-dynamic";

/**
 * Tambah / Kurangi Stok — server shell (issue #6).
 *
 * Saldo tiap barang dan daftar bulan yang sudah ditutup dibaca di server supaya
 * formulirnya bisa menolak pengeluaran melebihi stok dan tanggal di periode
 * terkunci SEBELUM dikirim. Penjaganya tetap di `/api/inventory`, yang menolak
 * hal yang sama di dalam transaksinya sendiri.
 */
export default async function StockUpdatePage() {
  await requirePagePermission("inventory.write");

  const [items, closedPeriods] = await Promise.all([
    prisma.item.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        stock: { select: { quantity: true, type: true, date: true } },
      },
    }),
    listClosedPeriods(),
  ]);

  return (
    <StockUpdateForm
      items={items.map((it) => ({
        id: it.id,
        name: it.name,
        unit: it.unit,
        currentStock: calculateStockTotals(it.stock).currentStock,
      }))}
      closedPeriods={closedPeriods}
    />
  );
}
