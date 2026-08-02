/**
 * Impor Daftar Akun — pembungkus server, dijaga izin `account.manage`
 * (sama dengan membuat akun manual). Form-nya client component di bawah.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { ImportAccountsForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportAccountsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("account.manage", params);
  return <ImportAccountsForm />;
}
