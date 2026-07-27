import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { listClosedPeriods } from "@/lib/period";
import { calculateStockTotals } from "@/lib/inventory";
import { PageHeader } from "@/components/ui/page-header";
import { LearnMore } from "@/components/ui/learn-more";
import { getT } from "@/lib/i18n/server";
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
  const t = await getT();

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
        stockMovements: { select: { quantity: true, type: true, date: true } },
      },
    }),
    listClosedPeriods(),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        className="mb-1"
        breadcrumbs={[
          { label: t("suppliers.breadcrumb"), href: "/suppliers" },
          { label: t("purchases.title") },
        ]}
        title={t("purchases.title")}
        description={
          <>
            {t("purchases.descriptionA")} <strong>{t("purchases.descriptionStrong")}</strong>{" "}
            {t("purchases.descriptionB")}
          </>
        }
      />
      <LearnMore term="pembelian" className="mt-1 mb-6" label={t("purchases.learnMore")} />

      <PurchaseWizard
        suppliers={suppliers}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentStock: calculateStockTotals(i.stockMovements).currentStock,
        }))}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
