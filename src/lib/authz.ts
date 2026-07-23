/**
 * Kebijakan otorisasi terpusat (audit RBAC fase 1).
 *
 * SATU sumber kebenaran "peran X boleh apa": halaman, API, dan tampilan
 * semuanya bertanya lewat `can()` — bukan membandingkan string peran atau
 * mengetik ulang daftar `["bos","core"]` di tiap file. Matriksnya ditulis
 * per IZIN (`resource.action`), bukan per halaman, supaya halaman dan API
 * pasangannya tak bisa menyimpang diam-diam.
 *
 * Modul ini MURNI (tanpa React/Prisma/next) — diuji langsung di
 * `tests/authz.test.ts`. Penegakannya hidup di `page-auth.ts`
 * (`requirePagePermission`) dan `auth-guard.ts` (`requireApiPermission`).
 *
 * Kebijakan ringkasnya (audit 2026-07):
 * - bos (Pimpinan) memegang SEMUA izin.
 * - core (Staf Kantor) = pekerjaan harian: dokumen penjualan/pembelian/kas
 *   boleh baca+tulis, TANPA hapus master (hapus = bos), tanpa laporan/
 *   anggaran/administrasi, tanpa permukaan akuntansi (kecuali BACA daftar
 *   akun — form kas butuh pemilih akun lawan).
 * - ptg (Gudang) = stok saja, plus halaman bersama (persetujuan, kamus,
 *   pengaturan tampilan).
 * - Pengecualian yang disengaja: `advance.delete` juga untuk core (uang muka
 *   adalah koreksi kerja harian, bukan penghapusan master data).
 *
 * Mode Akuntan BUKAN peran: permukaan akuntansi (izin di
 * `ACCOUNTING_PERMISSIONS`) berlapis DI ATAS cek peran untuk HALAMAN
 * (lihat `requirePagePermission`); API tetap murni peran, sama seperti
 * perilaku lama.
 */

import { ROLES, type Role } from "@/lib/constants";

const ALL = [ROLES.BOS, ROLES.CORE, ROLES.PTG] as const;
const OFFICE = [ROLES.BOS, ROLES.CORE] as const;
const BOS = [ROLES.BOS] as const;

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
  "approval_rule.manage": BOS,

  // ── Penjualan ────────────────────────────────────────────────────────
  "contract.read": OFFICE,
  "contract.write": OFFICE,
  "contract.delete": BOS,
  "invoice.read": OFFICE,
  "invoice.write": OFFICE,
  "invoice.delete": BOS,
  "delivery_order.read": OFFICE,
  "delivery_order.write": OFFICE,
  "receivable.read": OFFICE,
  "return.read": OFFICE,
  "return.write": OFFICE,
  "customer.read": OFFICE,
  "customer.write": OFFICE,
  "customer.delete": BOS,
  "consignee.read": OFFICE,
  "consignee.write": OFFICE,
  "consignee.delete": BOS,
  "document.read": OFFICE,
  "document.write": OFFICE,

  // ── Pembelian ────────────────────────────────────────────────────────
  "supplier.read": OFFICE,
  "supplier.write": OFFICE,
  "supplier.delete": BOS,
  "payable.read": OFFICE,
  "advance.read": OFFICE,
  "advance.write": OFFICE,
  "advance.delete": OFFICE, // koreksi kerja harian — sengaja bukan bos-only
  "purchase.write": OFFICE, // wizard pembelian + transaksi pemasok
  "purchase.delete": BOS, // hapus transaksi pemasok = hapus master, bos-only

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
  "report.read": BOS,
  "report.export": BOS,
  "budget.manage": BOS,
  "tax.read": BOS,

  // ── Permukaan akuntansi (berlapis Mode Akuntan di halaman) ──────────
  // account.read lebih longgar dan itu disengaja: form kas milik core butuh
  // daftar akun untuk pemilih akun lawan (didokumentasikan di route-nya).
  "account.read": OFFICE,
  "account.manage": BOS,
  "journal.read": BOS,
  "journal.write": BOS,
  "ledger.read": BOS,

  // ── Administrasi ─────────────────────────────────────────────────────
  "period.manage": BOS,
  "setup.manage": BOS,
  "user.manage": BOS,
  "audit.read": BOS,
  "company_setting.manage": BOS,
  // issue #73 — mengubah matriks izin dari UI (/permissions). Anti-lockout:
  // bos tidak pernah bisa kehilangan izin ini (lihat authz-overrides.ts).
  "authz.manage": BOS,

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
