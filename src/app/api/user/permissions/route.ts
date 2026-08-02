import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { effectivePermissionsFor } from "@/lib/authz-effective";
import { enterCompanyFromRequest } from "@/lib/company-request";
import { tenantPermissionsForRole } from "@/lib/tenant-authz";
import { tenantMembershipForUser } from "@/lib/tenant-directory";
import { getRequestI18n } from "@/lib/i18n/server";

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
 *
 * Perusahaannya datang dari permintaan (issue #158) — lihat di bawah.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  /*
   * Izin per-perusahaan menuntut perusahaan — dan sejak #158 perusahaan itu
   * datang dari PERMINTAAN, bukan dari sesi. Bedanya bukan gaya: sidebar dan
   * palet perintah dirender di dalam satu tab, dan cookie sesi dibagi seluruh
   * tab. Menyaring menu dengan izin PT yang terakhir dibuka berarti menawarkan
   * pintu yang penjaga halamannya akan tolak — atau, lebih buruk, MENYEMBUNYIKAN
   * pintu yang sebetulnya terbuka di PT ini.
   *
   * Keanggotaan diverifikasi ulang di `enterCompanyFromRequest`, jadi header
   * karangan tidak membocorkan apa pun: yang bukan anggota mendapat daftar
   * kosong, sama seperti yang belum memilih perusahaan.
   *
   * Permintaan TANPA lingkup tetap sah — pemanggilnya bisa saja pemilih
   * perusahaan atau halaman tenant, dan pengguna tanpa PT tetap butuh item
   * TENANT-nya (mis. "Tambah Perusahaan").
   */
  const scoped = await enterCompanyFromRequest(session.user.id);
  const permissions = scoped.ok
    ? await effectivePermissionsFor({ id: session.user.id, role: scoped.role })
    : [];

  /*
   * Izin TENANT ikut di set yang sama (issue #135): kunci kedua matriks saling
   * lepas, jadi satu himpunan string aman — dan sidebar/palet cukup satu
   * sumber untuk kedua lingkup. TAMPILAN SAJA, seperti seluruh respons route
   * ini; penegakan tenant tetap `requireTenantPermission` di server.
   */
  const userId = Number.parseInt(String(session.user.id), 10);
  const tenantMembership = Number.isInteger(userId)
    ? await tenantMembershipForUser(userId)
    : null;
  const tenantPermissions = tenantPermissionsForRole(tenantMembership?.role);

  return NextResponse.json({
    // Peran DI PT yang diminta — bukan peran di PT yang terakhir dibuka.
    role: scoped.ok ? scoped.role : null,
    permissions: [...permissions, ...tenantPermissions],
  });
}
