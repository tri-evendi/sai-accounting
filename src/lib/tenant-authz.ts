/**
 * Matriks izin TINGKAT TENANT (issue #135, epik #133) — lingkup KEDUA di
 * samping matriks per-perusahaan `lib/authz.ts`, dan keduanya sengaja tidak
 * pernah bercampur.
 *
 * ══ KENAPA DUA LINGKUP ══════════════════════════════════════════════════════
 * Izin per-perusahaan adalah milik KEANGGOTAAN di satu PT; ia menuntut konteks
 * perusahaan aktif. Tetapi "boleh membuat perusahaan?" harus terjawab justru
 * ketika pelanggan BELUM punya satu pun PT — memaksakannya lewat penjaga
 * perusahaan melahirkan ayam-dan-telur yang membuat pendaftaran mandiri
 * mustahil (docs/MULTI-TENANT.md §4.2). Karena itu izin di bawah dijawab oleh
 * `TenantMembership` lewat `requireTenantPermission` (lib/tenant-guard.ts),
 * yang bekerja TANPA perusahaan aktif.
 *
 * > Aturan: izin tingkat tenant TIDAK BOLEH diperiksa penjaga perusahaan —
 * > dan sebaliknya. Kedua himpunan kuncinya dibuat saling lepas, jadi `tsc`
 * > menolak pencampuran, bukan hanya konvensi.
 *
 * Modul ini MURNI (tanpa React/Prisma/next) — diuji di
 * `tests/tenant-authz.test.ts`. Sambungan basis datanya di
 * `lib/tenant-directory.ts`, penegakannya di `lib/tenant-guard.ts`.
 *
 * Berbeda dengan matriks perusahaan, matriks ini TIDAK bisa di-override dari
 * /permissions: peran tenant hanya tiga dan maknanya kontraktual (owner
 * memegang penagihan). Kalau kebutuhannya lahir, ia lahir bersama halaman
 * pengelolaan tenant — bukan diam-diam di sini.
 */

import { TENANT_ROLES, TENANT_ROLE_VALUES, type TenantRole } from "@/lib/constants";

/** Owner + admin — pengelolaan sehari-hari tenant, TANPA penagihan. */
const MANAGERS = [TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN] as const;
/** Owner saja — penagihan & keputusan yang mengikat kontrak. */
const OWNER_ONLY = [TENANT_ROLES.OWNER] as const;

/**
 * Matriks izin tenant → peran. `company.create` PINDAH ke sini dari matriks
 * perusahaan (issue #135) — itulah satu perubahan yang memecah ayam-dan-telur.
 *
 * `member` sengaja tidak muncul di satu baris pun: aksesnya murni dari
 * keanggotaan per-PT. Baris `tenant.member.view` satu-satunya pengecualian —
 * melihat siapa saja yang satu tenant dengannya bukan kewenangan, tapi belum
 * ada halamannya; ditinggal di luar sampai #139 membutuhkannya.
 */
export const TENANT_PERMISSION_ROLES = {
  /*
   * Membuat PERUSAHAAN BARU beserta basis datanya. Dulu di matriks
   * per-perusahaan (akses-penuh-saja); kini milik tenant supaya pemilik tenant
   * TANPA satu pun perusahaan tetap bisa membuat yang pertama.
   */
  "company.create": MANAGERS,
  /** Mengubah profil tenant (nama, dsb.) — bukan profil PT. */
  "tenant.settings": OWNER_ONLY,
  /** Paket, tagihan platform, cara bayar. Owner saja — ini kontraktual. */
  "tenant.billing": OWNER_ONLY,
  /** Mengundang orang ke tenant (dipakai #139). */
  "tenant.member.invite": MANAGERS,
} as const satisfies Record<string, readonly TenantRole[]>;

export type TenantPermission = keyof typeof TENANT_PERMISSION_ROLES;

export const TENANT_PERMISSIONS = Object.keys(TENANT_PERMISSION_ROLES) as TenantPermission[];

/** Apakah string ini kunci izin TENANT (bukan izin perusahaan)? */
export function isTenantPermission(value: string): value is TenantPermission {
  return Object.prototype.hasOwnProperty.call(TENANT_PERMISSION_ROLES, value);
}

/**
 * Keputusan inti: apakah pemegang peran tenant ini punya izin itu?
 * Deny-by-default: peran kosong/tak dikenal selalu ditolak — sama persis
 * dengan `can()` di matriks perusahaan.
 */
export function tenantCan(
  membership: { role?: string | null } | null | undefined,
  permission: TenantPermission
): boolean {
  const role = membership?.role;
  if (!role) return false;
  return (TENANT_PERMISSION_ROLES[permission] as readonly string[]).includes(role);
}

/** Seluruh izin tenant yang dipegang sebuah peran, urut deklarasi. */
export function tenantPermissionsForRole(role: string | null | undefined): TenantPermission[] {
  if (!role) return [];
  return TENANT_PERMISSIONS.filter((permission) =>
    (TENANT_PERMISSION_ROLES[permission] as readonly string[]).includes(role)
  );
}

/**
 * ── Anti-lockout owner terakhir (logika MURNI) ─────────────────────────────
 *
 * Tenant tanpa owner adalah tenant yang tidak bisa dikelola siapa pun —
 * penagihan tidak bisa disentuh, orang tidak bisa diundang, dan tidak ada
 * satu pun jalan pulang dari dalam aplikasi. Karena itu owner TERAKHIR tidak
 * pernah bisa dihapus maupun diturunkan perannya; polanya sama dengan
 * `PROTECTED_CELLS` di matriks perusahaan (issue #73).
 *
 * Fungsi menerima daftar keanggotaan tenant APA ADANYA dan mengembalikan
 * alasan penolakan (Bahasa Indonesia, siap ditampilkan) atau `null` bila sah.
 * Penulisan ke basis data ada di `tenant-directory.ts`; ia WAJIB memanggil ini
 * di dalam transaksi yang sama dengan pembacaannya.
 */
export function validateTenantMembershipChange(
  memberships: readonly { userId: number; role: string }[],
  change: { userId: number; role: TenantRole | null } // null = keanggotaan dihapus
): string | null {
  const current = memberships.find((m) => m.userId === change.userId);
  if (!current) return "Orang ini bukan anggota tenant.";

  if (change.role !== null && !(TENANT_ROLE_VALUES as readonly string[]).includes(change.role)) {
    return "Peran tenant tidak dikenal.";
  }

  const losesOwner =
    current.role === TENANT_ROLES.OWNER && change.role !== TENANT_ROLES.OWNER;
  if (!losesOwner) return null;

  const otherOwners = memberships.filter(
    (m) => m.role === TENANT_ROLES.OWNER && m.userId !== change.userId
  );
  if (otherOwners.length === 0) {
    return (
      "Owner terakhir tidak bisa dihapus atau diturunkan perannya — tenant tanpa " +
      "owner tidak bisa dikelola siapa pun. Angkat owner lain lebih dulu."
    );
  }
  return null;
}
