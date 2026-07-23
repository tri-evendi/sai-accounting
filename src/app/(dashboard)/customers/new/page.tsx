/**
 * Pelanggan Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/customers` yang menjaga. Kini form dipindah ke
 * `customer-form.tsx` (struktur form tidak diubah) dan halaman menegakkan
 * izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewCustomerForm } from "./customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requirePagePermission("customer.write");
  return <NewCustomerForm />;
}
