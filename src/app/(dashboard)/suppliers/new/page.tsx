/**
 * Pemasok Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `supplier.write` lewat `requirePagePermission` sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewSupplierForm } from "./supplier-form";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  await requirePagePermission("supplier.write");
  return <NewSupplierForm />;
}
