import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AdvanceForm } from "./advance-form";

export const dynamic = "force-dynamic";

export default async function NewAdvancePage() {
  await requirePageSession(["bos", "core"]);

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
      <Breadcrumb items={[{ label: "Uang Muka", href: "/advances" }, { label: "Catat" }]} />
      <h1 className="text-2xl font-bold text-gray-900">Catat Uang Muka</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Untuk uang yang diterima atau dibayar sebelum fakturnya terbit.
      </p>
      <AdvanceForm customers={customers} suppliers={suppliers} contracts={contracts} />
    </div>
  );
}
