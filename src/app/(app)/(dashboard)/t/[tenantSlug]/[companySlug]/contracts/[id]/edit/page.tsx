/**
 * Ubah Kontrak — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/contracts/[id]` yang menjaga. Kini form dipindah ke
 * `contract-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { EditContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

export default async function EditContractPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("contract.write", params);
  return <EditContractForm />;
}
