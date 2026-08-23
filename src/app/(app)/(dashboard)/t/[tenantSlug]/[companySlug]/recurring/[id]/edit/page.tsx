/**
 * Ubah templat berulang (issue #469, tahap 3).
 *
 * `kind` dan dokumen sumbernya tidak ikut bisa diubah — route PUT pun
 * menolaknya. Alasannya di kepala `recurring-form.tsx`.
 */
import { notFound } from "next/navigation";

import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { RecurringForm } from "../../recurring-form";

export const dynamic = "force-dynamic";

export default async function EditRecurringPage({
  params,
}: {
  params: Promise<{ id: string } & TenantScopedParams>;
}) {
  await requirePagePermission("invoice.write", params);
  const { id } = await params;

  const template = await prisma.recurringTemplate.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!template) notFound();

  return (
    <RecurringForm
      initial={{
        id: template.id,
        name: template.name,
        kind: template.kind as "invoice" | "journal",
        sourceId: template.sourceId,
        frequency: template.frequency as "weekly" | "monthly" | "yearly",
        startDate: template.startDate.toISOString().slice(0, 10),
        endDate: template.endDate ? template.endDate.toISOString().slice(0, 10) : null,
        maxOccurrences: template.maxOccurrences,
        isActive: template.isActive,
      }}
    />
  );
}
