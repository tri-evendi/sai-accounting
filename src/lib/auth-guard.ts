import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Permission } from "@/lib/authz";
import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { moduleForPermission } from "@/lib/business-modules";

type AuthResult =
  | {
      authorized: true;
      session: {
        user: { id: string; role: string; name: string; email: string; mustChangePassword: boolean };
      };
    }
  | { authorized: false; response: NextResponse };

/**
 * SATU-SATUNYA penjaga API route (audit RBAC fase 1–4; lihat docs/RBAC.md).
 * Route mendeklarasikan IZINNYA; matriks bawaan hidup di `lib/authz.ts` dan
 * sejak issue #73 dicek terhadap matriks EFEKTIF (bawaan + override DB,
 * `lib/authz-effective.ts`). Tanpa sesi → 401; tanpa izin → 403. Sengaja
 * TANPA lapisan Mode Akuntan — mode adalah preferensi tampilan, otorisasi
 * API murni peran. Cakupan pemakaian dijaga `tests/authz-coverage.test.ts`.
 * (Pendahulunya, `requireAuth([peran])`, dihapus di fase 4.)
 */
export async function requireApiPermission(permission: Permission): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  /*
   * Gerbang MODUL (issue #99). Menyembunyikan menu saja tidak pernah dianggap
   * pengamanan — route-nya ikut tertutup, kalau tidak fitur yang "dimatikan"
   * masih bisa dipanggil langsung dan tetap membuat transaksi baru.
   *
   * Tetap 403 (bukan 404): permintaannya sah dan pemanggilnya terautentikasi,
   * hanya fiturnya yang tidak aktif. `code` membedakannya dari penolakan peran,
   * supaya klien bisa menampilkan kalimat yang benar.
   */
  if (!(await isModuleActiveFor(permission))) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Fitur ini belum aktif untuk perusahaan Anda.",
          code: "module_inactive",
          module: moduleForPermission(permission),
        },
        { status: 403 }
      ),
    };
  }

  if (!(await canEffective(session.user, permission))) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, session } as AuthResult;
}
