/**
 * Ubah Pelanggan — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/customers/[id]` yang menjaga. Kini form dipindah ke
 * `customer-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { EditCustomerForm } from "./customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage() {
  await requirePagePermission("customer.write");
  return <EditCustomerForm />;
}
