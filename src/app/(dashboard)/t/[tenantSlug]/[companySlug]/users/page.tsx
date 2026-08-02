/**
 * Manajemen pengguna — hanya peran berakses penuh (issue #59: penjaga
 * sisi-server).
 *
 * Halaman ini adalah pembungkus server tipis yang menegakkan peran SEBELUM
 * komponen client dirender, konsisten dengan halaman lain (mis. approvals).
 * API `/api/users*` tetap menegakkan peran juga (pertahanan berlapis); ini
 * memastikan pengguna tanpa `user.manage` tidak sempat melihat halamannya
 * sama sekali.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { getActiveRoles } from "@/lib/roles";
import { tenantCan } from "@/lib/tenant-authz";
import { tenantMembershipForUser } from "@/lib/tenant-directory";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  const session = await requirePagePermission("user.manage", params);
  // Daftar peran dari DB (termasuk peran kustom) untuk pemilih peran.
  const roles = await getActiveRoles();

  /*
   * Mengundang orang = kewenangan TENANT (`tenant.member.invite`, issue #139),
   * bukan bagian `user.manage`. `tenantCan` di sini untuk TAMPILAN saja
   * (menyembunyikan form yang pasti ditolak); penegakan sebenarnya di
   * `/api/tenant/invitations` lewat `requireTenantApiPermission`.
   */
  const membership = await tenantMembershipForUser(Number.parseInt(session.user.id!, 10));
  const canInvite = tenantCan(membership, "tenant.member.invite");

  return (
    <UsersClient
      roles={roles.map((r) => ({ key: r.key, label: r.label }))}
      canInvite={canInvite}
    />
  );
}
