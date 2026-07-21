import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ReturnForm } from "./return-form";

export const dynamic = "force-dynamic";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const sp = await searchParams;
  const initialType = sp.type === "purchase" ? "purchase" : "sales";

  const [invoices, purchases, items] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      take: 300,
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        currency: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.supplierTransaction.findMany({
      where: { type: "purchase" },
      orderBy: { date: "desc" },
      take: 300,
      select: {
        id: true,
        date: true,
        currency: true,
        amount: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Retur", href: "/returns" }, { label: "Buat" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Buat Retur</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Pilih dokumen asal, lalu tentukan barang/jumlah yang dikembalikan. Nilai dan PPN
        mengikuti dokumen asal dan tidak boleh melebihi sisa yang dapat diretur.
      </p>
      <ReturnForm
        initialType={initialType}
        invoices={invoices.map((i) => ({
          id: i.id,
          invoiceNo: i.invoiceNo,
          date: i.date.toISOString(),
          currency: i.currency,
          customerName: i.customer?.name ?? null,
        }))}
        purchases={purchases.map((p) => ({
          id: p.id,
          date: p.date.toISOString(),
          currency: p.currency,
          amount: Number(p.amount),
          supplierName: p.supplier?.name ?? null,
        }))}
        items={items}
      />
    </div>
  );
}
