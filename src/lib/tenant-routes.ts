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
 *
 * Sejak issue #161 keputusan itu DITEGAKKAN, bukan sekadar dicatat: trigger
 * `companies_slug_immutable` (migration kendali 0010) menolak setiap UPDATE
 * yang mengubah nilai slug, dari jalur mana pun — termasuk yang belum
 * terbayang saat baris ini ditulis. Lihat docs/MULTI-COMPANY.md §2.
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
  /* Integrasi Accurate — cocokkan buku besar dengan ekspor Accurate. */
  "accurate",
  "advances",
  /* Token API — kredensial mesin per PT (issue #389). */
  "api-tokens",
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
  /* Dokumen biaya impor (#495 butir 1). */
  "landed-costs",
  "ledger",
  /* Impor Data Awal (#381) — pelanggan/pemasok/barang dari berkas. */
  "master",
  "notifications",
  "payables",
  "periods",
  "permissions",
  "purchases",
  "receivables",
  "recurring",
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
/**
 * BERANDA BUKU — jalur APLIKASI-nya, bukan alamat kanoniknya.
 *
 * Alamat kanonik beranda sebuah PT adalah AKAR perusahaannya:
 * `/t/{tenant}/{company}`, tanpa segmen apa pun sesudahnya. Itu benar secara
 * makna dan bukan sekadar lebih pendek — akar sebuah perusahaan MEMANG
 * berandanya, persis seperti `/` adalah beranda situs. Ia tidak butuh kata
 * benda karena ia tidak sedang membedakan dirinya dari saudara-saudaranya
 * (`/customers`, `/invoices`, `/reports`); ia wadah yang memuat mereka.
 *
 * Tapi string `"/dashboard"` TIDAK bisa ikut dihapus, dan itu yang paling mudah
 * terlewat: ia bukan hanya URL, melainkan **kunci identitas** di empat tabel
 * yang tidak tahu apa-apa tentang tenant — `nav.ts` (menu mana yang menyala,
 * lewat `activeNavHref`), `tours.ts` (tur mana yang berlaku), `docs.ts`
 * (`navHrefs`), dan Aksi Cepat. Tabel-tabel itu ditulis dalam jalur APLIKASI
 * karena slug tenant baru diketahui saat permintaan berjalan.
 *
 * Karena itu bentuknya dua, dan pemetaannya dikunci di DUA TITIK di berkas ini
 * saja — `tenantPath()` untuk arah maju, `parseTenantPath()` untuk arah balik.
 * Di luar keduanya, seluruh aplikasi tetap menyebut `"/dashboard"` seperti
 * sebelumnya dan tidak perlu tahu apa pun tentang perubahan ini.
 */
export const COMPANY_HOME_PATH = "/dashboard";

export function tenantPath(tenantSlug: string, companySlug: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  /* Beranda = akar perusahaan. Arah baliknya di `parseTenantPath`; keduanya
     harus bergerak bersama, dan `tests/tenant-routes.test.ts` menguncinya. */
  if (suffix === COMPANY_HOME_PATH) {
    return `${TENANT_ROUTE_PREFIX}/${tenantSlug}/${companySlug}`;
  }
  return `${TENANT_ROUTE_PREFIX}/${tenantSlug}/${companySlug}${suffix}`;
}

/**
 * SLUG PERUSAHAAN YANG DICADANGKAN (issue #346).
 *
 * ══ SATU NAMA, DAN KENAPA HANYA SATU ══════════════════════════════════════
 * Awalan `/t/` ADA supaya slug pelanggan tidak pernah berebut ruang nama
 * dengan jalur akar — alasannya di kepala berkas ini. Mencadangkan daftar
 * panjang kata terlarang karena itu justru MELAWAN rancangan itu, dan setiap
 * kata yang dicadangkan tanpa sebab adalah nama PT yang ditolak tanpa sebab.
 *
 * Yang benar-benar istimewa cuma satu: nilai `COMPANY_HOME_PATH`, sebab
 * `tenantPath()` dan `parseTenantPath()` memetakannya secara khusus. PT yang
 * memakainya tidak lagi RUSAK sejak #343 — pantulannya mustahil berputar apa
 * pun slug-nya — tapi alamatnya terbaca sebagai teka-teki oleh manusia
 * (`/t/acme/dashboard/dashboard` adalah alamat lama beranda PT `dashboard`),
 * dan nama itu tidak dibutuhkan siapa pun sebagai nama PT.
 *
 * ⚠ DITURUNKAN, tidak diketik ulang. Daftar yang mengeja `"dashboard"` sendiri
 * akan diam-diam meleset pada hari `COMPANY_HOME_PATH` berganti nama — dan
 * melesetnya tidak berbunyi: yang tersisa adalah cadangan atas nama yang sudah
 * tidak istimewa, sementara nama yang baru istimewa bebas dipilih.
 */
