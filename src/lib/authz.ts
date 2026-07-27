/**
 * Kebijakan otorisasi terpusat (audit RBAC fase 1).
 *
 * SATU sumber kebenaran "peran X boleh apa": halaman, API, dan tampilan
 * semuanya bertanya lewat `can()` — bukan membandingkan string peran atau
 * mengetik ulang daftar `["managing_director","finance_manager"]` di tiap
 * file. Matriksnya ditulis
 * per IZIN (`resource.action`), bukan per halaman, supaya halaman dan API
 * pasangannya tak bisa menyimpang diam-diam.
 *
 * Modul ini MURNI (tanpa React/Prisma/next) — diuji langsung di
 * `tests/authz.test.ts`. Penegakannya hidup di `page-auth.ts`
 * (`requirePagePermission`) dan `auth-guard.ts` (`requireApiPermission`).
 *
 * Kebijakan ringkasnya (audit 2026-07, nama peran dibakukan migration 0032):
 * - managing_director (Direktur Utama) memegang SEMUA izin.
 * - administrator (Administrator Sistem) KEMBAR dengan Direktur Utama —
 *   muncul di setiap izin, tanpa kecuali (lihat `FULL_ACCESS_ROLES`).
 * - finance_manager (Manajer Keuangan) = pekerjaan harian: dokumen penjualan/
 *   pembelian/kas boleh baca+tulis, TANPA hapus master (hapus = akses penuh),
 *   tanpa laporan/anggaran/administrasi, tanpa permukaan akuntansi (kecuali
 *   BACA daftar akun — form kas butuh pemilih akun lawan).
 * - warehouse_head (Kepala Gudang) = stok saja, plus halaman bersama
 *   (persetujuan, kamus, pengaturan tampilan).
 * - Pengecualian yang disengaja: `advance.delete` juga untuk finance_manager
 *   (uang muka adalah koreksi kerja harian, bukan penghapusan master data).
 *
 * Mode Akuntan BUKAN peran: permukaan akuntansi (izin di
 * `ACCOUNTING_PERMISSIONS`) berlapis DI ATAS cek peran untuk HALAMAN
 * (lihat `requirePagePermission`); API tetap murni peran, sama seperti
 * perilaku lama.
 */

import { FULL_ACCESS_ROLES, ROLES, type Role } from "@/lib/constants";

/** Semua peran sistem. Urutannya mengikuti `ROLE_VALUES` supaya matriks bawaan
 *  dan matriks EFEKTIF (`applyOverrides`) menghasilkan urutan yang sama. */
const ALL = [
  ROLES.MANAGING_DIRECTOR,
  ROLES.FINANCE_MANAGER,
  ROLES.WAREHOUSE_HEAD,
  ROLES.ADMINISTRATOR,
] as const;
/** Kantor: pekerjaan harian dokumen & kas (Gudang tidak termasuk). */
const OFFICE = [ROLES.MANAGING_DIRECTOR, ROLES.FINANCE_MANAGER, ROLES.ADMINISTRATOR] as const;
/** Akses penuh saja — Direktur Utama + Administrator (lihat FULL_ACCESS_ROLES).
 *  Dulu bernama `BOS`; namanya ikut dibakukan migration 0032. */
const FULL = FULL_ACCESS_ROLES;

/**
 * Matriks izin → peran BAWAAN (baseline). Menambah fitur = menambah baris di
 * sini, lalu halaman/API-nya memanggil `requirePagePermission`/
 * `requireApiPermission` dengan izin itu. `Record` bertipe penuh: izin tanpa
 * peran ditolak `tsc`.
 *
 * Sejak issue #73 matriks ini bisa di-OVERRIDE per sel dari UI (/permissions):
 * baris `role_permission_overrides` di DB menambah/mencabut peran di atas
 * bawaan ini. Penegakan (page-auth/auth-guard) memakai matriks EFEKTIF dari
 * `authz-effective.ts`; `can()`/`rolesFor()` di modul ini tetap MURNI membaca
 * bawaan — dipakai tes, fallback tampilan, dan sebagai nilai "Reset ke bawaan".
 */
