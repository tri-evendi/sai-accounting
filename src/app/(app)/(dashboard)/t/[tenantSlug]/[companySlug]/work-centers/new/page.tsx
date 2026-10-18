import type { TenantScopedParams } from "@sai/core/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { NewWorkCenterForm } from "./work-center-form";

export const dynamic = "force-dynamic";

/** Stasiun Kerja Baru — cangkang server; seluruh interaksinya milik formulir. */
export default async function NewWorkCenterPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("work_center.manage", params);
  const t = await getT();
  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("workCenters.breadcrumb"), href: "/work-centers" },
          { label: t("workCenters.createTitle") },
        ]}
        title={t("workCenters.createTitle")}
      />
      <NewWorkCenterForm />
    </div>
  );
}
