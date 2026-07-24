/**
 * Izin khusus per pengguna (issue #75) — bagian MURNI.
 *
 * Lapisan KEDUA di atas matriks efektif peran (issue #73): tabel
 * `user_permission_overrides` menyimpan penyimpangan per (pengguna × izin).
 * Urutan evaluasi sebuah izin untuk seorang pengguna:
 *
 *   bawaan di kode (`PERMISSION_ROLES`)
 *     → override peran (`role_permission_overrides`, authz-overrides.ts)
 *       → override PENGGUNA (modul ini): `allowed` true menghadiahkan,
 *         false mencabut — apa pun kata perannya.
 *
 * Modul ini yang MENERAPKAN override pengguna di atas set izin perannya dan
 * MEMVALIDASI usulan sebelum disimpan — tanpa React/Prisma/next, supaya bisa
 * diuji langsung (`tests/authz-user-overrides.test.ts`) dan dipakai ulang di
 * client (panel "Izin Khusus" halaman pengguna) untuk umpan balik validasi
 * sebelum konfirmasi. Sambungan Prisma-nya di `authz-effective.ts`, pola yang
 * sama dengan #73.
 *
 * Kebijakan:
 * - TANPA baris = pengguna mengikuti perannya sepenuhnya (perilaku hari ini).
 * - Deny-by-default dipertahankan: baris yatim (izin yang sudah dihapus dari
 *   kode) DIABAIKAN — override pengguna tidak pernah menciptakan izin baru.
 * - Anti-lockout: pengguna ber-peran bos tidak boleh dicabut `authz.manage` /
 *   `user.manage`-nya lewat override pengguna (sel terlindung yang sama
 *   dengan `PROTECTED_CELLS` #73) — tanpa keduanya tak ada lagi yang bisa
 *   memperbaiki kesalahan konfigurasi.
 * - Invarian `delete ⊆ write ⊆ read` harus tetap berlaku pada set izin FINAL
 *   pengguna (efektif peran + override pengguna): aksi lebih berbahaya tak
 *   pernah lebih longgar, juga per orang.
 */

import { PERMISSIONS, PERMISSION_ROLES, type Permission } from "@/lib/authz";
import {
  EFFECTIVE_MATRIX_TTL_MS,
  canWithMatrix,
  isProtectedCell,
  type EffectiveMatrix,
} from "@/lib/authz-overrides";

/** TTL cache override pengguna — KONSTANTA 60 dtk yang sama dengan matriks
 *  efektif #73 (`EFFECTIVE_MATRIX_TTL_MS`): total jeda terasa ≤ ±1 menit. */
export const USER_OVERRIDES_TTL_MS = EFFECTIVE_MATRIX_TTL_MS;

/** Satu baris override pengguna — bentuk yang sama dengan tabelnya (tanpa userId:
 *  semua fungsi di modul ini bekerja untuk SATU pengguna). */
export interface UserPermissionOverrideRow {
  permission: Permission;
  allowed: boolean;
}

const isKnownPermission = (p: string): p is Permission =>
  Object.prototype.hasOwnProperty.call(PERMISSION_ROLES, p);

/** Set izin yang efektif dimiliki sebuah PERAN menurut matriks efektif #73 —
 *  titik berangkat sebelum override pengguna diterapkan. */
export function rolePermissionSet(
  matrix: EffectiveMatrix,
  role: string | null | undefined
): Set<Permission> {
  const set = new Set<Permission>();
  if (!role) return set;
  for (const permission of PERMISSIONS) {
    if ((matrix[permission] as readonly string[]).includes(role)) set.add(permission);
  }
  return set;
}

/**
 * Terapkan override pengguna di atas set izin perannya → set izin FINAL,
 * urut deklarasi `PERMISSIONS` supaya deterministik. Baris yatim diabaikan.
 */
