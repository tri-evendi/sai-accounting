import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { effectivePermissionsFor } from "@/lib/authz-effective";

/**
 * Izin EFEKTIF milik pengguna yang sedang login (issue #73; sejak issue #75
 * TERMASUK izin khusus per pengguna) — dipakai sidebar/menu client untuk
 * menyaring tampilan menurut set izin FINAL si pengguna (bawaan → override
 * peran → override pengguna), bukan matriks bawaan yang tertanam di bundle.
 *
 * Self-scoped: cukup `auth()` tanpa `requireApiPermission` (pengecualian
 * terdaftar di tests/authz-coverage.test.ts) — setiap pengguna hanya melihat
 * izin MILIKNYA SENDIRI, data yang toh sudah bisa ia simpulkan dari halaman
 * mana saja yang menerimanya. TAMPILAN SAJA: setiap halaman/route tetap
 * dijaga server-side oleh penjaga izinnya.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await effectivePermissionsFor(session.user);

  return NextResponse.json({ role: session.user.role, permissions });
}
