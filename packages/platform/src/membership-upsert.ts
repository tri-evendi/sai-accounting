/**
 * Tambahkan (atau aktifkan ulang) keanggotaan SATU pengguna di SATU PT, dengan
 * `companyId` yang DISEBUT — tanpa membaca konteks perusahaan permintaan.
 *
 * Dipisah dari `users-directory.ts` (monorepo Fase 3a): direktori itu mengimpor
 * `current-company` untuk fallback "PT yang sedang aktif", dan `invitation-store`
 * — yang juga dipakai konsol operator — selalu menyebut PT-nya sendiri. Lewat
 * modul ini konsol tidak ikut menarik konteks permintaan pelanggan.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";

export async function upsertMembership(userId: number, role: string, companyId: number): Promise<void> {
  await controlDb.membership.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, role },
    update: { role, isActive: true },
  });
}
