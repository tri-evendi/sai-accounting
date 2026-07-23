/**
 * RBAC dapat dikonfigurasi (issue #73) — bagian MURNI.
 *
 * Matriks izin bawaan tetap hidup di kode (`PERMISSION_ROLES`, authz.ts).
 * Tabel `role_permission_overrides` menyimpan penyimpangan per sel
 * (peran × izin): `allowed` true menghadiahkan izin, false mencabutnya.
 * Modul ini yang MERAKIT matriks efektif dan MEMVALIDASI usulan override —
 * tanpa React/Prisma/next, supaya bisa diuji langsung
 * (`tests/authz-overrides.test.ts`) dan dipakai ulang di client untuk
 * umpan balik validasi sebelum menyimpan.
 *
 * Kebijakan:
 * - Tabel kosong = matriks efektif persis bawaan (perilaku hari ini).
 * - Deny-by-default dipertahankan: baris yatim (izin/peran yang tak dikenal
 *   kode) DIABAIKAN saat merakit — override tidak pernah bisa menciptakan
 *   izin atau peran baru.
 * - Anti-lockout: bos tidak pernah bisa kehilangan `authz.manage` (pintu
 *   halaman ini sendiri) dan `user.manage` — tanpa keduanya tak ada lagi
 *   yang bisa memperbaiki kesalahan konfigurasi.
 * - Invarian `delete ⊆ write ⊆ read` (tests/authz.test.ts) harus tetap
 *   berlaku pada matriks EFEKTIF: aksi lebih berbahaya tak pernah lebih
 *   longgar, juga setelah dikonfigurasi.
 */

import { PERMISSIONS, PERMISSION_ROLES, type Permission } from "@/lib/authz";
import { ROLE_LABELS, ROLE_VALUES, type Role } from "@/lib/constants";

/** Satu baris override — bentuk yang sama dengan tabelnya. */
export interface PermissionOverride {
  role: Role;
  permission: Permission;
  allowed: boolean;
}

/** Matriks efektif: bentuknya sama dengan `PERMISSION_ROLES`. */
export type EffectiveMatrix = Record<Permission, readonly Role[]>;

/**
 * Sel yang dikunci anti-lockout: mencabutnya = tidak ada lagi yang bisa
 * membuka /permissions atau /users untuk memperbaiki keadaan.
 */
export const PROTECTED_CELLS: ReadonlyArray<{ role: Role; permission: Permission }> = [
  { role: "bos", permission: "authz.manage" },
  { role: "bos", permission: "user.manage" },
];

export function isProtectedCell(role: string, permission: string): boolean {
  return PROTECTED_CELLS.some((c) => c.role === role && c.permission === permission);
}

const isKnownPermission = (p: string): p is Permission =>
  Object.prototype.hasOwnProperty.call(PERMISSION_ROLES, p);

const isKnownRole = (r: string): r is Role => (ROLE_VALUES as readonly string[]).includes(r);

/**
 * Rakit matriks efektif = bawaan + override. Baris dengan izin/peran yang
 * tidak dikenal kode diabaikan (deny-by-default; sisa data setelah sebuah
 * izin dihapus dari kode tidak boleh menghidupkannya kembali). Urutan peran
 * mengikuti `ROLE_VALUES` supaya hasilnya deterministik.
 */
export function applyOverrides(
  overrides: ReadonlyArray<{ role: string; permission: string; allowed: boolean }>
): EffectiveMatrix {
  const granted = new Map<Permission, Set<Role>>();
  for (const permission of PERMISSIONS) {
    granted.set(permission, new Set(PERMISSION_ROLES[permission]));
  }
  for (const row of overrides) {
    if (!isKnownPermission(row.permission) || !isKnownRole(row.role)) continue;
    const set = granted.get(row.permission)!;
    if (row.allowed) set.add(row.role);
    else set.delete(row.role);
  }
  const matrix = {} as Record<Permission, readonly Role[]>;
  for (const permission of PERMISSIONS) {
    const set = granted.get(permission)!;
    matrix[permission] = ROLE_VALUES.filter((role) => set.has(role));
  }
  return matrix;
}

/** `can()` versi matriks-yang-diberikan — deny-by-default seperti aslinya. */
export function canWithMatrix(
  matrix: EffectiveMatrix,
  user: { role?: string | null } | null | undefined,
  permission: Permission
): boolean {
  const role = user?.role;
  if (!role) return false;
  return (matrix[permission] as readonly string[]).includes(role);
}

/**
 * Validasi usulan override SEBELUM disimpan. Mengembalikan daftar pesan
 * kesalahan (Indonesia, siap tampil); kosong = sah. Dipakai server (route
 * PUT — penjaga terakhir) dan client (umpan balik sebelum konfirmasi).
 */
