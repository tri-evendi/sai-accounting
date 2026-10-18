/**
 * Token sesi yang SAH → identitas operator yang BERLAKU SEKARANG.
 *
 * Tanda tangan yang sah hanya membuktikan token itu pernah diterbitkan. Ia
 * tidak membuktikan akunnya masih ada, masih aktif, masih berperan sama, atau
 * sesinya belum dicabut. Fungsi ini yang menjawab itu, dan karena itu peran
 * dibaca dari SUMBERNYA pada setiap permintaan, bukan dari token: menurunkan
 * peran seseorang berlaku pada klik berikutnya, bukan delapan jam kemudian.
 *
 * MURNI (sumber disuntik) supaya setiap cabang gagal-tertutupnya teruji.
 */
import type { OperatorSessionPayload } from "./session";
import type { OperatorAccount } from "./credentials";
import { isOperatorRole, type OperatorRole } from "./roles";

export interface OperatorIdentity {
  name: string;
  role: OperatorRole;
  source: "env" | "db";
  /** Hanya akun db. */
  id: number | null;
}

/** Keadaan akun basis data yang dibutuhkan penjaga — tanpa rahasia apa pun. */
export interface DbOperatorState {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  sessionVersion: number;
}

export async function resolveOperatorIdentity(
  payload: OperatorSessionPayload,
  sources: {
    envAccounts: OperatorAccount[];
    lookupDb: (name: string) => Promise<DbOperatorState | null>;
  }
): Promise<OperatorIdentity | null> {
  const src = payload.src ?? "env";

  if (src === "env") {
    /* Akun env yang DIHAPUS dari `OPERATOR_USERS` berhenti berlaku seketika —
       sebelum migration kendali 0004 tokennya tetap sah sampai kedaluwarsa. */
    const env = sources.envAccounts.find((a) => a.name.toLowerCase() === payload.sub.toLowerCase());
    return env ? { name: env.name, role: "owner", source: "env", id: null } : null;
  }

  let state: DbOperatorState | null;
  try {
    state = await sources.lookupDb(payload.sub);
  } catch (error) {
    /* Kendali tak terjangkau → akun basis data DITOLAK (gagal-tertutup).
       Akun env tidak terdampak: itulah jalan masuk darurat. */
    console.error("[operator] akun basis data tak terbaca — sesi ditolak:", error);
    return null;
  }
  if (!state || !state.isActive) return null;
  if (state.sessionVersion !== payload.ver) return null;
  if (!isOperatorRole(state.role)) return null;
  return { name: state.name, role: state.role, source: "db", id: state.id };
}
