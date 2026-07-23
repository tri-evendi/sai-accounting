import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/authz";

type AuthResult =
  | { authorized: true; session: { user: { id: string; role: string; name: string; email: string; status: number } } }
  | { authorized: false; response: NextResponse };

/**
 * SATU-SATUNYA penjaga API route (audit RBAC fase 1–4; lihat docs/RBAC.md).
 * Route mendeklarasikan IZINNYA, matriks izin→peran hidup di `lib/authz.ts`.
 * Tanpa sesi → 401; tanpa izin → 403. Sengaja TANPA lapisan Mode Akuntan —
 * mode adalah preferensi tampilan, otorisasi API murni peran. Cakupan
 * pemakaian dijaga `tests/authz-coverage.test.ts`. (Pendahulunya,
 * `requireAuth([peran])`, dihapus di fase 4.)
 */
export async function requireApiPermission(permission: Permission): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!can(session.user, permission)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, session } as AuthResult;
}
