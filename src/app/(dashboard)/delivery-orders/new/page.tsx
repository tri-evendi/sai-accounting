import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { calculateStockTotals } from "@/lib/inventory";
import { DeliveryOrderForm } from "./delivery-order-form";

export const dynamic = "force-dynamic";

export default async function NewDeliveryOrderPage() {
  await requirePageSession(["bos", "core"]);

  const [contracts, invoices, consignees, items] = await Promise.all([
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
  ]);

  return (
    <div className="max-w-4xl">
      <Breadcrumb
        items={[{ label: "Surat Jalan", href: "/delivery-orders" }, { label: "Buat" }]}
      />
      <h1 className="text-2xl font-bold text-gray-900">Buat Surat Jalan</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Pilih consignee dan (opsional) dokumen sumber, lalu tentukan barang dan jumlah
        (bags × kg/bag). Menerbitkan surat jalan mengurangi stok dalam kilogram.
      </p>
      <DeliveryOrderForm
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
      />
    </div>
  );
}
