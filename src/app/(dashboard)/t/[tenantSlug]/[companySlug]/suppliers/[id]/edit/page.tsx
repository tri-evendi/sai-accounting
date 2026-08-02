/**
 * Ubah Pemasok — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `supplier.write` lewat `requirePagePermission` sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { EditSupplierForm } from "./supplier-edit-form";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("supplier.write", params);
  return <EditSupplierForm />;
}
