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

/**
 * Segmen dinamis yang dibawa SETIAP halaman di bawah `/t/…`.
 *
 * Next mengoper seluruh segmen dinamis leluhur ke setiap halaman di bawahnya,
 * jadi halaman `[id]` pun menerima kedua slug ini di `params`-nya — itulah
 * sebabnya penjaga cukup diberi `params` apa adanya, tanpa satu pun halaman
 * perlu membaca URL sendiri.
 */
export interface TenantScopedParams {
  tenantSlug: string;
  companySlug: string;
}

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
export const MIGRATED_ROOT_SEGMENTS: readonly string[] = [
  "accounts",
  "advances",
  "approvals",
  "budget",
  "consignees",
  "contracts",
  "cost-centers",
  "customers",
  "dashboard",
  "delivery-orders",
  "documents",
  "finance",
  "fixed-assets",
  "glossary",
  "inventory",
  "invoices",
  "journal",
  "ledger",
  "payables",
  "periods",
  "permissions",
  "purchases",
  "receivables",
  "reconciliation",
  "reports",
  "returns",
  "sales",
  "settings",
  // Tinggal di grup rute `(setup)`, bukan `(dashboard)` — grup rute tidak
  // mengubah URL, jadi segmennya tetap milik ruang nama yang sama (#158).
  "setup",
  "suppliers",
  "tax",
  "users",
];

const MIGRATED = new Set(MIGRATED_ROOT_SEGMENTS);

/**
 * Bangun jalur kanonik. `path` selalu jalur lama yang diawali `/`
 * (mis. `/invoices/12`); querystring & fragment ikut apa adanya.
 */
export function tenantPath(tenantSlug: string, companySlug: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${TENANT_ROUTE_PREFIX}/${tenantSlug}/${companySlug}${suffix}`;
}

/**
 * ── HALAMAN yang alamatnya BERGANTI NAMA (issue #172) ──────────────────────
 *
 * `/tenant` adalah kosakata ARSITEKTUR, bukan kosakata pelanggan: yang dibuka
 * orang di sana adalah AKUN-nya — langganan, kuota, daftar perusahaannya.
 * Alamatnya karena itu pindah ke `/platform`, dan yang lama dipantulkan 307
 * oleh `proxy.ts` supaya bookmark, tautan di surel yang sudah terkirim, dan
 * setiap tautan lama tetap sampai.
 *
 * ⚠ `/api/tenant/*` TIDAK IKUT PINDAH. Itu permukaan API bertingkat tenant
 * (`requireTenantApiPermission`, issue #135) dan namanya memang benar secara
 * arsitektur — yang berganti hanya ALAMAT HALAMAN. Karena itu fungsi di bawah
 * menolak jalur `/api/` lebih dulu, bukan mengandalkan pemanggilnya ingat.
 *
 * Peta ini SENGAJA berupa tabel, bukan `if` di dalam proxy: satu tempat untuk
 * seluruh penggantian nama halaman, dan bisa diuji tanpa menjalankan proxy.
 */
export const RENAMED_PAGE_PATHS: Readonly<Record<string, string>> = {
  "/tenant": "/platform",
};

/**
 * Jalur kanonik untuk sebuah alamat halaman LAMA, atau `null` bila alamatnya
 * memang tidak berganti nama. Sub-jalur ikut (`/tenant/x` → `/platform/x`).
 */
export function renamedPagePath(pathname: string): string | null {
  if (pathname.startsWith("/api/")) return null;
  for (const [from, to] of Object.entries(RENAMED_PAGE_PATHS)) {
    if (pathname === from) return to;
    if (pathname.startsWith(`${from}/`)) return `${to}${pathname.slice(from.length)}`;
  }
  return null;
}

/**
 * Awalan API bertenant (issue #158) — `/api/t/{tenant}/{company}/…`.
 *
 * Dipakai OLEH SANGAT SEDIKIT route, dan itu disengaja: bentuk baku lingkup
 * perusahaan adalah HEADER yang disuntikkan `apiFetch()` (lihat
 * `lib/company-scope.ts`). Jalur dipakai hanya di tempat header mustahil —
 * berkas yang diunduh lewat `<a href download>`, yang tidak melewati satu pun
 * kode kita sebelum permintaannya terkirim.
 */
export const TENANT_API_PREFIX = "/api/t";

export function tenantApiPath(tenantSlug: string, companySlug: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${TENANT_API_PREFIX}/${tenantSlug}/${companySlug}${suffix}`;
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
 * Jalur APLIKASI dari sebuah alamat — `/t/acme/cv-maju/invoices/12` menjadi
 * `/invoices/12`, dan jalur yang bukan bertenant dikembalikan apa adanya.
 *
 * Ada karena sejumlah fungsi memutuskan sesuatu dari BENTUK jalur, bukan dari
 * perusahaannya: menu mana yang disorot, tur mana yang berlaku di halaman ini.
 * Semua tabelnya ditulis dalam jalur lama, dan menuliskannya ulang dalam bentuk
 * bertenant mustahil — slug-nya baru diketahui saat permintaan berjalan.
 * Membuang awalannya di satu tempat jauh lebih murah daripada mengajari setiap
 * tabel tentang tenant.
 */
export function appPath(pathname: string): string {
  return parseTenantPath(pathname)?.rest ?? pathname;
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