export function validateOverrides(
  overrides: ReadonlyArray<{ role: string; permission: string; allowed: boolean }>
): string[] {
  const errors: string[] = [];

  // Bentuk baris: izin & peran harus dikenal kode, sel tidak boleh kembar.
  const seen = new Set<string>();
  for (const row of overrides) {
    if (!isKnownRole(row.role)) {
      errors.push(`Peran "${row.role}" tidak dikenal.`);
      continue;
    }
    if (!isKnownPermission(row.permission)) {
      errors.push(`Izin "${row.permission}" tidak dikenal.`);
      continue;
    }
    const key = `${row.role}:${row.permission}`;
    if (seen.has(key)) {
      errors.push(`Pengaturan ganda untuk ${ROLE_LABELS[row.role]} pada izin ${row.permission}.`);
    }
    seen.add(key);

    // Anti-lockout: sel terlindung tidak boleh dicabut.
    if (!row.allowed && isProtectedCell(row.role, row.permission)) {
      errors.push(
        `${ROLE_LABELS[row.role as Role]} tidak boleh kehilangan izin "${row.permission}" — ` +
          "tanpa izin ini tidak ada lagi yang bisa mengelola hak akses atau pengguna."
      );
    }
  }
  if (errors.length > 0) return errors;

  // Invarian pada matriks EFEKTIF: delete ⊆ write ⊆ read per resource —
  // aksi lebih berbahaya tidak pernah lebih longgar (selaras tests/authz.test.ts).
  const matrix = applyOverrides(overrides);
  const resources = new Set(PERMISSIONS.map((p) => p.split(".")[0]));
  for (const resource of resources) {
    const get = (action: string) =>
      (matrix as Record<string, readonly Role[]>)[`${resource}.${action}`] as
        | readonly Role[]
        | undefined;
    const read = get("read");
    const write = get("write");
    const del = get("delete");
    if (write && read) {
      for (const role of write) {
        if (!read.includes(role)) {
          errors.push(
            `${ROLE_LABELS[role]} boleh mengubah "${resource}" tetapi tidak boleh membacanya. ` +
              `Beri juga izin baca ("${resource}.read"), atau cabut izin ubahnya.`
          );
        }
      }
    }
    const wider = write ?? read;
    if (del && wider) {
      for (const role of del) {
        if (!wider.includes(role)) {
          errors.push(
            `${ROLE_LABELS[role]} boleh menghapus "${resource}" tetapi tidak boleh ` +
              `${write ? "mengubah" : "membaca"}nya. Izin hapus tidak boleh lebih longgar.`
          );
        }
      }
    }
  }
  return errors;
}

/**
 * Buang baris yang sama dengan bawaan (bukan penyimpangan). Menjaga sifat
 * "tabel kosong = bawaan" tetap jujur: menyetel sebuah sel kembali ke nilai
 * bawaannya di UI benar-benar menghapus barisnya, bukan menyimpan baris
 * redundan yang membuat "Reset ke bawaan" tampak perlu padahal tidak.
 */
export function normalizeOverrides(
  overrides: ReadonlyArray<PermissionOverride>
): PermissionOverride[] {
  return overrides.filter((row) => {
    const baseline = (PERMISSION_ROLES[row.permission] as readonly string[]).includes(row.role);
    return row.allowed !== baseline;
  });
}

/** TTL cache matriks efektif — seirama `SESSION_RECHECK_MS` (fase 3): beban
 * 1 query/menit vs jendela maksimal konfigurasi lama masih terpakai. */
export const EFFECTIVE_MATRIX_TTL_MS = 60_000;

/**
 * Pabrik loader matriks efektif dengan cache ber-TTL + invalidasi eksplisit.
 * Sumber datanya di-inject (fungsi async pembaca override) supaya logika
 * cache bisa diuji tanpa Prisma; `authz-effective.ts` yang menyambungkan DB.
 *
 * Bila pembacaan DB gagal, loader jatuh ke matriks BAWAAN (tanpa cache) —
 * aplikasi tetap berfungsi dengan kebijakan yang tertulis di kode, dan
 * kegagalannya dicatat, bukan disembunyikan.
 */
export function createEffectiveMatrixLoader(
  fetchOverrides: () => Promise<Array<{ role: string; permission: string; allowed: boolean }>>,
  now: () => number = Date.now
) {
  let cached: { matrix: EffectiveMatrix; at: number } | null = null;

  return {
    async get(): Promise<EffectiveMatrix> {
      if (cached && now() - cached.at < EFFECTIVE_MATRIX_TTL_MS) return cached.matrix;
      try {
        const rows = await fetchOverrides();
        cached = { matrix: applyOverrides(rows), at: now() };
        return cached.matrix;
      } catch (err) {
        console.error("[authz] gagal membaca role_permission_overrides — memakai matriks bawaan:", err);
        return applyOverrides([]);
      }
    },
    /** Dipanggil setiap kali override BERUBAH — pembaca berikutnya membaca DB lagi. */
    invalidate() {
      cached = null;
    },
  };
}
