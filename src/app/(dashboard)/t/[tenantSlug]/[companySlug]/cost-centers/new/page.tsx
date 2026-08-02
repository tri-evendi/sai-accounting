/** Pusat Biaya Baru (issue #91) — pembungkus server yang menegakkan izinnya. */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { CostCenterForm } from "../cost-center-form";

export const dynamic = "force-dynamic";

export default async function NewCostCenterPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("cost_center.manage", params);
  return <CostCenterForm />;
}
