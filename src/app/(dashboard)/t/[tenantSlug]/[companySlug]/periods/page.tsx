import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { listPeriods } from "@/lib/period-close";
import { PeriodManager } from "./period-manager";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PeriodsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("period.manage", params);
  const t = await getT();

  const periods = await listPeriods();

  return (
    <div>
      <PageHeader
        title={t("periods.title")}
        description={<span className="block max-w-3xl">{t("periods.description")}</span>}
      />

      <PeriodManager periods={periods} />
    </div>
  );
}
