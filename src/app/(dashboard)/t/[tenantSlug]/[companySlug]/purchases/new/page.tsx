import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
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
export default async function NewPurchaseWizardPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("purchase.write", params);
  const t = await getT();

  // Pemasok TIDAK lagi dipreload `take: 500` — daftar terpotong membuat pemasok
  // lama mustahil dipilih (audit). Pemilihnya mencari ke server
  // (`/api/suppliers?active=1&picker=1`); filter `active=1` issue #104 tetap
  // berlaku lewat query string endpoint-nya.
  const [items, closedPeriods] = await Promise.all([
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
