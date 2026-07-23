/**
 * Akun Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `account.manage` lewat `requirePagePermission` (otomatis berlapis
 * Mode Akuntan) sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { NewAccountForm } from "./account-form";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  await requirePagePermission("account.manage");
  return <NewAccountForm />;
}
