/**
 * "Perusahaan mana yang sedang dibuka?" — SATU jawaban untuk seluruh kode
 * server (issue #104).
 *
 * Dua sumber, berurutan:
 *
 *   1. **Konteks `AsyncLocalStorage`** — dipasang `runWithCompany()` (skrip,
 *      cron, seed, tes) dan oleh penjaga halaman/API lewat
 *      `enterCompanyContext()`.
 *   2. **Sesi permintaan** — `companyId` di JWT, diterjemahkan lewat registry.
 *
 * Kalau keduanya kosong: **MELEMPAR**. Tidak pernah ada perusahaan bawaan.
 *
 * ══ KENAPA SUMBER KEDUA ADA, PADAHAL PENJAGA SUDAH MENANAM KONTEKS ═════════
 * Karena tidak semua jalur melewati penjaga, dan yang tidak melewatinya bukan
 * kasus pinggiran: `/api/user/permissions` dan `/api/user/companies` sengaja
 * self-scoped (hanya `auth()`, tanpa `requireApiPermission`) — merekalah yang
 * menyusun menu dan pemilih perusahaan. Tanpa sumber kedua, sidebar setiap
 * pengguna kosong dan pemilih perusahaannya gagal, persis pada saat ia paling
 * dibutuhkan.
 *
 * Dan satu sifat `enterWith` yang diukur langsung (`node --input-type=module`,
 * bukan diduga), sebab ia menentukan kenapa sumber kedua bukan kemewahan:
 *
 *   • Bila BELUM ada store, `enterWith` di dalam fungsi async MERAMBAT ke
 *     kelanjutan pemanggilnya. Jadi konteks yang ditanam penjaga memang
 *     terlihat oleh kode halaman sesudahnya.
 *   • Bila SUDAH ada store, `enterWith` di fungsi yang di-`await` TIDAK
 *     menimpanya untuk pemanggil — pemanggil tetap melihat store lama.
 *
 * Sifat kedua itu yang berbahaya: satu pekerjaan latar yang membungkus dirinya
 * dengan `runWithCompany(PT_A)` lalu memanggil sesuatu yang menanam PT B akan
 * tetap menulis ke PT A. Karena itu urutannya dibuat eksplisit di sini —
 * konteks ALS SELALU menang, dan sesi hanya dipakai bila memang tidak ada
 * konteks sama sekali. Tidak ada tebak-tebakan siapa yang menang.
 */

import { getCompanyContext, MissingCompanyContextError, type CompanyContext } from "@/lib/company-context";

/**
 * Perusahaan menurut SESI permintaan yang sedang berjalan, atau `null`.
 *
 * `auth` dan registry diimpor secara dinamis: modul ini dipakai hampir setiap
 * berkas lib, dan menarik NextAuth ke dalam graf impor mereka membuat skrip
 * biasa (seed, migrasi) ikut memuat seluruh mesin autentikasi yang tak pernah
 * mereka butuhkan.
 */
async function companyFromSession(): Promise<CompanyContext | null> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const companyId = session?.user?.companyId ?? null;
  if (companyId == null) return null;

  const { getCompany } = await import("@/lib/company-registry");
  const company = await getCompany(companyId);
  if (!company || !company.isActive) return null;

  return { companyId: company.companyId, slug: company.slug, databaseName: company.databaseName };
}

/** Konteks perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompany(): Promise<CompanyContext> {
  const fromContext = getCompanyContext();
  if (fromContext) return fromContext;

  const fromSession = await companyFromSession();
  if (fromSession) return fromSession;

  throw new MissingCompanyContextError();
}

/** Id perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompanyId(): Promise<number> {
  return (await currentCompany()).companyId;
}
