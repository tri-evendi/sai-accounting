/**
 * Ubah Penerima Barang — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/consignees/[id]` yang menjaga. Kini form dipindah ke
 * `consignee-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { EditConsigneeForm } from "./consignee-form";

export const dynamic = "force-dynamic";

export default async function EditConsigneePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("consignee.write", params);
  return <EditConsigneeForm />;
}
