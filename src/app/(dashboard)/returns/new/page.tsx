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

  // Faktur & pembelian asal TIDAK lagi dipreload `take: 300` — daftar terpotong
  // membuat dokumen lama mustahil diretur (audit). Pemilihnya kini mencari ke
  // server (`ServerSearchableSelect` → `/api/invoices?picker=1` dan
  // `/api/returns/purchase?searchOrigin=`).
  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

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
      <ReturnForm initialType={initialType} items={items} />
    </div>
  );
}
