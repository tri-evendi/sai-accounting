/**
 * BENTUK JALUR ber-slug tenant (issue #157) — bagian MURNI-nya.
 *
 * `/t/{tenantSlug}/{companySlug}/…` mengikuti model `/{org}/{repo}` GitHub.
 * Awalan `/t/` ada supaya slug pelanggan tidak pernah berebut ruang nama dengan
 * jalur akar yang sudah dipakai (`/login`, `/register`, `/api`, `/setup`,
 * `/tenant`, `/dashboard`, …) — tanpa awalan itu, setiap halaman akar baru
 * diam-diam menjadi daftar kata terlarang untuk nama tenant pelanggan.
 *
 * Tenant WAJIB ada di jalur: sejak issue #153 slug perusahaan hanya unik DI
 * DALAM satu tenant (`@@unique([tenantId, slug])`), jadi `/{companySlug}` saja
 * bukan pengenal — dua pelanggan boleh sama-sama punya `pusat`.
 *
 * ══ KENAPA MURNI & TANPA `server-only` ═════════════════════════════════════
 * Pemakainya ada di tiga dunia: `src/proxy.ts` (runtime Edge — tanpa Prisma,
 * tanpa `node:*`), penjaga halaman di server, dan komponen klien yang menyusun
 * tautan. Satu bentuk jalur tidak boleh ditulis ulang tiga kali; yang ditulis
 * ulang akan berbeda.
 *
 * ══ SLUG PERUSAHAAN ITU TETAP (keputusan #157) ═════════════════════════════
 * Slug perusahaan TIDAK boleh diubah setelah dibuat, dan itu bukan kemalasan:
 *   • slug ikut menyusun NAMA BASIS DATA (`sai_t{tenantId}_{slug}`) — menggantinya
 *     berarti me-rename basis data hidup;
 *   • sejak issue ini slug ada di URL, jadi menggantinya mematikan setiap tautan
 *     dalam yang pernah dibagikan, setiap bookmark, dan setiap tautan di surel
 *     yang sudah terkirim — tanpa satu pun galat, hanya 404;
 *   • yang berubah dalam praktik adalah NAMA perusahaan, dan nama memang boleh
 *     berubah bebas — ia tidak pernah dipakai sebagai pengenal.
 * Cache slug→perusahaan di `company-route.ts` berdiri di atas keputusan ini.
 */

/** Awalan jalur bertenant. Tidak pernah ditulis harfiah di tempat lain. */
export const TENANT_ROUTE_PREFIX = "/t";

/** Bentuk slug yang sah — cerminan `lib/validations/company.ts`. */
const SLUG_PATTERN = /^[a-z0-9-]{2,50}$/;

export function isValidSlug(slug: string | null | undefined): slug is string {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

/**
 * Segmen akar yang SUDAH pindah ke `/t/{tenant}/{company}/…` (issue #157).
 *
 * Daftar ini adalah satu-satunya sumber kebenaran "jalur lama mana yang boleh
 * dipantulkan". Ia SENGAJA statis dan bukan hasil pembacaan direktori: proxy
 * berjalan di Edge dan tidak boleh menyentuh `node:fs`. Yang menjaganya tetap
 * jujur adalah `tests/tenant-routes.test.ts`, yang membandingkannya dengan isi
 * direktori sungguhan — daftar yang meleset = tes merah, bukan pantulan ke
 * halaman yang belum ada.
 *
 * Migrasi berjalan BERTAHAP: selama sebuah segmen belum ada di sini, halaman
 * lamanya tetap hidup di jalur lama dan tetap mengambil perusahaan dari sesi.
 * Menambahkan segmen ke sini = menyatakan "jalur barunya sudah ada".
 */
export const MIGRATED_ROOT_SEGMENTS: readonly string[] = [];

const MIGRATED = new Set(MIGRATED_ROOT_SEGMENTS);

/**
 * Bangun jalur kanonik. `path` selalu jalur lama yang diawali `/`
 * (mis. `/invoices/12`); querystring & fragment ikut apa adanya.
 */
export function tenantPath(tenantSlug: string, companySlug: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${TENANT_ROUTE_PREFIX}/${tenantSlug}/${companySlug}${suffix}`;
}

/** Sudah berbentuk `/t/…`? */
export function isTenantScopedPath(pathname: string): boolean {
  return pathname === TENANT_ROUTE_PREFIX || pathname.startsWith(`${TENANT_ROUTE_PREFIX}/`);
}

/**
 * Jalur LAMA yang jalur barunya sudah ada — kandidat pantulan 307.
 *
 * Dipakai proxy. Menjawab `false` untuk jalur yang belum dimigrasikan supaya
 * halaman lamanya tetap terbuka; menjawab `false` untuk `/t/…` supaya pantulan
 * tidak pernah memantul ke dirinya sendiri.
 */
export function legacyTenantScopedPath(pathname: string): boolean {
  if (isTenantScopedPath(pathname)) return false;
  const first = pathname.split("/")[1] ?? "";
  return MIGRATED.has(first);
}

/**
 * Pecah `/t/{tenant}/{company}/sisa` menjadi bagian-bagiannya, atau `null`
 * bila bentuknya tidak sah. Sisa jalurnya dikembalikan sebagai jalur LAMA
 * (diawali `/`), supaya pemanggil bisa memetakannya balik.
 */
export function parseTenantPath(
  pathname: string
): { tenantSlug: string; companySlug: string; rest: string } | null {
  const parts = pathname.split("/");
  // ["", "t", tenant, company, ...rest]
  if (parts[1] !== TENANT_ROUTE_PREFIX.slice(1)) return null;
  const tenantSlug = parts[2];
  const companySlug = parts[3];
  if (!isValidSlug(tenantSlug) || !isValidSlug(companySlug)) return null;
  const rest = parts.slice(4).join("/");
  return { tenantSlug, companySlug, rest: rest ? `/${rest}` : "/" };
}
