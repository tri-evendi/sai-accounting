/**
 * Ubah Pusat Biaya (issue #91).
 *
 * Nilai awalnya dibaca di server dan diserahkan ke form sebagai props — tak ada
 * fetch kedua dari browser, dan halaman ini yang menegakkan izinnya.
 */
import { notFound } from "next/navigation";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { CostCenterForm } from "../../cost-center-form";

export const dynamic = "force-dynamic";

export default async function EditCostCenterPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("cost_center.manage", params);
  const { id } = await params;
  const costCenter = await prisma.costCenter.findUnique({ where: { id: parseInt(id) } });
  if (!costCenter) notFound();

  return (
    <CostCenterForm
      initial={{
        id: costCenter.id,
        code: costCenter.code,
        name: costCenter.name,
        parentId: costCenter.parentId,
        isActive: costCenter.isActive,
      }}
    />
  );
}
