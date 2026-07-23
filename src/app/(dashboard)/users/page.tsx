/**
 * Manajemen pengguna — hanya `bos` (issue #59: penjaga sisi-server).
 *
 * Halaman ini adalah pembungkus server tipis yang menegakkan peran SEBELUM
 * komponen client dirender, konsisten dengan halaman lain (mis. approvals).
 * API `/api/users*` tetap menegakkan peran juga (pertahanan berlapis); ini
 * memastikan pengguna non-`bos` tidak sempat melihat halamannya sama sekali.
 */
import { requirePageSession } from "@/lib/page-auth";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePageSession(["bos"]);
  return <UsersClient />;
}
