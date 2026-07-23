import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/authz";
import { getEffectiveMatrix } from "@/lib/authz-effective";

/**
 * Izin EFEKTIF milik pengguna yang sedang login (issue #73) — dipakai
 * sidebar/menu client untuk menyaring tampilan menurut matriks efektif
 * (bawaan + override), bukan matriks bawaan yang tertanam di bundle.
 *
 * Self-scoped: cukup `auth()` tanpa `requireApiPermission` (pengecualian
 * terdaftar di tests/authz-coverage.test.ts) — setiap pengguna hanya melihat
 * izin PERANNYA SENDIRI, data yang toh sudah bisa ia simpulkan dari halaman
 * mana saja yang menerimanya. TAMPILAN SAJA: setiap halaman/route tetap
 * dijaga server-side oleh penjaga izinnya.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matrix = await getEffectiveMatrix();
  const role = session.user.role;
  const permissions = PERMISSIONS.filter((p) =>
    (matrix[p] as readonly string[]).includes(role)
  );

  return NextResponse.json({ role, permissions });
}
