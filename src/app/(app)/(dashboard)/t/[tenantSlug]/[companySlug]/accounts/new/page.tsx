/**
 * Akun Baru — pembungkus server (audit RBAC fase 2).
 *
 * Sebelumnya halaman ini client component TANPA penjaga server; kini dijaga
 * izin `account.manage` lewat `requirePagePermission` (otomatis berlapis
 * Mode Akuntan) sebelum form dirender.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { NewAccountForm } from "./account-form";

export const dynamic = "force-dynamic";

export default async function NewAccountPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("account.manage", params);
  return <NewAccountForm />;
}
