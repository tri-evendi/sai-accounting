/**
 * Matriks izin EFEKTIF (issue #73) + izin khusus per pengguna (issue #75) +
 * modul per kategori usaha (issue #99) — sambungan DB dari `authz-overrides.ts`,
 * `authz-user-overrides.ts`, dan `business-modules.ts`.
 *
 * SATU-SATUNYA modul yang membaca `role_permission_overrides`,
 * `user_permission_overrides`, dan `company_settings.enabled_modules`. Penjaga
 * halaman (`page-auth.ts`) dan API (`auth-guard.ts`) bertanya ke sini, bukan ke
 * matriks bawaan, sehingga override yang dibuat Direktur Utama di /permissions,
 * "Izin Khusus" per pengguna, maupun modul yang dimatikan benar-benar mengubah
 * otorisasi — bukan hanya tampilan.
 *
 * Urutan evaluasi `canEffective`: **modul** → bawaan di kode → override peran →
 * override pengguna (baris pengguna menang atas keputusan perannya).
 *
 * Modul diperiksa PALING DULU dan berdiri sendiri: izin yang sumber dayanya ada
 * di modul non-aktif ditolak untuk semua orang, termasuk peran berakses penuh,
 * TANPA menyentuh satu baris override pun. Karena itu menyalakan modulnya
 * kembali tidak pernah menghadiahkan izin kepada siapa pun — peran tetap yang
 * menentukan. Anti-lockout tetap utuh: `authz.manage` & `user.manage` hidup di
 * modul inti yang tak bisa dimatikan (lihat `business-modules.ts`).
 *
 * Cache ±60 dtk (EFFECTIVE_MATRIX_TTL_MS, seirama revalidasi sesi fase 3;
 * override pengguna di-cache PER ID, himpunan modul di-cache dengan TTL yang
 * sama) dengan invalidasi eksplisit saat route PUT menulis: di proses yang sama
 * perubahan terasa seketika; di proses/instance lain paling lama satu TTL.
 * Logika merakit + cache-nya murni dan diuji di `tests/authz-overrides.test.ts`,
 * `tests/authz-user-overrides.test.ts`, dan `tests/business-modules.test.ts`;
 * modul ini hanya menyuntikkan Prisma.
 */

import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/authz";
import {
  canWithMatrix,
  createEffectiveMatrixLoader,
  type EffectiveMatrix,
} from "@/lib/authz-overrides";
import {
  createEnabledModulesLoader,
  filterPermissionsByModules,
  isPermissionEnabled,
  type BusinessModule,
} from "@/lib/business-modules";
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

/**
 * Himpunan modul aktif (issue #99) — satu kolom pada baris singleton
 * `company_settings`. NULL/kosong = semua modul aktif, jadi pemasangan yang
 * belum pernah memilih berperilaku persis seperti sebelum fitur ini ada.
 */
const modulesLoader = createEnabledModulesLoader(async () => {
  const settings = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { enabledModules: true },
  });
  return settings?.enabledModules ?? null;
});

/** Modul yang aktif untuk perusahaan ini, dari cache bila masih segar. */
export function getEnabledModules(): Promise<ReadonlySet<BusinessModule>> {
  return modulesLoader.get();
}

/** WAJIB dipanggil setelah setiap tulis ke `company_settings.enabled_modules`. */
export function invalidateEnabledModules(): void {
  modulesLoader.invalidate();
}

/**
 * Modul izin ini aktif? Dipakai penjaga untuk memilih KALIMAT, bukan untuk
 * memutuskan boleh/tidak — keputusannya tetap milik `canEffective`. "Fitur ini
 * belum aktif untuk perusahaan Anda" dan "Anda tidak punya akses" adalah dua
 * keadaan berbeda, dan menyamakan keduanya membuat pengguna mencari orang yang
 * salah untuk memperbaikinya.
 */
export async function isModuleActiveFor(permission: Permission): Promise<boolean> {
  return isPermissionEnabled(permission, await modulesLoader.get());
}

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
  // issue #99 — lapisan MODUL, diperiksa lebih dulu dan berdiri sendiri.
  // Fitur yang tidak dipakai perusahaan ini tidak terjangkau siapa pun, sekalipun
  // perannya berakses penuh. Ini satu-satunya perubahan yang merambat ke ~50
  // halaman, seluruh menu, dan semua route API — persis seperti #73 dulu.
  if (!isPermissionEnabled(permission, await modulesLoader.get())) return false;

  const matrix = await loader.get();
  const userId = parseUserId(user?.id);
  if (userId === null) return canWithMatrix(matrix, user, permission);
  const overrides = await userLoader.get(userId);
  return canWithUserOverrides(matrix, user, overrides, permission);
}

/**
 * Set izin FINAL seorang pengguna (modul aktif + efektif peran + override
 * pengguna), urut deklarasi `PERMISSIONS` — dipakai `/api/user/permissions`
 * (sidebar) dan beranda.
 *
 * Izin di modul non-aktif dibuang di sini juga, bukan hanya di `canEffective`:
 * inilah yang membuat menu, Aksi Cepat, dan tombol ikut hilang tanpa satu pun
 * halaman perlu diubah. Yang dibuang cuma TAMPILAN — baris override di DB tidak
 * disentuh, jadi menyalakan modulnya kembali memunculkan persis izin yang dulu.
 */
export async function effectivePermissionsFor(user: {
  id?: string | number | null;
  role?: string | null;
}): Promise<Permission[]> {
  const matrix = await loader.get();
  const roleSet = rolePermissionSet(matrix, user.role);
  const userId = parseUserId(user.id);
  const permissions =
    userId === null
      ? applyUserOverrides(roleSet, [])
      : applyUserOverrides(roleSet, await userLoader.get(userId));
  return filterPermissionsByModules(permissions, await modulesLoader.get());
}
