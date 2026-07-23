import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { AdvanceForm } from "./advance-form";

export const dynamic = "force-dynamic";

export default async function NewAdvancePage() {
  await requirePagePermission("advance.write");

  const [customers, suppliers, contracts] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      select: { id: true, contractNo: true, buyer: true },
      take: 200,
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[{ label: "Uang Muka", href: "/advances" }, { label: "Catat" }]}
        title="Catat Uang Muka"
        description="Untuk uang yang diterima atau dibayar sebelum fakturnya terbit."
      />
      <AdvanceForm customers={customers} suppliers={suppliers} contracts={contracts} />
    </div>
  );
}