export const RESERVED_COMPANY_SLUGS: readonly string[] = [COMPANY_HOME_PATH.slice(1)];

/**
 * Apakah slug ini dicadangkan?
 *
 * Dipanggil dari TIGA jalan lahirnya sebuah PT, dan itu bukan pengulangan yang
 * bisa dihapus: `companyCreateSchema` menjaga formulir dan `/api/companies`,
 * tetapi `scripts/create-company.ts` dan `scripts/adopt-existing-company.ts`
 * memvalidasi slug dengan regex mereka sendiri — aturan yang hanya hidup di
 * zod tidak akan pernah dilihat keduanya.
 */
export function isReservedCompanySlug(slug: string): boolean {
  return RESERVED_COMPANY_SLUGS.includes(slug.trim().toLowerCase());
}

/**
 * ALAMAT LAMA beranda buku — `/t/{tenant}/{company}/dashboard` — atau `null`.
 *
 * ══ KENAPA INI BUKAN PEKERJAAN `parseTenantPath` (issue #343) ══════════════
 * Menjawabnya dari `parseTenantPath().rest` TIDAK BISA, dan pernah dicoba:
 * fungsi itu sengaja MENORMALKAN akar perusahaan menjadi `COMPANY_HOME_PATH`,
 * jadi `rest === "/dashboard"` benar untuk DUA jalur yang berbeda —
 * `/t/acme/pusat/dashboard` (alamat lama, memang harus dipantulkan) dan
 * `/t/acme/pusat` (akar, sudah kanonik). Normalisasi itu benar dan tidak boleh
 * dicabut; yang salah adalah memakainya untuk pertanyaan ini.
 *
 * Penjaga tambahan `pathname.endsWith("/dashboard")` memisahkan keduanya —
 * sampai SLUG PERUSAHAANNYA SENDIRI bernama `dashboard`. Untuk
 * `/t/acme/dashboard` sisanya kosong (→ dinormalkan) DAN akhirannya cocok
 * (karena yang cocok adalah slug-nya), sehingga tujuan pantulan dihitung sama
 * persis dengan asalnya: 307 ke diri sendiri, tanpa henti, dan seluruh buku PT
 * itu tidak bisa dibuka. `companyCreateSchema` menerima `dashboard` sebagai
 * slug yang sah, jadi ini bukan bentuk yang mustahil lahir.
 *
 * Karena itu pertanyaannya dijawab dari SEGMEN MENTAH: tepat lima segmen,
 * dengan `dashboard` benar-benar TERTULIS di posisi kelima. Hasilnya tujuan
 * selalu berjumlah empat segmen sementara asalnya lima — berputar menjadi
 * mustahil karena BENTUKNYA, bukan karena ada penjaga kedua yang mengintip.
 */
export function legacyCompanyHomePath(
  pathname: string
): { tenantSlug: string; companySlug: string } | null {
  // ["", "t", tenant, company, "dashboard"] — tepat lima, tidak lebih.
  const parts = pathname.split("/");
  if (parts.length !== 5) return null;
  if (parts[1] !== TENANT_ROUTE_PREFIX.slice(1)) return null;
  if (`/${parts[4]}` !== COMPANY_HOME_PATH) return null;

  const tenantSlug = parts[2];
  const companySlug = parts[3];
  if (!isValidSlug(tenantSlug) || !isValidSlug(companySlug)) return null;
  return { tenantSlug, companySlug };
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
  /*
   * Akar perusahaan → `"/dashboard"`, bukan `"/"`. Arah balik dari
   * `tenantPath`; lihat catatan `COMPANY_HOME_PATH`.
   *
   * `"/"` akan salah dua kali: ia jalur halaman PENDARATAN pemasaran, dan tak
   * satu pun tabel jalur-aplikasi (menu, tur, docs, Aksi Cepat) mengenalnya —
   * jadi beranda buku akan diam-diam berhenti menyalakan butir menunya.
   */
  return { tenantSlug, companySlug, rest: rest ? `/${rest}` : COMPANY_HOME_PATH };
}
