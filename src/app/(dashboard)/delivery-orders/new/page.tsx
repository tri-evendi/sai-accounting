import { canOpenPage, requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { calculateStockTotals } from "@/lib/inventory";
import { listClosedPeriods } from "@/lib/period";
import { LearnMore } from "@/components/ui/learn-more";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { getT } from "@/lib/i18n/server";
import { DeliveryOrderForm } from "./delivery-order-form";

export const dynamic = "force-dynamic";

export default async function NewDeliveryOrderPage() {
  const session = await requirePagePermission("delivery_order.write");
  /*
   * issue #103 — empty state stok mengajak ke /inventory/update, milik modul
   * `inventory`. Halaman ini milik modul lain, dan preset "Jasa" (sales tanpa
   * stok) memang mematikan `inventory` — ajakannya jadi tautan yang memantul.
   * Komponen kliennya tidak bisa memeriksa modul sendiri (tidak ada konteks
   * modul di sisi client), jadi jawabannya dihitung di server dan dioper.
   */
  const canUpdateStock = await canOpenPage(session.user, "inventory.write");
  const t = await getT();

  const [contracts, invoices, consignees, items, closedPeriods] = await Promise.all([
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      take: 300,
      select: { id: true, contractNo: true, buyer: true, consigneeId: true },
    }),
    prisma.invoice.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      take: 300,
      select: { id: true, invoiceNo: true, customer: { select: { name: true } } },
    }),
    prisma.consignee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, country: true, contact: true },
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
    <div className="w-full">
      <PageHeader
        className="mb-1"
        breadcrumbs={[
          { label: t("deliveryOrders.title"), href: "/delivery-orders" },
          { label: t("deliveryOrders.breadcrumbCreate") },
        ]}
        title={<TermTooltip term="surat_jalan">{t("deliveryOrders.createTitle")}</TermTooltip>}
        description={t("deliveryOrders.createDescription")}
      />
      <LearnMore term="surat_jalan" className="mt-1 mb-6" label={t("deliveryOrders.learnMore")} />
      <DeliveryOrderForm
        canUpdateStock={canUpdateStock}
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNo: c.contractNo,
          buyer: c.buyer,
          consigneeId: c.consigneeId,
        }))}
        invoices={invoices.map((i) => ({
          id: i.id,
          invoiceNo: i.invoiceNo,
          customerName: i.customer?.name ?? null,
        }))}
        consignees={consignees.map((c) => ({
          id: c.id,
          name: c.name,
          country: c.country,
          contact: c.contact,
        }))}
        items={items.map((it) => ({
          id: it.id,
          name: it.name,
          unit: it.unit,
          currentStock: calculateStockTotals(it.stock).currentStock,
        }))}
        closedPeriods={closedPeriods}
      />
    </div>
  );
}
