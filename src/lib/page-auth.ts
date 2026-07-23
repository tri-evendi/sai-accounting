import { auth } from "@/lib/auth";
import { ACCOUNTING_PERMISSIONS, can, type Permission } from "@/lib/authz";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { redirect } from "next/navigation";

/**
 * SATU-SATUNYA penjaga halaman dashboard (audit RBAC fase 1–4; lihat
 * docs/RBAC.md). Halaman mendeklarasikan IZINNYA, matriks izin→peran hidup
 * di `lib/authz.ts`. Tanpa sesi → /login; tanpa izin → /dashboard. Izin
 * permukaan akuntansi (`ACCOUNTING_PERMISSIONS`) otomatis berlapis Mode
 * Akuntan (issue #11): bos yang mematikan modenya ikut ditolak, sama seperti
 * menunya yang ikut tersembunyi. Cakupan pemakaian dijaga
 * `tests/authz-coverage.test.ts` — halaman tanpa deklarasi = tes merah.
 * (Pendahulunya, `requirePageSession`/`requireAccountantPage` berbasis daftar
 * peran, dihapus di fase 4.)
 */
export async function requirePagePermission(permission: Permission) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!can(session.user, permission)) {
    redirect("/dashboard");
  }

  if (ACCOUNTING_PERMISSIONS.has(permission) && !effectiveAccountantMode(session.user)) {
    redirect("/dashboard");
  }

  return session;
}
