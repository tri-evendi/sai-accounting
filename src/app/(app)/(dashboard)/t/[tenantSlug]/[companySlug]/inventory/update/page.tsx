import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
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
export default async function StockUpdatePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("inventory.write", params);

  const [items, closedPeriods] = await Promise.all([
    // `isActive: true` — barang nonaktif tidak ditawarkan untuk gerakan BARU
    // (issue #104). Laporan stok tetap menampilkannya: menonaktifkan berarti
    // "jangan tawarkan lagi", bukan "anggap stoknya nol".
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        stockMovements: { select: { quantity: true, type: true, date: true } },
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
        currentStock: calculateStockTotals(it.stockMovements).currentStock,
      }))}
      closedPeriods={closedPeriods}
    />
  );
}
