import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { calculateStockTotals } from "@/lib/inventory";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { PurchaseWizard } from "./purchase-wizard";

export const dynamic = "force-dynamic";

/**
 * Wizard "Pembelian Baru" — server shell (issue #5).
 *
 * Hanya MEMBACA daftar pemasok, barang, dan periode tertutup. Penulisan terjadi
 * sekali saja, lewat `POST /api/wizard/purchase` di langkah terakhir.
 */
export default async function NewPurchaseWizardPage() {
  await requirePagePermission("purchase.write");

  const [suppliers, items, closedPeriods] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
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
    <div className="max-w-4xl">
      <PageHeader
        className="mb-1"
        breadcrumbs={[{ label: "Pemasok", href: "/suppliers" }, { label: "Catat Pembelian" }]}
        title="Catat Pembelian"
        description={
          <>
            Dipandu langkah demi langkah: pemasok, barang, barang masuk gudang, lalu pencatatan
            utangnya. Anda bisa mundur-maju sesuka hati — <strong>tidak ada yang tersimpan</strong>{" "}
            sampai tombol &ldquo;Selesai &amp; Simpan&rdquo; di langkah terakhir ditekan.
          </>
        }
      />
      <LearnMore
        term="pembelian"
        className="mt-1 mb-6"
        label="Pelajari ini: apa itu pembelian"
      />

      <PurchaseWizard
        suppliers={suppliers}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentStock: calculateStockTotals(i.stock).currentStock,
        }))}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
