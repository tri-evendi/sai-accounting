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
 * - **Keanggotaan di perusahaan yang sedang dibuka hilang/dinonaktifkan, atau
 *   perusahaannya sendiri dinonaktifkan → lepaskan perusahaannya** (issue #104).
 * - Selainnya → segarkan: peran & wajib-ganti-sandi di token disalin ulang dari DB, jadi
 *   PERUBAHAN peran juga terasa ≤ interval revalidasi tanpa perlu login ulang.
 *
 * ══ KENAPA KEANGGOTAAN IKUT DIPERIKSA ══════════════════════════════════════
 * Mencabut akses seseorang dari satu PT selalu terjadi karena sesuatu: ia
 * pindah bagian, keluar, atau salah diberi akses. Kalau token yang terlanjur
 * terbit tetap membuka buku PT itu sampai 24 jam ke depan, pencabutannya hanya
 * benar di layar admin dan tidak di kenyataan.
 *
 * Yang dikembalikan untuk kasus ini BUKAN "cabut": identitas orangnya masih
 * sah, dan ia mungkin masih punya PT lain. Ia dilepaskan dari perusahaan itu
 * lalu diminta memilih lagi — bukan dilempar keluar sepenuhnya.
 */

/** Jarak antar revalidasi DB. Kompromi: beban 1 query/menit/pengguna aktif vs
 * jendela maksimal token tercabut masih terpakai. */
export const SESSION_RECHECK_MS = 60_000;

export interface SessionTokenLike {
  userId?: unknown;
  sessionVersion?: unknown;
  /** Perusahaan yang sedang dibuka token ini (issue #104). */
  companyId?: unknown;
  /** Stempel revalidasi terakhir (ms epoch) — milik token, bukan DB. */
  checkedAt?: unknown;
}

export interface SessionDbUser {
  mustChangePassword: boolean;
  sessionVersion: number;
}

/** Keanggotaan yang dibaca ulang saat revalidasi. `null` = sudah tidak ada. */
export interface SessionMembership {
  /** Peran DI PERUSAHAAN yang sedang dibuka — bukan peran global. */
  role: string;
  accountantMode: boolean | null;
}

/** Sudah waktunya mengecek DB lagi? Token tanpa stempel = ya. */
export function shouldRecheckSession(token: SessionTokenLike, nowMs: number): boolean {
  const at = typeof token.checkedAt === "number" ? token.checkedAt : 0;
  return nowMs - at >= SESSION_RECHECK_MS;
}

/**
 * Nasib token setelah membaca basis data kendali.
 *
 * - `revoke`       → token mati; pengguna kembali ke halaman masuk.
 * - `clearCompany` → identitas masih sah, perusahaannya tidak lagi boleh
 *                    dibuka; pengguna diminta memilih perusahaan lagi.
 * - `refresh`      → salin ulang peran & Mode Akuntan dari basis data.
 */
export function evaluateSession(
  token: SessionTokenLike,
  dbUser: SessionDbUser | null | undefined,
  membership?: SessionMembership | null
): "revoke" | "clearCompany" | "refresh" {
  if (!dbUser) return "revoke";
  if (typeof token.sessionVersion !== "number") return "revoke";
  if (token.sessionVersion !== dbUser.sessionVersion) return "revoke";

  // Token tanpa perusahaan aktif memang sah: itu keadaan pengguna yang baru
  // masuk dan belum memilih (atau baru kehilangan pilihannya).
  if (token.companyId == null) return "refresh";

  if (!membership) return "clearCompany";

  return "refresh";
}
