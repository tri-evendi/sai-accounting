import { requirePagePermission } from "@/lib/page-auth";
import { listPeriods } from "@/lib/period-close";
import { PeriodManager } from "./period-manager";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  await requirePagePermission("period.manage");
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
