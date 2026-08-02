/**
 * Penjaga izin TINGKAT TENANT (issue #135) — pasangan `auth-guard.ts` /
 * `page-auth.ts` untuk lingkup tenant, dan SATU perbedaan yang menjadi seluruh
 * alasannya ada:
 *
 * ══ BEKERJA TANPA PERUSAHAAN AKTIF ══════════════════════════════════════════
 * Penjaga perusahaan menanam konteks perusahaan sebelum memutuskan apa pun,
 * dan ketiadaan konteks itu ADALAH KEADAAN YANG SAH di lingkup tenant:
 * pelanggan yang baru mendaftar belum punya satu pun PT, dan justru sedang
 * menuju halaman yang membuatnya. Karena itu penjaga ini TIDAK menyentuh
 * `enterCompanyFromRequest`, TIDAK membaca `session.user.role` (peran per-PT),
 * dan TIDAK pernah menyebabkan query ke basis data perusahaan.
 *
 * Sumber keputusannya `TenantMembership` di basis data kendali — dibaca SAAT
 * diminta, bukan dari JWT: keanggotaan tenant berubah jarang dan penjaga ini
 * berdiri di jalur yang jarang pula (membuat perusahaan, kelak penagihan),
 * jadi satu query kendali per permintaan adalah harga yang benar untuk
 * keputusan yang tidak pernah basi.
 *
 * Cakupan pemakaian dijaga `tests/authz-coverage.test.ts`: halaman di grup
 * `(tenant)` wajib memanggil `requireTenantPagePermission`, dan route API yang
 * terdaftar bertingkat tenant wajib `requireTenantApiPermission`.
 */

import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { tenantCan, type TenantPermission } from "@/lib/tenant-authz";
import { tenantMembershipForUser, type TenantMembershipInfo } from "@/lib/tenant-directory";

export interface TenantSessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export type TenantAuthResult =
  | {
      authorized: true;
      session: { user: TenantSessionUser };
      /** Keanggotaan tenant pemanggil — sumber `tenantId` untuk penulisan. */
      tenant: TenantMembershipInfo;
    }
  | { authorized: false; response: NextResponse };

function parseUserId(id: unknown): number | null {
  if (typeof id === "string" && /^\d+$/.test(id)) return Number.parseInt(id, 10);
  if (typeof id === "number" && Number.isInteger(id)) return id;
  return null;
}

/**
 * Penjaga API bertingkat tenant. Tanpa sesi → 401; tanpa keanggotaan tenant
 * atau tanpa izin → 403.
 *
 * Pengguna TANPA keanggotaan tenant (basis data di tengah adopsi #134) ditolak
 * dengan `code: "tenant_required"` — deny-by-default, bukan cabang "tanpa
 * tenant" yang diam-diam mengizinkan; keadaan itu selesai begitu adopsi
 * dijalankan, dan pesannya menyebut itu.
 */
export async function requireTenantApiPermission(
  permission: TenantPermission
): Promise<TenantAuthResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const userId = parseUserId(session.user.id);
  const membership = userId === null ? null : await tenantMembershipForUser(userId);
  if (!membership) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error:
            "Akun Anda belum tergabung ke tenant mana pun. Jalankan adopsi tenant " +
            "(scripts/adopt-tenant.ts) atau hubungi pengelola sistem.",
          code: "tenant_required",
        },
        { status: 403 }
      ),
    };
  }

  if (!tenantCan(membership, permission)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    session: { user: session.user as TenantSessionUser },
    tenant: membership,
  };
}

/** Sesi + keanggotaan tenant yang sudah melewati penjaga halaman. */
export interface TenantPageSession {
  user: TenantSessionUser & { companyId?: number | null };
  tenant: TenantMembershipInfo;
}

/**
 * Penjaga HALAMAN bertingkat tenant. Tanpa sesi → /login; tanpa izin →
 * beranda bila ada perusahaan aktif, selainnya /select-company — dua tujuan
 * karena dua keadaan: pengguna ber-PT punya beranda untuk dipulangkan,
 * pengguna tanpa PT hanya punya layar pemilih (yang juga menjelaskan keadaan
 * "belum ada perusahaan").
 */
export async function requireTenantPagePermission(
  permission: TenantPermission
): Promise<TenantPageSession> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as TenantSessionUser & { companyId?: number | null };
  const fallback = user.companyId != null ? "/dashboard" : "/select-company";

  const userId = parseUserId(user.id);
  const membership = userId === null ? null : await tenantMembershipForUser(userId);
  if (!membership || !tenantCan(membership, permission)) redirect(fallback);

  return { user, tenant: membership };
}
