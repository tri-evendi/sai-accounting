/**
 * Manajemen pengguna — hanya `bos` (issue #59: penjaga sisi-server).
 *
 * Halaman ini adalah pembungkus server tipis yang menegakkan peran SEBELUM
 * komponen client dirender, konsisten dengan halaman lain (mis. approvals).
 * API `/api/users*` tetap menegakkan peran juga (pertahanan berlapis); ini
 * memastikan pengguna non-`bos` tidak sempat melihat halamannya sama sekali.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { getActiveRoles } from "@/lib/roles";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePagePermission("user.manage");
  // Daftar peran dari DB (termasuk peran kustom) untuk pemilih peran.
  const roles = await getActiveRoles();
  return <UsersClient roles={roles.map((r) => ({ key: r.key, label: r.label }))} />;
}