export const PERMISSION_ROLES = {
  // ── Persetujuan ──────────────────────────────────────────────────────
  // Antrean terbuka semua peran: penyetuju melihat antreannya, pemohon
  // melihat kabar pengajuannya. SIAPA boleh MEMUTUS tetap dicek lebih halus
  // di route-nya (peran harus = approverRole yang di-snapshot aturan).
  "approval.view": ALL,
  "approval.decide": ALL,
  "approval_rule.manage": FULL,

  // ── Penjualan ────────────────────────────────────────────────────────
  "contract.read": OFFICE,
  "contract.write": OFFICE,
  "contract.delete": FULL,
  "invoice.read": OFFICE,
  "invoice.write": OFFICE,
  "invoice.delete": FULL,
  "delivery_order.read": OFFICE,
  "delivery_order.write": OFFICE,
  "receivable.read": OFFICE,
  "return.read": OFFICE,
  "return.write": OFFICE,
  "customer.read": OFFICE,
  "customer.write": OFFICE,
  "customer.delete": FULL,
  "consignee.read": OFFICE,
  "consignee.write": OFFICE,
  "consignee.delete": FULL,
  "document.read": OFFICE,
  "document.write": OFFICE,

  // ── Pembelian ────────────────────────────────────────────────────────
  "supplier.read": OFFICE,
  "supplier.write": OFFICE,
  "supplier.delete": FULL,
  "payable.read": OFFICE,
  "advance.read": OFFICE,
  "advance.write": OFFICE,
  "advance.delete": OFFICE, // koreksi kerja harian — sengaja bukan akses-penuh-saja
  "purchase.write": OFFICE, // wizard pembelian + transaksi pemasok
  "purchase.delete": FULL, // hapus transaksi pemasok = hapus master, akses penuh saja

  // ── Kas & Bank ───────────────────────────────────────────────────────
  "cash.read": OFFICE,
  "cash.write": OFFICE,
  "reconciliation.read": OFFICE,
  "reconciliation.write": OFFICE,

  // ── Stok & Aset ──────────────────────────────────────────────────────
  "inventory.read": ALL,
  "inventory.write": ALL,
  "fixed_asset.read": OFFICE,
  "fixed_asset.write": OFFICE,

  // ── Laporan & anggaran ───────────────────────────────────────────────
  "report.read": FULL,
  "report.export": FULL,
  "budget.manage": FULL,
  "tax.read": FULL,

  // ── Permukaan akuntansi (berlapis Mode Akuntan di halaman) ──────────
  // account.read lebih longgar dan itu disengaja: form kas milik Manajer Keuangan butuh
  // daftar akun untuk pemilih akun lawan (didokumentasikan di route-nya).
  "account.read": OFFICE,
  "account.manage": FULL,
  "journal.read": FULL,
  "journal.write": FULL,
  "ledger.read": FULL,

  // ── Administrasi ─────────────────────────────────────────────────────
  "period.manage": FULL,
  "setup.manage": FULL,
  "user.manage": FULL,
  "audit.read": FULL,
  "company_setting.manage": FULL,
  // issue #73 — mengubah matriks izin dari UI (/permissions). Anti-lockout:
  // peran berakses penuh tidak pernah bisa kehilangan izin ini
  // (lihat PROTECTED_CELLS di authz-overrides.ts).
  "authz.manage": FULL,

  // ── Halaman bersama ──────────────────────────────────────────────────
  "glossary.read": ALL,
  "settings.view": ALL,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSION_ROLES;

export const PERMISSIONS = Object.keys(PERMISSION_ROLES) as Permission[];

/**
 * Izin permukaan akuntansi — untuk HALAMAN, `requirePagePermission` menuntut
 * Mode Akuntan efektif ON di atas cek perannya (perilaku lama
 * `requireAccountantPage`). API sengaja tidak: mode adalah preferensi
 * tampilan, otorisasi API tetap murni peran.
 */
export const ACCOUNTING_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "account.manage",
  "journal.read",
  "journal.write",
  "ledger.read",
]);

/** Peran yang memegang sebuah izin. */
export function rolesFor(permission: Permission): readonly Role[] {
  return PERMISSION_ROLES[permission];
}

/**
 * Keputusan inti: apakah pemegang peran ini punya izin itu?
 * Deny-by-default: peran kosong/tak dikenal selalu ditolak.
 */
export function can(
  user: { role?: string | null } | null | undefined,
  permission: Permission
): boolean {
  const role = user?.role;
  if (!role) return false;
  return (PERMISSION_ROLES[permission] as readonly string[]).includes(role);
}
