/**
 * Dari SESI ke KONTEKS PERUSAHAAN (issue #104) — satu langkah yang harus
 * dilewati setiap permintaan sebelum menyentuh basis data.
 *
 * Penjaga halaman (`page-auth.ts`) dan penjaga API (`auth-guard.ts`) memanggil
 * modul ini lebih dulu. Sesudahnya `prisma` menunjuk basis data perusahaan yang
 * benar; sebelumnya ia melempar.
 *
 * ══ KENAPA DI PENJAGA, BUKAN DI MIDDLEWARE ═════════════════════════════════
 * `proxy.ts` berjalan di runtime Edge dan tidak berbagi eksekusi dengan render
 * server — konteks yang ditanam di sana tidak akan pernah terlihat oleh kode
 * halaman. Penjaga adalah tempat yang tepat karena SETIAP halaman dan SETIAP
 * route memang sudah melewatinya, dan itu bukan kebiasaan melainkan aturan yang
 * ditegakkan `tests/authz-coverage.test.ts`.
 *
 * ══ TIGA KEADAAN, TIGA JAWABAN BERBEDA ═════════════════════════════════════
 *   tidak ada sesi                → belum masuk
 *   sesi tanpa perusahaan aktif   → harus memilih perusahaan dulu
 *   perusahaan hilang/nonaktif    → pilihannya tidak berlaku lagi
 * Ketiganya sengaja dibedakan: melempar semuanya ke halaman masuk membuat orang
 * mengetik ulang kata sandi untuk masalah yang sama sekali bukan itu.
 */

import "server-only";

import { enterCompanyContext } from "@/lib/company-context";
import { getCompany } from "@/lib/company-registry";

export type CompanySessionResult =
  | { ok: true; companyId: number; slug: string; role: string }
  | { ok: false; reason: "no-session" | "no-company" | "company-unavailable" };

interface SessionLike {
  user?: {
    id?: string | null;
    role?: string | null;
    companyId?: number | null;
  } | null;
}

/**
 * Tanamkan konteks perusahaan dari sesi. Setelah ini berhasil, `prisma` di
 * seluruh permintaan menunjuk basis data perusahaan tersebut.
 */
export async function enterCompanyFromSession(
  session: SessionLike | null | undefined
): Promise<CompanySessionResult> {
  const user = session?.user;
  if (!user?.id) return { ok: false, reason: "no-session" };

  const companyId = user.companyId ?? null;
  if (companyId == null) return { ok: false, reason: "no-company" };

  const company = await getCompany(companyId);
  if (!company || !company.isActive) {
    return { ok: false, reason: "company-unavailable" };
  }

  enterCompanyContext({
    companyId: company.companyId,
    slug: company.slug,
    databaseName: company.databaseName,
  });

  // Peran datang dari keanggotaan dan sudah divalidasi ulang oleh revalidasi
  // sesi berkala (`lib/auth.ts`). Sesi dengan perusahaan tapi tanpa peran
  // adalah keadaan yang tidak bisa terjadi — kalau toh terjadi, ia diperlakukan
  // sebagai "pilihannya tidak berlaku lagi", bukan diberi peran tebakan.
  if (!user.role) return { ok: false, reason: "company-unavailable" };

  return { ok: true, companyId: company.companyId, slug: company.slug, role: user.role };
}
