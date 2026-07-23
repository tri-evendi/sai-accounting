/**
 * Hak Akses (issue #73) — matriks izin dikonfigurasi dari UI.
 *
 * Pembungkus server tipis: penjaga `authz.manage` SEBELUM komponen client
 * dirender (pola users/settings). Datanya dimuat client dari
 * `/api/authz/overrides`, yang ber-gate izin yang sama — pertahanan berlapis.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { PermissionsClient } from "./permissions-client";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  await requirePagePermission("authz.manage");
  return <PermissionsClient />;
}
