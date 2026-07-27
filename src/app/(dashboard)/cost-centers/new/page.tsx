/** Pusat Biaya Baru (issue #91) — pembungkus server yang menegakkan izinnya. */
import { requirePagePermission } from "@/lib/page-auth";
import { CostCenterForm } from "../cost-center-form";

export const dynamic = "force-dynamic";

export default async function NewCostCenterPage() {
  await requirePagePermission("cost_center.manage");
  return <CostCenterForm />;
}
