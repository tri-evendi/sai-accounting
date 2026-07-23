/**
 * Ubah Akun — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `account.manage` lewat `requirePagePermission` (otomatis berlapis
 * Mode Akuntan) sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { EditAccountForm } from "./account-edit-form";

export const dynamic = "force-dynamic";

export default async function EditAccountPage() {
  await requirePagePermission("account.manage");
  return <EditAccountForm />;
}
