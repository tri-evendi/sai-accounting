import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { NewProductionOrderForm } from "./production-order-form";

export const dynamic = "force-dynamic";

/** Perintah Produksi Baru — cangkang server; resep AKTIF saja yang ditawarkan. */
export default async function NewProductionOrderPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("production_order.write", params);
  const t = await getT();

  const boms = await prisma.billOfMaterial.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      outputQuantity: true,
      outputItem: { select: { name: true, unit: true } },
    },
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("productionOrders.breadcrumb"), href: "/production-orders" },
          { label: t("productionOrders.createTitle") },
        ]}
        title={t("productionOrders.createTitle")}
      />
      <NewProductionOrderForm
        boms={boms.map((b) => ({
          id: b.id,
          code: b.code,
          label: `${b.code} — ${b.outputItem.name} (${Number(b.outputQuantity)} ${b.outputItem.unit || "kg"})`,
        }))}
      />
    </div>
  );
}
