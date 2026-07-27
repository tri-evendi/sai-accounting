import { auth } from "@/lib/auth";
import { ACCOUNTING_PERMISSIONS, type Permission } from "@/lib/authz";
import { canEffective } from "@/lib/authz-effective";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { isSetupDone } from "@/lib/setup-gate";
import { redirect } from "next/navigation";

/**
 * SATU-SATUNYA penjaga halaman dashboard (audit RBAC fase 1–4; lihat
 * docs/RBAC.md). Halaman mendeklarasikan IZINNYA; matriks izin→peran bawaan
 * hidup di `lib/authz.ts` dan sejak issue #73 dicek terhadap matriks EFEKTIF
 * (bawaan + override DB, `lib/authz-effective.ts`). Tanpa sesi → /login;
 * tanpa izin → /dashboard. Izin permukaan akuntansi
 * (`ACCOUNTING_PERMISSIONS`) otomatis berlapis Mode Akuntan (issue #11): peran
 * berakses penuh yang mematikan modenya ikut ditolak, sama seperti menunya yang ikut
 * tersembunyi. Cakupan pemakaian dijaga `tests/authz-coverage.test.ts` —
 * halaman tanpa deklarasi = tes merah. (Pendahulunya,
 * `requirePageSession`/`requireAccountantPage` berbasis daftar peran,
 * dihapus di fase 4.)
 */
export async function requirePagePermission(permission: Permission) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  /*
   * Gerbang "belum disiapkan" (lihat lib/setup-gate.ts).
   *
   * Diperiksa SEBELUM izin halaman, bukan sesudah: pada pemasangan baru, peran
   * berakses penuh membuka /dashboard dan izinnya memang lolos — kalau
   * urutannya dibalik,
   * gerbang ini tidak akan pernah berbunyi di halaman yang paling mungkin
   * dibuka pertama.
   *
   * Halaman ber-izin `setup.manage` DIKECUALIKAN, kalau tidak wizard-nya
   * sendiri akan memantul tanpa henti ke dirinya sendiri.
   *
   * Yang tidak berhak menjalankan wizard tidak dilempar ke /setup (di sana
   * mereka hanya akan ditolak izin), melainkan ke layar penjelasan.
   */
  if (permission !== "setup.manage" && !(await isSetupDone())) {
    redirect(
      (await canEffective(session.user, "setup.manage")) ? "/setup" : "/setup-required"
    );
  }

  if (!(await canEffective(session.user, permission))) {
    redirect("/dashboard");
  }

  if (ACCOUNTING_PERMISSIONS.has(permission) && !effectiveAccountantMode(session.user)) {
    redirect("/dashboard");
  }

  return session;
}
