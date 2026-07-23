/**
 * Keputusan pencabutan sesi (audit RBAC fase 3) — bagian MURNI.
 *
 * Masalah yang diselesaikan: peran hidup di JWT (24 jam). Sebelum fase ini,
 * mengganti peran, me-reset kata sandi, atau MENGHAPUS pengguna tidak
 * berdampak pada sesi yang sedang berjalan — token lamanya tetap sah sampai
 * kedaluwarsa. Kini callback `jwt` di `lib/auth.ts` merevalidasi token ke DB
 * secara berkala; fungsi-fungsi di sini yang memutuskan, supaya bisa diuji
 * tanpa NextAuth/Prisma (`tests/session-guard.test.ts`).
 *
 * Kebijakan:
 * - Baris pengguna hilang (dihapus) → cabut.
 * - Token tanpa `sessionVersion` (token lama dari sebelum fase 3) → cabut —
 *   sekali pasca-rilis semua orang login ulang, lalu tidak pernah lagi.
 * - `sessionVersion` token ≠ DB (admin menaikkannya) → cabut.
 * - Selainnya → segarkan: peran/status di token disalin ulang dari DB, jadi
 *   PERUBAHAN peran juga terasa ≤ interval revalidasi tanpa perlu login ulang.
 */

/** Jarak antar revalidasi DB. Kompromi: beban 1 query/menit/pengguna aktif vs
 * jendela maksimal token tercabut masih terpakai. */
export const SESSION_RECHECK_MS = 60_000;

export interface SessionTokenLike {
  userId?: unknown;
  sessionVersion?: unknown;
  /** Stempel revalidasi terakhir (ms epoch) — milik token, bukan DB. */
  checkedAt?: unknown;
}

export interface SessionDbUser {
  role: string;
  status: number;
  sessionVersion: number;
  accountantMode: boolean | null;
}

/** Sudah waktunya mengecek DB lagi? Token tanpa stempel = ya. */
export function shouldRecheckSession(token: SessionTokenLike, nowMs: number): boolean {
  const at = typeof token.checkedAt === "number" ? token.checkedAt : 0;
  return nowMs - at >= SESSION_RECHECK_MS;
}

/** Nasib token setelah membaca DB: dicabut, atau disegarkan dari DB. */
export function evaluateSession(
  token: SessionTokenLike,
  dbUser: SessionDbUser | null | undefined
): "revoke" | "refresh" {
  if (!dbUser) return "revoke";
  if (typeof token.sessionVersion !== "number") return "revoke";
  if (token.sessionVersion !== dbUser.sessionVersion) return "revoke";
  return "refresh";
}
