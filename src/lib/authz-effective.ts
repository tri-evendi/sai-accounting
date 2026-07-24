/**
 * Matriks izin EFEKTIF (issue #73) + izin khusus per pengguna (issue #75) —
 * sambungan DB dari `authz-overrides.ts` dan `authz-user-overrides.ts`.
 *
 * SATU-SATUNYA modul yang membaca `role_permission_overrides` dan
 * `user_permission_overrides`. Penjaga halaman (`page-auth.ts`) dan API
 * (`auth-guard.ts`) bertanya ke sini, bukan ke matriks bawaan, sehingga
 * override yang dibuat Pimpinan di /permissions maupun "Izin Khusus" per
 * pengguna benar-benar mengubah otorisasi — bukan hanya tampilan.
 *
 * Urutan evaluasi `canEffective`: bawaan di kode → override peran → override
 * pengguna (baris pengguna menang atas keputusan perannya).
 *
 * Cache ±60 dtk (EFFECTIVE_MATRIX_TTL_MS, seirama revalidasi sesi fase 3;
 * override pengguna di-cache PER ID dengan TTL yang sama) dengan invalidasi
 * eksplisit saat route PUT menulis: di proses yang sama perubahan terasa
 * seketika; di proses/instance lain paling lama satu TTL. Logika merakit +
 * cache-nya murni dan diuji di `tests/authz-overrides.test.ts` /
 * `tests/authz-user-overrides.test.ts`; modul ini hanya menyuntikkan Prisma.
 */

import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/authz";
import {
  canWithMatrix,
  createEffectiveMatrixLoader,
  type EffectiveMatrix,
} from "@/lib/authz-overrides";
import {
  applyUserOverrides,
  canWithUserOverrides,
  createUserOverridesLoader,
  rolePermissionSet,
} from "@/lib/authz-user-overrides";
import type { Role } from "@/lib/constants";

const loader = createEffectiveMatrixLoader(() =>
  prisma.rolePermissionOverride.findMany({
    select: { role: true, permission: true, allowed: true },
  })
);

const userLoader = createUserOverridesLoader((userId) =>
  prisma.userPermissionOverride.findMany({
    where: { userId },
    select: { permission: true, allowed: true },
  })
);

/** `session.user.id` hidup sebagai string di JWT; baris override memakai Int.
 *  Id yang tak bisa diparse = tak pernah punya override (kembali ke peran). */
function parseUserId(id: unknown): number | null {
  if (typeof id === "number" && Number.isInteger(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number.parseInt(id, 10);
  return null;
}

/** Matriks efektif (bawaan + override), dari cache bila masih segar. */
export function getEffectiveMatrix(): Promise<EffectiveMatrix> {
  return loader.get();
}

/** WAJIB dipanggil setelah setiap tulis ke `role_permission_overrides`. */
export function invalidateEffectiveMatrix(): void {
  loader.invalidate();
}

/** Peran yang efektif memegang sebuah izin. */
export async function effectiveRolesFor(permission: Permission): Promise<readonly Role[]> {
  return (await loader.get())[permission];
}

/** WAJIB dipanggil setelah setiap tulis ke `user_permission_overrides`
 *  untuk pengguna itu (issue #75). Cache pengguna lain tidak tersentuh. */
export function invalidateUserOverrides(userId: number): void {
  userLoader.invalidate(userId);
}

/**
 * `can()` terhadap matriks EFEKTIF + override pengguna (issue #75) —
 * deny-by-default, async karena mungkin membaca DB. Inilah yang dipakai
 * penjaga; `can()` bawaan tinggal untuk tampilan/fallback dan tes.
 *
 * Sesi tanpa id yang bisa diparse dinilai murni dari perannya — override
 * pengguna hanya pernah ada untuk pengguna sungguhan di tabel `users`.
 */
export async function canEffective(
  user: { id?: string | number | null; role?: string | null } | null | undefined,
  permission: Permission
): Promise<boolean> {
  const matrix = await loader.get();
  const userId = parseUserId(user?.id);
  if (userId === null) return canWithMatrix(matrix, user, permission);
  const overrides = await userLoader.get(userId);
  return canWithUserOverrides(matrix, user, overrides, permission);
}

/**
 * Set izin FINAL seorang pengguna (efektif peran + override pengguna), urut
 * deklarasi `PERMISSIONS` — dipakai `/api/user/permissions` (sidebar) dan
 * `/api/users/[id]/permissions` (panel "Izin Khusus").
 */
export async function effectivePermissionsFor(user: {
  id?: string | number | null;
  role?: string | null;
}): Promise<Permission[]> {
  const matrix = await loader.get();
  const roleSet = rolePermissionSet(matrix, user.role);
  const userId = parseUserId(user.id);
  if (userId === null) return applyUserOverrides(roleSet, []);
  return applyUserOverrides(roleSet, await userLoader.get(userId));
}
