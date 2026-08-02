/**
 * LINGKUP PERUSAHAAN yang DIBAWA PERMINTAAN (issue #158) — bagian MURNI-nya.
 *
 * ══ SEPARUH KEDUA DARI PERUBAHAN YANG SAMA ═════════════════════════════════
 * #157 memindahkan HALAMAN ke `/t/{tenant}/{company}/…`. Route API tidak ikut:
 * `/api/invoices` masih menanyakan perusahaan kepada SESI. Selama itu benar,
 * halaman `/t/acme/cv-maju/invoices` menampilkan buku CV Maju sambil menulis ke
 * perusahaan yang tertulis di cookie — bahaya "yang dilihat bukan yang ditulis"
 * tidak hilang, ia hanya turun satu lapis dan menjadi lebih sulit terlihat,
 * sebab URL-nya sekarang terlihat meyakinkan.
 *
 * ══ BENTUKNYA: HEADER, BUKAN JALUR ═════════════════════════════════════════
 * Perusahaan dikirim sebagai sepasang header, disuntikkan SATU KALI di
 * `apiFetch()` (lihat `lib/api-fetch.ts`). Dua alasan, dan tidak ada yang
 * berhubungan dengan kemalasan:
 *
 *   1. Keputusannya jadi ADA DI SATU TEMPAT. Memindahkan 91 route ke
 *      `/api/t/{tenant}/{company}/…` berarti 91 kesempatan menulis pagar yang
 *      sedikit berbeda; satu pembungkus fetch adalah satu berkas yang bisa
 *      diuji, dan yang lupa memakainya langsung DITOLAK (409) alih-alih
 *      diam-diam memakai perusahaan lain.
 *   2. Ia tidak mengubah alamat API yang sudah dipakai — sehingga migrasinya
 *      bisa berjalan sebatch demi sebatch tanpa satu pun permukaan mati di
 *      tengah jalan.
 *
 * Yang TIDAK bisa lewat header: unduhan yang dibuka di tab baru (`<a href>`
 * tidak melewati `apiFetch`). Untuk itu — dan HANYA untuk itu — ada jalur
 * `/api/t/{tenant}/{company}/…`; lihat `src/app/api/t`.
 *
 * ══ HEADER ITU MASUKAN PENGGUNA ════════════════════════════════════════════
 * Siapa pun bisa mengarang sepasang header. Karena itu penjaga TIDAK PERNAH
 * mempercayainya: ia hanya dipakai untuk MENANYAKAN "perusahaan mana", lalu
 * keanggotaan pemanggil di perusahaan itu dibaca ulang ke basis data kendali
 * pada permintaan ini juga (`enterCompanyFromRoute`). Header karangan yang
 * menunjuk PT tenant lain dijawab 404 yang sama persis dengan slug fiktif —
 * dan tidak ada satu pun tulisan yang terjadi sebelum jawaban itu.
 *
 * ══ KENAPA MURNI & TANPA `server-only` ═════════════════════════════════════
 * Pemakainya ada di dua dunia: pembungkus fetch di KLIEN yang menuliskan
 * header, dan penjaga di SERVER yang membacanya. Nama header yang ditulis ulang
 * di dua tempat adalah nama header yang suatu hari berbeda di dua tempat.
 */

import { isValidSlug, type TenantScopedParams } from "@/lib/tenant-routes";

/** Tenant pemilik perusahaan di permintaan ini. */
export const TENANT_SLUG_HEADER = "x-tenant-slug";
/** Perusahaan yang sedang dibuka pemanggil, menurut ALAMAT yang ia lihat. */
export const COMPANY_SLUG_HEADER = "x-company-slug";

/**
 * Baca sepasang slug dari sumber header apa pun (`Headers`, objek biasa, tiruan
 * di tes). Bentuk slug divalidasi DI SINI, sebelum nilainya sempat menjadi
 * query — cerminan pemeriksaan yang sama di `enterCompanyFromRoute`.
 *
 * Mengembalikan `null` bila salah satunya hilang atau bentuknya tidak sah:
 * "tidak mengirim lingkup" dan "mengirim lingkup yang omong kosong" sama-sama
 * bukan permintaan yang boleh dijawab dengan menebak perusahaan.
 */
export function companyScopeFromHeaders(
  get: (name: string) => string | null | undefined
): TenantScopedParams | null {
  const tenantSlug = get(TENANT_SLUG_HEADER)?.trim();
  const companySlug = get(COMPANY_SLUG_HEADER)?.trim();
  if (!isValidSlug(tenantSlug) || !isValidSlug(companySlug)) return null;
  return { tenantSlug, companySlug };
}
