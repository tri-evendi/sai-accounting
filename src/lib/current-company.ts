/**
 * "Perusahaan mana yang sedang dibuka?" — SATU jawaban untuk seluruh kode
 * server (issue #104).
 *
 * Dua sumber, berurutan:
 *
 *   1. **Konteks `AsyncLocalStorage`** — dipasang `runWithCompany()` (skrip,
 *      cron, seed, tes) dan oleh penjaga halaman/API lewat
 *      `enterCompanyContext()`.
 *   2. **Penyimpan per-permintaan** — ditulis penjaga jalur/permintaan; lihat
 *      `setRouteCompany` di bawah.
 *
 * Kalau keduanya kosong: **MELEMPAR**. Tidak pernah ada perusahaan bawaan.
 *
 * ══ SUMBER KETIGA YANG DIHAPUS: SESI (issue #158) ══════════════════════════
 * Sampai #158 ada sumber ketiga — `companyId` di JWT. Ia lahir sebagai jaring
 * pengaman untuk jalur yang tidak melewati penjaga, dan justru itu yang membuat
 * seluruh kelas kesalahan ini bisa bertahan: route yang lupa membawa lingkupnya
 * TETAP BEKERJA, dengan perusahaan yang kebetulan terakhir dibuka di tab mana
 * pun, tanpa galat dan tanpa jejak. Setelah penjaga API mengambil lingkupnya
 * dari permintaan (`lib/company-request.ts`) dan route self-scoped menyebutnya
 * sendiri, jaring itu tidak lagi menangkap apa pun kecuali kesalahan.
 *
 * Menghapusnya mengubah "lupa membawa perusahaan" dari sunyi menjadi berisik:
 * `MissingCompanyContextError`, di query pertama, bukan neraca yang tidak cocok
 * berbulan-bulan kemudian.
 *
 * Dan satu sifat `enterWith` yang diukur langsung (`node --input-type=module`,
 * bukan diduga), sebab ia menentukan mengapa sumber pertama bisa diandalkan
 * untuk permintaan HTTP:
 *
 *   • Bila BELUM ada store, `enterWith` di dalam fungsi async MERAMBAT ke
 *     kelanjutan pemanggilnya. Setiap permintaan HTTP mulai TANPA store, jadi
 *     konteks yang ditanam penjaga memang terlihat oleh kode sesudahnya.
 *   • Bila SUDAH ada store, `enterWith` di fungsi yang di-`await` TIDAK
 *     menimpanya untuk pemanggil — pemanggil tetap melihat store lama.
 *
 * Sifat kedua itu yang berbahaya: satu pekerjaan latar yang membungkus dirinya
 * dengan `runWithCompany(PT_A)` lalu memanggil sesuatu yang menanam PT B akan
 * tetap menulis ke PT A. Karena itu urutannya dibuat eksplisit di sini —
 * konteks ALS SELALU menang. Tidak ada tebak-tebakan siapa yang menang.
 */

import { cache } from "react";
import { getCompanyContext, MissingCompanyContextError, type CompanyContext } from "@/lib/company-context";

/**
 * Perusahaan menurut PERMINTAAN ini (issue #157) — sabuk kedua di samping ALS.
 *
 * `company-context.ts` menegaskan rambatan `enterWith` adalah JALAN PINTAS,
 * bukan jaminan. Selama sesi masih menjadi sumber ketiga, kegagalan rambatan
 * itu SUNYI: query jatuh ke perusahaan di cookie dan halaman PT A menulis ke
 * buku PT B tanpa satu pun galat. Karena itu penjaga menuliskan perusahaannya
 * DI SINI juga, di penyimpan yang lingkupnya satu permintaan (`cache()` React
 * mengembalikan objek yang sama sepanjang satu render, dan objek berbeda untuk
 * permintaan lain — jadi tidak ada kebocoran antar-permintaan maupun
 * antar-pengguna).
 *
 * Sejak sesi dihapus (#158) sabuk ini berhenti menjadi penambal dan menjadi
 * apa adanya: pembanding yang dibaca ulang penjaga untuk MEMBUKTIKAN
 * konteksnya benar-benar mendarat sebelum satu query pun berjalan.
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
 * Perusahaan dari permintaan ini, atau `null`.
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

  throw new MissingCompanyContextError();
}

/** Id perusahaan yang berlaku sekarang — atau melempar. */
export async function currentCompanyId(): Promise<number> {
  return (await currentCompany()).companyId;
}
