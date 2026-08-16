"use client";

/**
 * Tata letak grup rute `(tenant)` (issue #135) — halaman TINGKAT TENANT.
 *
 * SENGAJA bukan `(dashboard)`: kerangka dasbor menuntut PERAN DI SEBUAH PT
 * (`session.user.role`) untuk menyusun menunya, dan pengguna yang datang ke
 * halaman tenant boleh jadi belum punya satu pun perusahaan — pemilik tenant
 * yang sedang membuat PT pertamanya. Menaruh halaman ini di dasbor berarti
 * memutar layar pemuatan selamanya untuk orang yang justru paling
 * membutuhkannya.
 *
 * Kerangkanya karena itu setipis `(auth)`: SessionProvider saja; halaman di
 * dalamnya memakai `AuthShell` sendiri. Penjaganya WAJIB
 * `requireTenantPagePermission` per halaman — ditegakkan
 * `tests/authz-coverage.test.ts`, sama seperti grup dasbor.
 */

import { SessionProvider } from "next-auth/react";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
