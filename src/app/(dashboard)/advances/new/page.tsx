import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { AdvanceForm } from "./advance-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewAdvancePage() {
  await requirePagePermission("advance.write");
  const t = await getT();

  const [customers, suppliers, contracts] = await Promise.all([
    // `isActive: true` — master nonaktif tidak ditawarkan untuk uang muka BARU
    // (issue #104); uang muka lama tetap menyebut namanya.
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contract.findMany({
      where: { status: { not: "canceled" } },
      orderBy: { date: "desc" },
      select: { id: true, contractNo: true, buyer: true },
      take: 200,
    }),
  ]);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("advances.title"), href: "/advances" },
          { label: t("advances.breadcrumbRecord") },
        ]}
        title={t("advances.record")}
        description={t("advances.newDescription")}
      />
      <AdvanceForm customers={customers} suppliers={suppliers} contracts={contracts} />
    </div>
  );
}
