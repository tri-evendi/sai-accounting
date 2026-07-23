/**
 * Penerima Barang Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/consignees` yang menjaga. Kini form dipindah ke
 * `consignee-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewConsigneeForm } from "./consignee-form";

export const dynamic = "force-dynamic";

export default async function NewConsigneePage() {
  await requirePagePermission("consignee.write");
  return <NewConsigneeForm />;
}
