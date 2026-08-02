/**
 * Ubah Tagihan — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `invoice.write` lewat `requirePagePermission` sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { EditInvoiceForm } from "./invoice-edit-form";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("invoice.write", params);
  return <EditInvoiceForm />;
}
