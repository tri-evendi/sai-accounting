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

import { cache } from "react";
import { getCompanyContext, MissingCompanyContextError, type CompanyContext } from "@/lib/company-context";

/**
 * Perusahaan menurut SESI permintaan yang sedang berjalan, atau `null`.
 *
 * DIBUNGKUS `cache()` REACT — sekali per permintaan, bukan sekali per query.
 * Tanpa itu, satu render beranda yang menjalankan ~8 query akan membaca cookie
 * dan memverifikasi JWT delapan kali untuk menjawab pertanyaan yang jawabannya
 * tidak mungkin berubah di tengah permintaan. Di luar konteks permintaan
 * (skrip, cron) `cache()` tidak menyimpan apa pun dan fungsinya berjalan biasa —
 * dan di sana jalur ini memang tak terpakai, sebab konteks ALS sudah ada.
 *
 * `auth` dan registry diimpor secara dinamis: modul ini dipakai hampir setiap
 * berkas lib, dan menarik NextAuth ke dalam graf impor mereka membuat skrip
 * biasa (seed, migrasi) ikut memuat seluruh mesin autentikasi yang tak pernah
 * mereka butuhkan.
 */
const companyFromSession = cache(async function companyFromSession(): Promise<CompanyContext | null> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const companyId = session?.user?.companyId ?? null;
  if (companyId == null) return null;

  const { getCompany } = await import("@/lib/company-registry");
  const company = await getCompany(companyId);
  if (!company || !company.isActive) return null;

  return { companyId: company.companyId, slug: company.slug, databaseName: company.databaseName };
});

/**
 * Perusahaan menurut JALUR URL permintaan ini (issue #157) — penambal lubang
 * yang membuat sumber kedua di atas berbahaya begitu perusahaan pindah ke URL.
 *
 * Sumber "sesi" di bawah ditulis ketika perusahaan aktif memang hidup di sesi.
 * Sejak halaman `/t/{tenant}/{company}/…` mengambil perusahaannya dari JALUR,
 * sesi bisa menunjuk PT LAIN — tab sebelah baru saja berganti, atau tautan
 * dalam dibuka oleh orang yang PT terakhirnya berbeda. Kalau di jalur itu
 * rambatan `enterWith` gagal (dan `company-context.ts` menegaskan rambatan itu
 * JALAN PINTAS, bukan jaminan), query akan diam-diam jatuh ke perusahaan di
 * sesi: halaman PT A menulis ke buku PT B, tanpa galat.
 *
 * Karena itu penjaga jalur menuliskan perusahaannya DI SINI juga, di penyimpan
 * yang lingkupnya satu permintaan (`cache()` React mengembalikan objek yang
 * sama sepanjang satu permintaan, dan objek berbeda untuk permintaan lain —
 * jadi tidak ada kebocoran antar-permintaan maupun antar-pengguna). Urutannya:
 * konteks ALS → jalur → sesi. Sesi hanya menjawab bila permintaannya memang
 * tidak punya jalur bertenant, yaitu persis pemakai sah sumber kedua
 * (`/api/user/companies`, `/api/user/permissions`) dan halaman lama yang belum
 * dimigrasikan.
 */
const routeCompanyHolder = cache(function routeCompanyHolder(): {
  value: CompanyContext | null;
} {
  return { value: null };
});

/** Dipanggil penjaga jalur (`enterCompanyFromRoute`) — bukan oleh kode halaman. */
export function setRouteCompany(context: CompanyContext): void {
  routeCompanyHolder().value = context;
}

/**
 * Perusahaan dari jalur permintaan ini, atau `null`.
 *
 * Diekspor untuk SATU pemakai: penjaga jalur, yang membacanya kembali segera
 * setelah menulisnya untuk membuktikan tulisannya mendarat. Kode halaman tidak
 * pernah memanggil ini — pertanyaan "perusahaan mana?" hanya punya satu jawaban,
 * dan jawabannya `currentCompany()`.
 */
export function routeCompany(): CompanyContext | null {
  return routeCompanyHolder().value;
}

/** Konteks perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompany(): Promise<CompanyContext> {
  const fromContext = getCompanyContext();
  if (fromContext) return fromContext;

  const fromRoute = routeCompanyHolder().value;
  if (fromRoute) return fromRoute;

  const fromSession = await companyFromSession();
  if (fromSession) return fromSession;

  throw new MissingCompanyContextError();
}

/** Id perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompanyId(): Promise<number> {
  return (await currentCompany()).companyId;
}
