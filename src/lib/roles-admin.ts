/**
 * Aturan murni untuk KELOLA peran (buat/ubah/hapus) — tanpa DB, bisa diuji
 * langsung. Penegakan efek-samping (unik, ada-tidaknya user, invalidasi cache)
 * dilakukan route API; di sini hanya bentuk & rambu keputusan.
 *
 * Peran SISTEM (ROLES) tak boleh dinonaktifkan/dihapus/di-rename key-nya —
 * otorisasi berjalan bergantung padanya. Peran kustom lahir tanpa izin; izinnya
 * diatur di /permissions (role_permission_overrides).
 */
import { ROLES } from "@/lib/constants";

/** Kunci peran sistem yang tak boleh dipakai ulang / diutak-atik strukturnya. */
export const SYSTEM_ROLE_KEYS: readonly string[] = Object.values(ROLES);

/** slug: huruf kecil diawali huruf, boleh angka/underscore, maks 20. */
const KEY_RE = /^[a-z][a-z0-9_]{0,19}$/;

export interface RoleInput {
  key: string;
  label: string;
}

export type RoleValidation = { ok: true; value: RoleInput } | { ok: false; error: string };
export type LabelValidation = { ok: true; label: string } | { ok: false; error: string };

/** Validasi + normalisasi calon peran baru (key & label). */
export function validateNewRole(rawKey: unknown, rawLabel: unknown): RoleValidation {
  const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

  if (!key) return { ok: false, error: "Kunci peran wajib diisi." };
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      error: "Kunci peran harus huruf kecil (a–z), boleh angka/underscore, diawali huruf, maks 20 karakter.",
    };
  }
  if (SYSTEM_ROLE_KEYS.includes(key)) {
    return { ok: false, error: `Kunci "${key}" dipakai peran sistem — pilih kunci lain.` };
  }
  if (!label) return { ok: false, error: "Nama peran wajib diisi." };
  if (label.length > 50) return { ok: false, error: "Nama peran maksimal 50 karakter." };

  return { ok: true, value: { key, label } };
}

/** Validasi label saat rename (semua peran boleh di-rename labelnya). */
export function validateRoleLabel(rawLabel: unknown): LabelValidation {
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  if (!label) return { ok: false, error: "Nama peran wajib diisi." };
  if (label.length > 50) return { ok: false, error: "Nama peran maksimal 50 karakter." };
  return { ok: true, label };
}

/** Boleh dinonaktifkan? Peran sistem tidak. */
export function canDeactivateRole(role: { isSystem: boolean }): boolean {
  return !role.isSystem;
}

/**
 * Boleh dihapus? Bukan peran sistem DAN tak ada pengguna yang memakainya.
 * Alasan dikembalikan agar UI bisa menjelaskan penolakan.
 */
export function roleDeletionBlock(
  role: { isSystem: boolean },
  usersWithRole: number
): string | null {
  if (role.isSystem) return "Peran sistem tak bisa dihapus.";
  if (usersWithRole > 0) {
    return `Masih ada ${usersWithRole} pengguna memakai peran ini. Pindahkan mereka ke peran lain dulu.`;
  }
  return null;
}
