import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { AdvanceForm } from "./advance-form";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewAdvancePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("advance.write", params);
  const t = await getT();

  // Kontrak TIDAK lagi dipreload `take: 200` — daftar terpotong membuat kontrak
  // lama mustahil ditautkan (audit). Pemilihnya kini mencari ke server
  // (`/api/contracts?picker=1`) di dalam AdvanceForm.
  const [customers, suppliers] = await Promise.all([
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
      <AdvanceForm customers={customers} suppliers={suppliers} />
    </div>
  );
}
