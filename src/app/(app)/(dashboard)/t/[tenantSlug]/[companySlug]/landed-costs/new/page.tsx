import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { LandedCostForm } from "./landed-cost-form";

export const dynamic = "force-dynamic";

export default async function NewLandedCostPage({ params }: { params: Promise<TenantScopedParams> }) {
  await requirePagePermission("landed_cost.write", params);
  const t = await getT();

  /* Tak ada yang dipreload. Tagihan dicari ke server (pemilih), dan penerimaan
     barangnya bergantung pada TANGGAL yang belum dipilih siapa pun saat halaman
     ini dirender — memuatnya di sini berarti memuat daftar yang pasti diminta
     ulang begitu tanggalnya disentuh. */
  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("landedCosts.breadcrumb"), href: "/landed-costs" },
          { label: t("landedCosts.createTitle") },
        ]}
        title={t("landedCosts.createTitle")}
        description={t("landedCosts.createDescription")}
      />
      <LandedCostForm />
    </div>
  );
}
