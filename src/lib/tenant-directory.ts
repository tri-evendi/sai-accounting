/**
 * Direktori TENANT (issue #135) — satu-satunya jembatan dari kode aplikasi ke
 * `tenants` + `tenant_memberships` di basis data kendali, sekeluarga dengan
 * `users-directory.ts` untuk `users`/`memberships`.
 *
 * Sengaja TANPA cache: keanggotaan tenant dibaca di jalur yang jarang
 * (membuat perusahaan, halaman pemilih, kelak penagihan) — bukan di depan
 * setiap permintaan seperti registry perusahaan. Cache yang tidak dibutuhkan
 * hanyalah satu invalidasi lagi yang bisa terlupa.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { validateTenantMembershipChange } from "@/lib/tenant-authz";
import type { TenantRole } from "@/lib/constants";

export interface TenantMembershipInfo {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  /** pending_verification | trialing | active | past_due | suspended | cancelled */
  tenantStatus: string;
  /** owner | admin | member — peran TENANT, bukan peran akuntansi. */
  role: string;
}

/**
 * Keanggotaan tenant seorang pengguna, atau `null` bila belum diadopsi.
 *
 * `null` BUKAN keadaan yang boleh ditebak-tebak: pada pemasangan yang sudah
 * melewati migrasi #134 setiap pengguna ber-tenant, jadi `null` berarti basis
 * data masih di tengah adopsi (antara migration 0002 dan 0003) — dan penjaga
 * memperlakukannya sebagai TIDAK berizin, bukan sebagai "boleh saja".
 */
export async function tenantMembershipForUser(
  userId: number
): Promise<TenantMembershipInfo | null> {
  const membership = await controlDb.tenantMembership.findFirst({
    where: { userId },
    select: {
      role: true,
      tenant: { select: { id: true, slug: true, name: true, status: true } },
    },
  });
  if (!membership) return null;

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    tenantName: membership.tenant.name,
    tenantStatus: membership.tenant.status,
    role: membership.role,
  };
}

/**
 * Ubah peran tenant seseorang, atau hapus keanggotaannya (`role: null`).
 *
 * Anti-lockout owner terakhir ditegakkan DI DALAM transaksi yang membaca
 * daftar keanggotaan — dua permintaan serentak yang masing-masing menurunkan
 * satu dari dua owner tidak boleh lolos dua-duanya. Logika keputusannya murni
 * (`validateTenantMembershipChange`, teruji di tests/tenant-authz.test.ts);
 * di sini hanya sambungan basis datanya.
 *
 * Mengembalikan pesan penolakan (Bahasa Indonesia) atau `null` bila berhasil.
 */
export async function changeTenantMembership(
  tenantId: number,
  change: { userId: number; role: TenantRole | null }
): Promise<string | null> {
  return controlDb.$transaction(async (tx) => {
    const memberships = await tx.tenantMembership.findMany({
      where: { tenantId },
      select: { userId: true, role: true },
    });

    const refusal = validateTenantMembershipChange(memberships, change);
    if (refusal) return refusal;

    if (change.role === null) {
      await tx.tenantMembership.delete({
        where: { tenantId_userId: { tenantId, userId: change.userId } },
      });
    } else {
      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: change.userId } },
        data: { role: change.role },
      });
    }
    return null;
  });
}
