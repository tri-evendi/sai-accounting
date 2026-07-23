/**
 * Ubah Penerima Barang — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/consignees/[id]` yang menjaga. Kini form dipindah ke
 * `consignee-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { EditConsigneeForm } from "./consignee-form";

export const dynamic = "force-dynamic";

export default async function EditConsigneePage() {
  await requirePagePermission("consignee.write");
  return <EditConsigneeForm />;
}
