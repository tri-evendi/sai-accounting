/**
 * Matriks izin EFEKTIF (issue #73) — sambungan DB dari `authz-overrides.ts`.
 *
 * SATU-SATUNYA modul yang membaca `role_permission_overrides`. Penjaga
 * halaman (`page-auth.ts`) dan API (`auth-guard.ts`) bertanya ke sini, bukan
 * ke matriks bawaan, sehingga override yang dibuat Pimpinan di /permissions
 * benar-benar mengubah otorisasi — bukan hanya tampilan.
 *
 * Cache ±60 dtk (EFFECTIVE_MATRIX_TTL_MS, seirama revalidasi sesi fase 3)
 * dengan invalidasi eksplisit saat route PUT menulis: di proses yang sama
 * perubahan terasa seketika; di proses/instance lain paling lama satu TTL.
 * Logika merakit + cache-nya murni dan diuji di
 * `tests/authz-overrides.test.ts`; modul ini hanya menyuntikkan Prisma.
 */

import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/authz";
import {
  canWithMatrix,
  createEffectiveMatrixLoader,
  type EffectiveMatrix,
} from "@/lib/authz-overrides";
import type { Role } from "@/lib/constants";

const loader = createEffectiveMatrixLoader(() =>
  prisma.rolePermissionOverride.findMany({
    select: { role: true, permission: true, allowed: true },
  })
);

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

/**
 * `can()` terhadap matriks EFEKTIF — deny-by-default, async karena mungkin
 * membaca DB. Inilah yang dipakai penjaga; `can()` bawaan tinggal untuk
 * tampilan/fallback dan tes.
 */
export async function canEffective(
  user: { role?: string | null } | null | undefined,
  permission: Permission
): Promise<boolean> {
  return canWithMatrix(await loader.get(), user, permission);
}
