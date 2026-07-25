import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { ReturnForm } from "./return-form";

export const dynamic = "force-dynamic";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePagePermission("return.write");
  const t = await getT();
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
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("returns.breadcrumb"), href: "/returns" },
          { label: t("returns.breadcrumbCreate") },
        ]}
        title={t("returns.createTitle")}
        description={t("returns.createDescription")}
      />
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