export function applyUserOverrides(
  rolePermissions: ReadonlySet<Permission>,
  overrides: ReadonlyArray<{ permission: string; allowed: boolean }>
): Permission[] {
  const set = new Set(rolePermissions);
  for (const row of overrides) {
    if (!isKnownPermission(row.permission)) continue;
    if (row.allowed) set.add(row.permission);
    else set.delete(row.permission);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

/**
 * `can()` untuk SATU pengguna: matriks efektif peran + override pengguna.
 * Override menang atas keputusan peran; tanpa baris untuk izin itu, keputusan
 * perannya yang berlaku (deny-by-default seperti aslinya).
 */
export function canWithUserOverrides(
  matrix: EffectiveMatrix,
  user: { role?: string | null } | null | undefined,
  overrides: ReadonlyArray<{ permission: string; allowed: boolean }>,
  permission: Permission
): boolean {
  // `permission` selalu kunci yang dikenal kode (bertipe `Permission`), jadi
  // baris yatim di `overrides` tidak pernah cocok di sini.
  const row = overrides.find((r) => r.permission === permission);
  if (row) return row.allowed;
  return canWithMatrix(matrix, user, permission);
}

/**
 * Validasi usulan override pengguna SEBELUM disimpan. Mengembalikan daftar
 * pesan kesalahan (Indonesia, siap tampil); kosong = sah. Dipakai server
 * (route PUT — penjaga terakhir) dan client (umpan balik sebelum konfirmasi).
 *
 * `rolePermissions` = set izin efektif PERAN si pengguna (lihat
 * `rolePermissionSet`) — invarian dicek pada set FINAL hasil usulan.
 */
export function validateUserOverrides(
  targetRole: string,
  overrides: ReadonlyArray<{ permission: string; allowed: boolean }>,
  rolePermissions: ReadonlySet<Permission>
): string[] {
  const errors: string[] = [];

  // Bentuk baris: izin harus dikenal kode, tidak boleh kembar.
  const seen = new Set<string>();
  for (const row of overrides) {
    if (!isKnownPermission(row.permission)) {
      errors.push(`Izin "${row.permission}" tidak dikenal.`);
      continue;
    }
    if (seen.has(row.permission)) {
      errors.push(`Pengaturan ganda untuk izin ${row.permission}.`);
    }
    seen.add(row.permission);

    // Anti-lockout: sel terlindung #73 berlaku juga per pengguna — pengguna
    // ber-peran bos tidak boleh kehilangan authz.manage / user.manage lewat
    // jalur ini. (isProtectedCell hanya berisi sel bos, jadi peran lain bebas.)
    if (!row.allowed && isProtectedCell(targetRole, row.permission)) {
      errors.push(
        `Pengguna ber-peran Pimpinan tidak boleh kehilangan izin "${row.permission}" — ` +
          "tanpa izin ini tidak ada lagi yang bisa mengelola hak akses atau pengguna."
      );
    }
  }
  if (errors.length > 0) return errors;

  // Invarian pada set izin FINAL pengguna: delete ⊆ write ⊆ read per resource
  // — aksi lebih berbahaya tidak pernah lebih longgar (selaras
  // tests/authz.test.ts dan validateOverrides #73).
  const final = new Set(applyUserOverrides(rolePermissions, overrides));
  const resources = new Set(PERMISSIONS.map((p) => p.split(".")[0]));
  for (const resource of resources) {
    const has = (action: string): boolean | undefined => {
      const key = `${resource}.${action}`;
      return isKnownPermission(key) ? final.has(key) : undefined;
    };
    const read = has("read");
    const write = has("write");
    const del = has("delete");
    if (write === true && read === false) {
      errors.push(
        `Pengguna ini akan boleh mengubah "${resource}" tetapi tidak boleh membacanya. ` +
          `Beri juga izin baca ("${resource}.read"), atau cabut izin ubahnya.`
      );
    }
    const wider = write ?? read;
    if (del === true && wider === false) {
      errors.push(
        `Pengguna ini akan boleh menghapus "${resource}" tetapi tidak boleh ` +
          `${write !== undefined ? "mengubah" : "membaca"}nya. Izin hapus tidak boleh lebih longgar.`
      );
    }
  }
  return errors;
}

/**
 * Buang baris yang sama dengan nilai efektif PERANNYA (bukan penyimpangan).
 * Menjaga sifat "tanpa baris = ikuti peran" tetap jujur: memilih "Selalu
 * boleh" pada izin yang perannya memang punya berarti tidak ada yang perlu
 * disimpan — indikator "izin khusus" di UI selalu berarti sungguhan.
 */
export function normalizeUserOverrides(
  rolePermissions: ReadonlySet<Permission>,
  overrides: ReadonlyArray<UserPermissionOverrideRow>
): UserPermissionOverrideRow[] {
  return overrides.filter((row) => row.allowed !== rolePermissions.has(row.permission));
}

/**
 * Pabrik loader override pengguna dengan cache PER-PENGGUNA ber-TTL (60 dtk
 * yang sama dengan matriks efektif #73 — `EFFECTIVE_MATRIX_TTL_MS`) +
 * invalidasi eksplisit per id saat menulis. Sumber datanya di-inject supaya
 * logika cache bisa diuji tanpa Prisma; `authz-effective.ts` yang
 * menyambungkan DB.
 *
 * Bila pembacaan DB gagal, loader jatuh ke DAFTAR KOSONG (tanpa cache) =
 * pengguna mengikuti matriks efektif perannya — aplikasi tetap berfungsi
 * dengan kebijakan level peran, dan kegagalannya dicatat, bukan disembunyikan.
 */
export function createUserOverridesLoader(
  fetchOverrides: (userId: number) => Promise<Array<{ permission: string; allowed: boolean }>>,
  now: () => number = Date.now,
  ttlMs: number = USER_OVERRIDES_TTL_MS
) {
  const cache = new Map<number, { rows: Array<{ permission: string; allowed: boolean }>; at: number }>();

  return {
    async get(userId: number): Promise<Array<{ permission: string; allowed: boolean }>> {
      const hit = cache.get(userId);
      if (hit && now() - hit.at < ttlMs) return hit.rows;
      try {
        const rows = await fetchOverrides(userId);
        cache.set(userId, { rows, at: now() });
        return rows;
      } catch (err) {
        console.error(
          `[authz] gagal membaca user_permission_overrides (user ${userId}) — memakai izin level peran:`,
          err
        );
        return [];
      }
    },
    /** Dipanggil setiap kali override PENGGUNA itu berubah — pembaca
     *  berikutnya untuk id itu membaca DB lagi; cache pengguna lain utuh. */
    invalidate(userId: number) {
      cache.delete(userId);
    },
  };
}
