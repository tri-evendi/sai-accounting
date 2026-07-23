/**
 * Ubah Kontrak — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga sisi-server; hanya
 * API `/api/contracts/[id]` yang menjaga. Kini form dipindah ke
 * `contract-form.tsx` dan halaman menegakkan izin sebelum merender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { EditContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

export default async function EditContractPage() {
  await requirePagePermission("contract.write");
  return <EditContractForm />;
}
