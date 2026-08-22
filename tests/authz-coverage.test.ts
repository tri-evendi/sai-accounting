/**
 * Cakupan penjaga otorisasi (audit RBAC fase 2).
 *
 * Aturan yang dijaga: TIDAK ADA halaman aplikasi atau API route yang lolos
 * tanpa deklarasi izin — inilah "deny-by-default yang bisa dibuktikan".
 * Halaman memakai `requirePagePermission`, route memakai `requireApiPermission`;
 * penjaga generasi lama (daftar peran) tidak boleh muncul lagi di titik pakai.
 * Pengecualian didaftar EKSPLISIT di bawah beserta alasannya.
 *
 * ── Kenapa lebih dari satu grup rute (issue #103) ──────────────────────────
 * Penjaga ini dulu hanya menelusuri `(dashboard)`, karena di situlah semua
 * halaman berizin tinggal. Sejak wizard penyiapan pindah ke grup `(setup)`
 * demi kerangkanya sendiri, asumsi itu tidak lagi benar — dan grup rute TIDAK
 * mengubah URL, jadi halaman yang "pindah keluar" dari penjaga ini tidak
 * meninggalkan jejak apa pun di URL yang bisa memperingatkan siapa pun.
 * Karena itu daftarnya eksplisit di `GUARDED_PAGE_DIRS`: menambah grup rute
 * baru yang berisi halaman berizin berarti menambahkannya DI SINI juga.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * `src/app` sejak #399 punya DUA root layout: `(app)` (seluruh aplikasi
 * bersesi + dokumentasi) dan `(marketing)` (`/`, `/pricing`). Semua grup rute
 * yang dijaga di berkas ini hidup di bawah `(app)`, jadi `APP_DIR` menunjuk ke
 * sana dan kunci-kunci relatif di bawah (`(auth)/…`, `(tenant)/…`) tidak
 * berubah. `APP_ROOT` hanya dipakai inventaris tingkat atas dan grup pemasaran.
 */
const APP_ROOT = join(__dirname, "..", "src", "app");
const APP_DIR = join(APP_ROOT, "(app)");
const API_DIR = join(APP_ROOT, "api");

/**
 * Grup rute yang halamannya WAJIB mendeklarasikan izin. Jalurnya relatif
 * terhadap `src/app`, dan itu pula bentuk kunci `PAGE_EXCEPTIONS` di bawah.
 *
 * `(auth)` sengaja TIDAK di sini: halaman di grup itu (masuk, ganti kata sandi,
 * "belum disiapkan", "fitur belum aktif") adalah keadaan PRA-aplikasi yang
 * justru tidak boleh memanggil `requirePagePermission()` — penjaga yang sama
 * akan memantulkannya ke dirinya sendiri tanpa henti.
 */
const GUARDED_PAGE_GROUPS = ["(dashboard)", "(setup)"];

/**
 * Grup rute TINGKAT TENANT (issue #135): halamannya wajib memanggil
 * `requireTenantPagePermission` — penjaga yang bekerja TANPA perusahaan aktif.
 * Sengaja dipisah dari `GUARDED_PAGE_GROUPS`: memakai penjaga perusahaan di
 * sini justru salah (ayam-dan-telur #135), dan sebaliknya penjaga tenant tidak
 * boleh menggantikan penjaga perusahaan di dasbor. Kedua himpunan kunci izinnya
 * saling lepas, jadi salah matriks sudah ditolak `tsc`; tes ini menjaga yang
 * tak terlihat kompiler — halaman TANPA penjaga sama sekali.
 */
const TENANT_PAGE_GROUPS = ["(tenant)"];

/**
 * Grup rute BIDANG OPERATOR (issue #154): halamannya wajib memanggil
 * `requireOperatorPage` — penjaga bidang yang TERPISAH dari penjaga pelanggan.
 * Sengaja bukan `GUARDED_PAGE_GROUPS` maupun `TENANT_PAGE_GROUPS`: operator
 * bukan pelanggan, tidak ada di tabel `users`, dan memakai penjaga pelanggan
 * di sini akan menyeret matriks izin pelanggan ke bidang yang justru dibuat
 * untuk berada di luarnya. Sebaliknya penjaga operator tidak boleh muncul di
 * halaman pelanggan mana pun.
 */
const OPERATOR_PAGE_GROUPS = ["(operator)"];

/**
 * Halaman bidang operator yang sah TANPA `requireOperatorPage`, beserta
 * alasannya — pemanggilnya justru belum bersesi.
 */
const OPERATOR_PAGE_EXCEPTIONS = new Set([
  // Halaman masuk bidang operator: yang membukanya belum punya sesi operator,
  // jadi penjaga sesi akan memantulkannya ke dirinya sendiri. Ia tetap menjaga
  // diri lewat `operatorPlaneViolation()` — pemeriksaan host + daftar IP yang
  // sama, yang gagal-TERTUTUP bila `OPERATOR_HOST` tidak diset.
  "(operator)/operator/login/page.tsx",
]);

/**
 * Grup rute yang halamannya SAH tanpa penjaga izin, beserta alasannya —
 * pasangan eksplisit dari daftar-daftar berpenjaga di atas, dipakai tes
 * "inventaris grup rute" di bawah (issue #156).
 *
 * `(auth)`: keadaan PRA-aplikasi (masuk, ganti kata sandi, pilih perusahaan,
 * layar penjelasan) — memanggil penjaga izin di sana justru memantul tanpa
 * henti (lihat komentar `GUARDED_PAGE_GROUPS`).
 *
 * ── Untuk #154/#155 (konsol operator) dan #157 (rute ber-slug tenant) ──────
 * Grup rute BARU apa pun membuat tes inventaris MERAH sampai didaftarkan:
 *   • #154: tambahkan `"(operator)"` ke daftar grup BARU miliknya sendiri
 *     (mis. `OPERATOR_PAGE_GROUPS`) + satu describe yang mewajibkan penjaga
 *     operator di setiap halamannya — meniru pola describe `(tenant)` di
 *     bawah; JANGAN memasukkannya ke daftar tanpa-penjaga ini.
 *   • #157: grup baru berisi halaman ber-izin perusahaan cukup ditambahkan ke
 *     `GUARDED_PAGE_GROUPS`; yang ber-izin tenant ke `TENANT_PAGE_GROUPS`.
 */
const UNGUARDED_PAGE_GROUPS = ["(auth)"];

/**
 * Grup rute PUBLIK — dokumentasi sistem (issue #300).
 *
 * Sengaja BUKAN `UNGUARDED_PAGE_GROUPS`. Daftar itu berarti "sah tanpa penjaga
 * izin"; grup ini menyatakan sesuatu yang lebih keras dan yang benar-benar
 * dibuktikan describe-nya sendiri di bawah: halaman di dalamnya **tidak boleh
 * memanggil penjaga apa pun, tidak boleh menyentuh sesi, dan tidak boleh
 * menyentuh Prisma**. Publik di sini adalah SIFAT, bukan pengecualian.
 *
 * Kenapa itu perlu dinyatakan: sebagian pertanyaan yang paling sering
 * ditanyakan lahir persis ketika orang TIDAK BISA masuk ("paket mana yang punya
 * multi-PT", "kenapa akun saya ditolak"). Sebuah `requirePagePermission` yang
 * tak sengaja masuk ke sini akan memantulkan justru pembaca yang halamannya
 * dibuat untuknya — dan pantulan itu terlihat seperti halaman yang bekerja.
 *
 * Pasangannya di runtime adalah `isPublicPath` di `src/proxy.ts`, yang
 * melepaskan subpohon `/docs` lewat `isDocsPath()`; tanpa keduanya, salah satu
 * saja sudah cukup membuat halamannya tidak terbaca tanpa sesi.
 */
const PUBLIC_PAGE_GROUPS = ["(docs)"];

/**
 * Root layout PEMASARAN (issue #399) — di luar `(app)`, langsung di bawah
 * `src/app`. Halamannya publik dengan sifat yang sama kerasnya dengan `(docs)`
 * (tanpa penjaga, tanpa Prisma), dan daftarnya TERTUTUP: setiap halaman
 * dipetakan ke jalur URL persis yang wajib dilepaskan `isPublicPath`.
 */
const MARKETING_GROUPS = ["(marketing)"];
const MARKETING_PAGES = new Map([
  ["(marketing)/page.tsx", "/"],
  ["(marketing)/pricing/page.tsx", "/pricing"],
]);

/** Halaman yang sah TANPA requirePagePermission, beserta alasannya. */
const PAGE_EXCEPTIONS = new Set([
  // Beranda terbuka untuk semua peran, jadi tidak ada satu izin yang bisa ia
  // deklarasikan. Ia menjaga diri dengan auth() + `enterCompanyFromRoute`
  // (konteks perusahaan dari JALUR, keanggotaan diverifikasi permintaan ini,
  // gagal = 404) dan menyusun isinya per peran di server.
  "(dashboard)/t/[tenantSlug]/[companySlug]/page.tsx",
  // `/dashboard` TELANJANG (issue #157): bukan halaman, melainkan pengarah.
  // Tidak ada query di dalamnya — hanya auth() lalu `resolvePostLoginPath`.
  // Ia tinggal di jalur lama karena `/dashboard` adalah tujuan bawaan seluruh
  // aplikasi DAN karena proxy tidak bisa memantulkan token tanpa slug: yang
  // belum memilih PT, yang belum punya PT, dan sesi terbitan sebelum #157
  // justru rombongan yang paling butuh jawaban benar.
  "(dashboard)/dashboard/page.tsx",
  // Kotak masuk pemberitahuan: terbuka untuk SETIAP peran — semua orang berhak
  // membaca kabar yang ditujukan kepadanya — jadi tak ada satu izin yang bisa
  // ia deklarasikan. Menjaga diri dengan auth() + `enterCompanyFromRoute`, pola
  // yang sama dengan beranda. Isinya milik PENGGUNA, bukan perusahaan.
  "(dashboard)/t/[tenantSlug]/[companySlug]/notifications/page.tsx",
]);

/**
 * Route API bertingkat TENANT (issue #135): wajib `requireTenantApiPermission`.
 * Setiap permukaan tenant BARU (penagihan, undangan, pengaturan tenant) wajib
 * didaftarkan di sini — tanpa ini permukaan penagihan lahir tanpa pagar.
 */
const TENANT_API_ROUTES = new Set([
  // Membuat perusahaan = kewenangan tenant; pemilik tenant tanpa satu pun PT
  // adalah pemanggil yang sah, jadi penjaga perusahaan tidak bisa dipakai.
  "companies/route.ts",
  // Undangan staf (issue #139): mengundang orang ke tenant = kewenangan tenant
  // (`tenant.member.invite`, owner/admin) — bukan `user.manage` di salah satu
  // PT. PT tujuan dipakai sebagai KONTEKS (validasi peran, jejak audit) dan
  // dibuktikan milik tenant pemanggil di dalam route-nya.
  "tenant/invitations/route.ts",
  "tenant/invitations/[id]/route.ts",
  // Penagihan pelanggan (issue #141): instruksi bayar & profil NPWP —
  // kewenangan tenant `tenant.billing` (owner, kontraktual), bukan peran PT.
  "tenant/billing/pay/route.ts",
  "tenant/billing/profile/route.ts",
  // Perpindahan paket SWALAYAN: pelanggan menaikkan/menurunkan paketnya sendiri
  // (kuota, prorata, dan penolakan turun-paket ditimbang di server). Kewenangan
  // kontraktual `tenant.billing` — owner, bukan peran di sebuah PT.
  "tenant/billing/plan-change/route.ts",
  // Kepatuhan (issue #142): ekspor seluruh data tenant & permintaan
  // penghapusan adalah hak PELANGGAN (owner tenant), berdiri di atas semua
  // PT-nya — dan ekspor wajib tetap bekerja saat seluruh PT hanya-baca
  // (suspended), keadaan yang penjaga perusahaan justru tolak.
  "tenant/export/route.ts",
  "tenant/deletion-request/route.ts",
]);

/** Route yang sah TANPA requireApiPermission, beserta alasannya. */
const API_EXCEPTIONS = new Set([
  "auth/[...nextauth]/route.ts", // handler NextAuth
  "auth/change-password/route.ts", // self-scoped: auth() + target selalu diri sendiri
  // publik (issue #136): alur atur-ulang kata sandi berjalan justru TANPA
  // sesi. Kredensialnya token sekali-pakai ter-hash; jawabannya seragam
  // (anti-enumerasi) dan keduanya dibatasi laju per-IP/per-email.
  "auth/forgot-password/route.ts",
  "auth/reset-password/route.ts",
  // publik (issue #139): penerimaan undangan berjalan justru TANPA sesi —
  // penerimanya belum punya akun. Kredensialnya token sekali-pakai ter-hash
  // berbatas waktu; dibatasi laju per-IP; kegagalan token dijawab seragam.
  "auth/accept-invitation/route.ts",
  // publik (issue #138): pendaftaran mandiri & verifikasi email adalah
  // keadaan PRA-akun. Jawaban /register seragam (anti-enumerasi), verifikasi
  // memakai token acak sekali-pakai lewat POST (bukan GET — pemindai tautan),
  // keduanya dibatasi laju PERSISTEN (rate-limit-persistent.ts), dan TIDAK
  // ADA basis data yang lahir sebelum verifikasi + klik "buat perusahaan".
  "auth/register/route.ts",
  "auth/verify-email/route.ts",
  // publik (issue #141): webhook gerbang pembayaran — pengirimnya server
  // Midtrans, bukan pengguna. Kredensialnya tanda tangan SHA-512 atas isi
  // notifikasi (diverifikasi SEBELUM query apa pun; 503 fail-closed bila kunci
  // tidak terpasang di produksi); idempoten lewat UNIQUE payments.gateway_ref.
  "billing/webhook/route.ts",
  // self-scoped: OTENTIKASI ULANG sebelum masuk ke buku sebuah PT (kunci
  // buku). Tidak boleh memakai `requireApiPermission` — penjaga itu MEMANGGIL
  // gerbang kunci buku, jadi route yang membuka kunci akan menuntut kunci yang
  // belum ada. Penjaganya ditulis di dalamnya dan lebih ketat daripada sekadar
  // izin: sesi + KEANGGOTAAN di PT itu + bcrypt atas sandi pemanggil sendiri,
  // dibatasi laju per-pengguna dengan anggaran `RATE_LIMITS.login`, dan setiap
  // kegagalan dijawab satu kalimat yang sama (anti-enumerasi).
  "company-unlock/route.ts",
  "user/accountant-mode/route.ts", // self-scoped: preferensi tampilan milik sendiri
  // self-scoped: kotak masuk MILIK PEMANGGIL SENDIRI. `userId` selalu dari
  // sesi, tak pernah dari permintaan. Tidak boleh memakai requireApiPermission
  // — penjaga itu menuntut konteks perusahaan, sedangkan pemberitahuan yang
  // paling penting justru berbicara tentang perusahaan yang belum siap dibuka.
  "user/notifications/route.ts",
  // self-scoped (issue #73): auth() + hanya izin efektif PERAN SENDIRI, untuk
  // penyaringan menu client — tampilan saja, halaman tujuannya tetap dijaga.
  "user/permissions/route.ts",
  // self-scoped (issue #104): daftar perusahaan MILIK PEMANGGIL SENDIRI, dipakai
  // pemilih & penukar perusahaan. Tidak boleh memakai requireApiPermission —
  // penjaga itu menuntut konteks perusahaan, sedangkan route ini justru dipanggil
  // saat perusahaan BELUM dipilih.
  "user/companies/route.ts",
  "health/route.ts", // health probe publik (container/load-balancer)
  // publik: hanya NAMA & ALAMAT perusahaan — keduanya sudah tercetak di halaman
  // masuk sebelum siapa pun log in, dan di setiap dokumen yang dikirim ke
  // pelanggan. Identitas pajak (NPWP dll.) TIDAK di sini; itu tetap lewat
  // `company-settings/route.ts` yang dijaga `company_setting.manage`.
  "company/identity/route.ts",
]);

function filesNamed(dir: string, filename: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesNamed(full, filename);
    return entry.name === filename ? [full] : [];
  });
}

/** Semua berkas sumber (.ts/.tsx) di bawah sebuah direktori. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("inventaris grup rute — permukaan baru WAJIB mendaftar (issue #156)", () => {
  it("setiap direktori di bawah src/app terdaftar di salah satu himpunan di atas", () => {
    // Penutup lubang yang membuat daftar-daftar di atas bisa dilewati begitu
    // saja: grup rute baru — `(operator)` milik #154, grup ber-slug milik
    // #157, atau grup apa pun sesudahnya — TIDAK tersentuh satu pun telusur
    // sampai seseorang mendaftarkannya, dan grup rute tidak mengubah URL, jadi
    // halaman tanpa penjaga di dalamnya tidak meninggalkan jejak. Tes ini
    // membuat "lupa mendaftar" mustahil sunyi: direktori yang tak dikenal =
    // merah, dan yang mendaftarkannya wajib memilih himpunan (berpenjaga
    // perusahaan / tenant / tanpa-penjaga beralasan / describe baru miliknya).
    const known = new Set([
      ...GUARDED_PAGE_GROUPS,
      ...TENANT_PAGE_GROUPS,
      ...OPERATOR_PAGE_GROUPS,
      ...UNGUARDED_PAGE_GROUPS,
      ...PUBLIC_PAGE_GROUPS,
    ]);
    const unregistered = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !known.has(name));
    expect(unregistered).toEqual([]);
  });

  it("tingkat atas src/app hanya berisi dua root layout + api — akar baru wajib mendaftar", () => {
    /*
     * Sejak #399 root layout ada dua, dan sebuah root layout KETIGA (grup baru
     * langsung di bawah `src/app` dengan `layout.tsx` sendiri) berdiri di luar
     * semua telusur di berkas ini — persis lubang yang ditutup tes di atas,
     * satu tingkat lebih tinggi. Yang boleh: `(app)`, `(marketing)`, `api`.
     */
    const known = new Set([
      "api", // route API — cakupannya dijaga describe "cakupan penjaga API route"
      "(app)", // root layout aplikasi — grup-grupnya diinventarisasi tes di atas
      ...MARKETING_GROUPS,
    ]);
    const unregistered = readdirSync(APP_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !known.has(name));
    expect(unregistered).toEqual([]);
  });
});

describe("permukaan PUBLIK: halaman pemasaran (issue #399)", () => {
  const pages = MARKETING_GROUPS.flatMap((group) =>
    existsSync(join(APP_ROOT, group)) ? filesNamed(join(APP_ROOT, group), "page.tsx") : []
  ).map((f) => relative(APP_ROOT, f).split(sep).join("/"));

  it("grup (marketing) ada dan berisi TEPAT halaman yang didaftar", () => {
    // Daftar tertutup, bukan "apa pun di dalamnya": halaman pemasaran baru
    // harus disebut namanya di sini DAN di `isPublicPath` (proxy.ts) — kalau
    // tidak, proxy memantulkannya ke /login dan halaman publiknya tidak
    // pernah publik.
    expect(pages.sort()).toEqual([...MARKETING_PAGES.keys()].sort());
  });

  it("setiap halaman pemasaran dilepaskan proxy lewat jalur PERSISnya", () => {
    const proxy = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    for (const jalur of MARKETING_PAGES.values()) {
      expect(proxy, `isPublicPath tidak menyebut "${jalur}"`).toContain(`pathname === "${jalur}"`);
    }
  });

  it("halaman pemasaran tidak memanggil penjaga izin mana pun dan tidak menyentuh Prisma", () => {
    // Pembacanya BELUM punya akun. `auth()` boleh — hanya untuk memantulkan
    // yang sudah bersesi ke /dashboard — penjaga izin tidak: ia akan
    // memantulkan justru orang yang halaman ini dibuat untuknya.
    for (const rel of pages) {
      const src = readFileSync(join(APP_ROOT, rel), "utf8");
      expect(src, `${rel} memanggil penjaga perusahaan`).not.toContain("requirePagePermission(");
      expect(src, `${rel} memanggil penjaga tenant`).not.toContain("requireTenantPagePermission(");
      expect(src, `${rel} memanggil penjaga operator`).not.toContain("requireOperatorPage(");
      expect(src, `${rel} mengimpor prisma`).not.toContain("@/lib/prisma");
    }
  });
});

describe("cakupan penjaga halaman tenant (issue #135)", () => {
  const pages = TENANT_PAGE_GROUPS.flatMap((group) =>
    existsSync(join(APP_DIR, group)) ? filesNamed(join(APP_DIR, group), "page.tsx") : []
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("grup (tenant) ada dan berisi halaman — kalau kosong, tes di bawah tidak menjaga apa pun", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toContain("(tenant)/(panel)/companies/new/page.tsx");
    // Pendaratan pasca-masuk (issue #172) hidup di grup ini, dan ALAMATNYA
    // `/platform` — bukan `/tenant`, yang sejak itu hanya dipantulkan proxy.
    expect(pages).toContain("(tenant)/(panel)/platform/page.tsx");
    expect(pages).not.toContain("(tenant)/tenant/page.tsx");
  });

  it("setiap halaman tenant memakai requireTenantPagePermission — BUKAN penjaga perusahaan", () => {
    for (const rel of pages) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(src, `${rel} tanpa requireTenantPagePermission`).toContain(
        "requireTenantPagePermission("
      );
      // Penjaga perusahaan menuntut konteks perusahaan — di halaman tenant ia
      // memantulkan justru pengguna yang paling sah (pemilik tenant tanpa PT).
      expect(src, `${rel} memanggil penjaga perusahaan`).not.toContain(
        "requirePagePermission("
      );
    }
  });
});

describe("cakupan penjaga bidang operator (issue #154)", () => {
  const pages = OPERATOR_PAGE_GROUPS.flatMap((group) =>
    existsSync(join(APP_DIR, group)) ? filesNamed(join(APP_DIR, group), "page.tsx") : []
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("grup (operator) ada dan berisi halaman — kalau kosong, tes di bawah tidak menjaga apa pun", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toContain("(operator)/operator/page.tsx");
  });

  it("setiap halaman operator memakai requireOperatorPage — BUKAN penjaga pelanggan", () => {
    for (const rel of pages) {
      if (OPERATOR_PAGE_EXCEPTIONS.has(rel)) continue;
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(src, `${rel} tanpa requireOperatorPage`).toContain("requireOperatorPage(");
      // Penjaga pelanggan/tenant di bidang operator akan menyeret matriks izin
      // pelanggan ke bidang yang sengaja hidup di luarnya.
      expect(src, `${rel} memanggil penjaga perusahaan`).not.toContain("requirePagePermission(");
      expect(src, `${rel} memanggil penjaga tenant`).not.toContain(
        "requireTenantPagePermission("
      );
    }
  });

  it("halaman masuk operator menjaga dirinya sendiri lewat pemeriksaan bidang", () => {
    for (const rel of OPERATOR_PAGE_EXCEPTIONS) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(src, `${rel} tanpa operatorPlaneViolation`).toContain("operatorPlaneViolation(");
    }
  });

  it("tidak ada route API di bawah (operator) — masuk/keluar lewat server action", () => {
    // Disengaja (#154): permukaan API operator di `src/app/api` akan tercakup
    // penjaga izin PELANGGAN, yang justru bidang yang salah.
    const group = join(APP_DIR, "(operator)");
    const routes = existsSync(group) ? filesNamed(group, "route.ts") : [];
    expect(routes).toEqual([]);
  });
});

describe("permukaan PUBLIK: dokumentasi sistem (issue #300)", () => {
  const pages = PUBLIC_PAGE_GROUPS.flatMap((group) =>
    existsSync(join(APP_DIR, group)) ? filesNamed(join(APP_DIR, group), "page.tsx") : []
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("grup (docs) ada dan berisi halaman — kalau kosong, tes di bawah tidak menjaga apa pun", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toContain("(docs)/docs/page.tsx");
    expect(pages).toContain("(docs)/docs/[...slug]/page.tsx");
  });

  it("tidak satu pun halamannya memanggil penjaga — publik adalah SIFAT, bukan kelalaian", () => {
    for (const rel of pages) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      for (const penjaga of [
        "requirePagePermission(",
        "requireTenantPagePermission(",
        "requireOperatorPage(",
        "requirePageSession(",
        "requireAccountantPage(",
      ]) {
        expect(src, `${rel} memanggil ${penjaga} di permukaan publik`).not.toContain(penjaga);
      }
    }
  });

  it("tidak menyentuh sesi maupun basis data", () => {
    /*
     * Halaman publik yang memanggil `auth()` tidak GAGAL — ia hanya menerima
     * `null` dan bekerja seperti biasa, sampai seseorang menambahkan satu
     * cabang yang memakainya. Prisma lebih buruk lagi: ia menuntut konteks
     * perusahaan yang di sini memang tidak ada, dan aturan pertama
     * docs/MULTI-COMPANY.md menuntut keadaan itu MELEMPAR.
     */
    for (const rel of pages) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(src, `${rel} mengimpor auth`).not.toContain("@/lib/auth");
      expect(src, `${rel} mengimpor prisma`).not.toContain("@/lib/prisma");
    }
  });

  it("tidak ada route API di bawah (docs) — permukaan ini hanya membaca berkas sumber", () => {
    const group = join(APP_DIR, "(docs)");
    const routes = existsSync(group) ? filesNamed(group, "route.ts") : [];
    expect(routes).toEqual([]);
  });
});

describe("cakupan penjaga halaman aplikasi", () => {
  const pages = GUARDED_PAGE_GROUPS.flatMap((group) =>
    filesNamed(join(APP_DIR, group), "page.tsx")
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("menemukan halaman untuk diperiksa", () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it("setiap grup rute yang didaftar benar-benar ada dan berisi halaman", () => {
    // Penjaga bagi penjaga: grup yang salah tulis (atau grup yang dihapus)
    // membuat telusurnya kosong, dan tes di bawah akan lulus tanpa memeriksa
    // apa pun. Wizard penyiapan disebut namanya karena justru dialah alasan
    // daftar ini ada (issue #103).
    for (const group of GUARDED_PAGE_GROUPS) {
      expect(existsSync(join(APP_DIR, group)), `grup rute ${group} tidak ada`).toBe(true);
      expect(
        pages.some((rel) => rel.startsWith(`${group}/`)),
        `grup rute ${group} tidak berisi satu pun page.tsx`
      ).toBe(true);
    }
    expect(pages).toContain("(setup)/t/[tenantSlug]/[companySlug]/setup/page.tsx");
  });

  it("setiap halaman mendeklarasikan izinnya (requirePagePermission)", () => {
    const offenders = pages
      .filter((rel) => !PAGE_EXCEPTIONS.has(rel))
      .filter((rel) => !readFileSync(join(APP_DIR, rel), "utf8").includes("requirePagePermission("));
    expect(offenders).toEqual([]);
  });

  it("penjaga daftar-peran generasi lama tidak muncul lagi di halaman", () => {
    const offenders = pages.filter((rel) => {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      return src.includes("requirePageSession(") || src.includes("requireAccountantPage(");
    });
    expect(offenders).toEqual([]);
  });
});

/**
 * Route `/api/v1/…` — API PUBLIK ber-token (issue #389, F-10).
 *
 * Ia tidak memakai `requireApiPermission`, dan itu bukan kelalaian: penjaga
 * pelanggan membaca SESI (cookie, JWT, pencabutan sesi, wajib-ganti-kata-sandi),
 * dan tidak satu pun berlaku bagi mesin. Yang dipakai bersama justru bagian yang
 * penting — keputusan izinnya lewat `canEffective`, matriks yang sama dengan
 * manusia, termasuk modul mati (#99) dan override per perusahaan (#73).
 *
 * Yang dijaga di bawah: setiap route v1 memakai `requireApiToken`, dan TIDAK
 * PERNAH menyentuh penjaga sesi. Sebuah route v1 yang diam-diam menerima cookie
 * adalah endpoint publik yang bisa dipanggil dari peramban korban (CSRF), dan
 * itu kelas kerentanan yang tidak akan terlihat di satu pun tes fungsional.
 */
/**
 * Route v1 yang sah TANPA token, beserta alasannya.
 *
 * Daftar ini sengaja dibuat sebagai DAFTAR, bukan pola: sebuah pengecualian
 * yang harus disebut namanya tidak bisa bertambah diam-diam.
 */
const V1_PUBLIC = new Set([
  /*
   * Spesifikasi OpenAPI. Yang dipulangkan adalah BENTUK API-nya — nama
   * endpoint, nama medan, aturan paginasi — bukan satu byte pun data
   * perusahaan. Menuntut token untuk membacanya berarti integrator harus sudah
   * punya kredensial sebelum bisa tahu apa yang bisa dilakukannya, dan itu
   * urutan yang terbalik: orang membaca dokumentasi untuk MEMUTUSKAN apakah
   * akan memakainya.
   *
   * Bentuk API bukan rahasia; datanya yang rahasia, dan itu dijaga
   * `requireApiToken` di setiap endpoint yang memulangkannya.
   */
  "v1/openapi.json/route.ts",
]);

const V1_ROUTES = new Set(
  filesNamed(API_DIR, "route.ts")
    .map((f) => relative(API_DIR, f))
    .filter((rel) => rel.startsWith("v1/") && !V1_PUBLIC.has(rel))
);

describe("cakupan penjaga API route", () => {
  const routes = filesNamed(API_DIR, "route.ts");

  it("menemukan route untuk diperiksa", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("setiap route mendeklarasikan izinnya (requireApiPermission)", () => {
    const offenders = routes
      .map((f) => relative(API_DIR, f))
      .filter(
        (rel) =>
          !API_EXCEPTIONS.has(rel) &&
          !TENANT_API_ROUTES.has(rel) &&
          !V1_ROUTES.has(rel) &&
          !V1_PUBLIC.has(rel)
      )
      .filter((rel) => !readFileSync(join(API_DIR, rel), "utf8").includes("requireApiPermission("));
    expect(offenders).toEqual([]);
  });

  it("route bertingkat tenant memakai requireTenantApiPermission — BUKAN penjaga perusahaan (issue #135)", () => {
    expect(TENANT_API_ROUTES.size).toBeGreaterThan(0);
    for (const rel of TENANT_API_ROUTES) {
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src, `${rel} tanpa requireTenantApiPermission`).toContain(
        "requireTenantApiPermission("
      );
      // `requireApiPermission(` juga cocok dengan nama panjangnya, jadi cek
      // impornya: route tenant tidak boleh menyentuh penjaga perusahaan.
      expect(src, `${rel} mengimpor penjaga perusahaan`).not.toContain("@/lib/auth-guard");
    }
  });

  it("route v1 yang PUBLIK tidak memulangkan data perusahaan", () => {
    /*
     * Pengecualian di `V1_PUBLIC` hanya sah selama ia benar-benar tidak
     * menyentuh buku. Sebuah endpoint publik yang suatu hari menambahkan satu
     * kueri Prisma adalah kebocoran yang tidak akan terlihat di satu pun tes
     * fungsional — jawabannya tetap 200, isinya saja yang bertambah.
     */
    for (const rel of V1_PUBLIC) {
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src, `${rel} menyentuh basis data perusahaan`).not.toContain("@/lib/prisma");
      expect(src, `${rel} menyentuh basis data kendali`).not.toContain("@/lib/control-db");
    }
  });

  it("route v1 memakai requireApiToken — dan TIDAK PERNAH penjaga sesi", () => {
    expect(V1_ROUTES.size).toBeGreaterThan(0);
    for (const rel of V1_ROUTES) {
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src, `${rel} tanpa requireApiToken`).toContain("requireApiToken(");
      // Menerima cookie di endpoint publik = bisa dipanggil dari peramban
      // korban (CSRF), dan itu tidak akan terlihat di satu pun tes fungsional.
      expect(src, `${rel} menyentuh penjaga sesi`).not.toContain("@/lib/auth-guard");
      expect(src, `${rel} membaca sesi`).not.toContain("@/lib/auth");
    }
  });

  it("requireAuth generasi lama tidak muncul lagi di route", () => {
    const offenders = routes
      .map((f) => relative(API_DIR, f))
      .filter((rel) => readFileSync(join(API_DIR, rel), "utf8").includes("requireAuth("));
    expect(offenders).toEqual([]);
  });
});

/**
 * Konteks perusahaan TIDAK dibaca dari sesi (issue #156 — pagar jalan #157).
 *
 * Aturannya: halaman & route menerima konteks perusahaan DARI PENJAGANYA
 * (`requirePagePermission` dari URL, `requireApiPermission` dari permintaan),
 * bukan membaca `session.user.companyId` sendiri.
 * Tanpa pagar ini, migrasi #157 (konteks dari slug URL, bukan dari sesi) akan
 * bocor balik satu berkas demi satu berkas selama berminggu-minggu — dan
 * pembaca sesi yang lolos adalah persis jalur yang menulis ke buku PT yang
 * salah tanpa galat dan tanpa jejak.
 *
 * Pengecualiannya BERALASAN, bukan sunyi — dan begitu #157 memindahkan sebuah
 * entri ke konteks-dari-penjaga, tes "tidak basi" di bawah memaksa entrinya
 * dihapus dari daftar ini.
 */
describe("konteks perusahaan tidak datang dari sesi (issue #156)", () => {
  /* Menangkap `user.companyId` dan `user?.companyId` — termasuk bentuk
   * `session.user.companyId` / `session?.user?.companyId` / `token.user…`.
   * Regex, bukan parser: cukup untuk menolak pola yang dilarang ditulis; cara
   * membaca sesi yang lebih akrobatik tidak akan lolos review manusia. */
  const SESSION_COMPANY_PATTERN = /\buser\??\.companyId\b/;

  const SESSION_COMPANY_EXCEPTIONS = new Set([
    // ── grup (auth): keadaan PRA-aplikasi — belum ada penjaga yang bisa
    //    memberi konteks; companyId dipakai HANYA untuk memilih tujuan
    //    pantulan (/select-company vs /dashboard), tidak pernah untuk query.
    "(auth)/login/page.tsx",
    "(auth)/change-password/page.tsx",
    "(auth)/select-company/page.tsx", // pemilih perusahaan itu sendiri
    "(auth)/feature-inactive/page.tsx",
    "(auth)/setup-required/page.tsx",
    // `/dashboard` TELANJANG (#157): pengarah tanpa satu pun query. companyId
    // dibaca HANYA untuk memilih tujuan pantulan — dan slug jalurnya dicari ke
    // basis data, tidak ditebak dari sesi. Beranda sungguhannya sudah pindah ke
    // /t/{tenant}/{company}/dashboard dan mengambil perusahaannya dari JALUR.
    "(dashboard)/dashboard/page.tsx",
    // Self-scoped: daftar PT milik pemanggil + PT aktifnya, untuk pemilih &
    // penukar perusahaan — dipanggil justru saat lingkup BELUM ada. Sejak #158
    // "yang aktif" diambil dari PERMINTAAN lebih dulu; sesi tinggal sebagai
    // jawaban cadangan untuk /select-company dan /dashboard telanjang, yang
    // memang tidak punya perusahaan di alamatnya.
    "api/user/companies/route.ts",
    /*
     * ── Pembuatan PT (issue #339) ───────────────────────────────────────────
     * Formulir tingkat TENANT, dan pembacanya justru orang yang boleh jadi
     * belum punya satu pun perusahaan — jadi tidak ada penjaga perusahaan yang
     * bisa memberi konteks di sini, sama seperti grup `(auth)` di atas.
     *
     * Yang ditanyakan pun bukan "perusahaan mana yang sedang saya query",
     * melainkan "apakah sesi ini SUDAH menunjuk sebuah PT" — satu-satunya
     * pertanyaan yang memisahkan pendaftar baru (belum ada, ambil yang baru
     * lahir) dari orang yang sedang bekerja di PT A dan membuat PT B (jangan
     * pindahkan bukunya). Jawabannya hanya menentukan apakah
     * `update({ companyId })` dipanggil; keputusannya sendiri murni di
     * `lib/company-selection.ts`, dan angkanya tetap diperiksa ULANG ke
     * keanggotaan di server. Nol query di berkas ini.
     */
    "(tenant)/(panel)/companies/new/company-form.tsx",
  ]);

  /* Seluruh `src/app`: grup-grup di bawah `(app)` (kunci relatif terhadap
     `(app)`, seperti daftar di atas), route API, dan grup pemasaran (kunci
     relatif terhadap `src/app`). Sejak #399 `(app)` dan `api` bertetangga,
     jadi keduanya harus ditelusuri sendiri-sendiri. */
  const readers = [
    ...sourceFiles(APP_DIR).map((f) => relative(APP_DIR, f)),
    ...MARKETING_GROUPS.flatMap((group) => sourceFiles(join(APP_ROOT, group))).map((f) =>
      relative(APP_ROOT, f)
    ),
    ...sourceFiles(API_DIR).map((f) => relative(APP_ROOT, f)),
  ]
    .map((rel) => rel.split(sep).join("/"))
    .filter((rel) =>
      SESSION_COMPANY_PATTERN.test(
        readFileSync(join(rel.startsWith("api/") || rel.startsWith("(marketing)/") ? APP_ROOT : APP_DIR, rel), "utf8")
      )
    );

  it("berkas BARU yang membaca companyId dari sesi tertangkap otomatis", () => {
    expect(readers.filter((rel) => !SESSION_COMPANY_EXCEPTIONS.has(rel))).toEqual([]);
  });

  it("daftar pengecualiannya tidak basi — entri yang berhenti membaca sesi wajib dihapus", () => {
    for (const rel of SESSION_COMPANY_EXCEPTIONS) {
      expect(
        readers,
        `${rel} tidak lagi membaca companyId dari sesi — hapus dari SESSION_COMPANY_EXCEPTIONS`
      ).toContain(rel);
    }
  });
});

/**
 * Setiap panggilan ke `/api/…` MENYEBUTKAN perusahaannya (issue #158).
 *
 * `apiFetch()` menyuntikkan `x-tenant-slug`/`x-company-slug` dari ALAMAT yang
 * sedang dibuka. `fetch()` telanjang tidak — dan sejak penjaga API berhenti
 * menebak dari sesi, panggilan telanjang dari halaman bertenant tidak "diam-diam
 * salah perusahaan" melainkan DITOLAK. Tesnya tetap perlu: penolakan itu baru
 * terlihat saat seseorang menekan tombolnya, sedangkan tes ini terlihat saat
 * kodenya ditulis.
 *
 * Pengecualiannya BERALASAN: permukaan PRA-aplikasi dan permukaan TINGKAT
 * TENANT memang bekerja tanpa perusahaan — memaksa mereka mengirim lingkup
 * berarti memaksa lingkup yang tidak ada.
 */
describe("panggilan API membawa perusahaannya (issue #158)", () => {
  /** Berkas yang SAH memanggil `fetch("/api/…")` telanjang, beserta alasannya. */
  const BARE_FETCH_EXCEPTIONS = new Set([
    // Grup (auth): keadaan PRA-akun/PRA-sesi — /api/auth/* memang route publik
    // yang terdaftar di API_EXCEPTIONS di atas. Tidak ada perusahaan untuk
    // disebut, dan alamatnya pun tidak bertenant.
    "app/(app)/(auth)/accept-invitation/page.tsx",
    "app/(app)/(auth)/change-password/page.tsx",
    "app/(app)/(auth)/forgot-password/page.tsx",
    "app/(app)/(auth)/register/page.tsx",
    "app/(app)/(auth)/reset-password/page.tsx",
    "app/(app)/(auth)/verify-email/page.tsx",
    // Grup (tenant): route TINGKAT TENANT (#135) — pemilik tenant tanpa satu
    // pun PT adalah pemanggil yang sah, jadi menuntut perusahaan di sini
    // justru menutup permukaan yang dibuat untuk berdiri tanpanya.
    "app/(app)/(tenant)/(panel)/companies/new/company-form.tsx",
    "app/(app)/(tenant)/(panel)/platform/billing-actions.tsx",
    "app/(app)/(tenant)/(panel)/platform/billing/plans/plan-actions.tsx",
    "app/(app)/(tenant)/(panel)/platform/privacy-section.tsx",
    // Pembungkusnya sendiri.
    "lib/api-fetch.ts",
  ]);

  const SRC_DIR = join(__dirname, "..", "src");
  /** `fetch("/api/…")` / `fetch(`/api/…`)` — TIDAK cocok dengan `apiFetch(`. */
  const BARE_FETCH = /(?<![\w.])fetch\(["`]\/api\//;

  const offenders = sourceFiles(SRC_DIR)
    .map((f) => relative(SRC_DIR, f).split(sep).join("/"))
    .filter((rel) => BARE_FETCH.test(readFileSync(join(SRC_DIR, rel), "utf8")));

  it("tidak ada fetch() telanjang ke /api di luar daftar pengecualian", () => {
    expect(offenders.filter((rel) => !BARE_FETCH_EXCEPTIONS.has(rel))).toEqual([]);
  });

  it("daftar pengecualiannya tidak basi — berkas yang berhenti melakukannya wajib dihapus", () => {
    for (const rel of BARE_FETCH_EXCEPTIONS) {
      expect(
        offenders,
        `${rel} tidak lagi memanggil fetch() telanjang ke /api — hapus dari BARE_FETCH_EXCEPTIONS`
      ).toContain(rel);
    }
  });
});

/**
 * Route PUBLIK dan route TINGKAT TENANT tetap bekerja TANPA perusahaan
 * (issue #158).
 *
 * Aturan "setiap permintaan membawa perusahaannya" punya batas yang harus
 * ditulis, bukan diingat: webhook gerbang pembayaran dikirim server Midtrans;
 * pendaftaran & penerimaan undangan berjalan sebelum akun ada; `/api/health`
 * dipanggil load-balancer; dan `/api/tenant/*` + `/api/companies` justru dibuat
 * untuk pelanggan yang belum punya satu pun PT (#135). Menyeret mereka ke
 * aturan baru berarti menutup permukaan yang alasan keberadaannya adalah
 * berdiri tanpa perusahaan.
 */
describe("route publik & tingkat tenant tidak menuntut perusahaan (issue #158)", () => {
  const noCompanyRoutes = [...API_EXCEPTIONS, ...TENANT_API_ROUTES];

  /**
   * Route self-scoped yang SAH menyebut perusahaannya sendiri: mereka membaca
   * data PER PERUSAHAAN (izin efektif, preferensi keanggotaan, identitas), jadi
   * "tanpa penjaga izin" tidak pernah berarti "tanpa lingkup".
   */
  const SELF_SCOPED_WITH_COMPANY = new Set([
    "user/permissions/route.ts",
    "user/accountant-mode/route.ts",
    "user/companies/route.ts",
    "company/identity/route.ts",
    "tenant/invitations/route.ts",
    "tenant/invitations/[id]/route.ts",
  ]);

  it("tidak satu pun memanggil penjaga perusahaan", () => {
    for (const rel of noCompanyRoutes) {
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src, `${rel} memanggil requireApiPermission`).not.toContain("requireApiPermission(");
    }
  });

  it("dan yang benar-benar publik tidak menyentuh lingkup perusahaan sama sekali", () => {
    const publik = noCompanyRoutes.filter((rel) => !SELF_SCOPED_WITH_COMPANY.has(rel));
    expect(publik.length).toBeGreaterThan(0);
    for (const rel of publik) {
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src, `${rel} menuntut lingkup perusahaan`).not.toContain("@/lib/company-request");
      expect(src, `${rel} menuntut lingkup perusahaan`).not.toContain("@/lib/company-scope");
    }
  });
});

describe("jaring pengaman proxy", () => {
  it("src/proxy.ts ada, memverifikasi token, dan menegakkan alur ganti-kata-sandi", () => {
    const src = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    expect(src).toMatch(/export (async )?function proxy/);
    expect(src).toContain("getToken");
    expect(src).toContain("/change-password");
    expect(src).not.toMatch(/roles:\s*\[/); // tak ada daftar peran diketik manual
  });

  it("proxy TIDAK membaca matriks izin — sejak issue #73 matriksnya bisa di-override DB", () => {
    // Gerbang per-prefix dari matriks statis dihapus: override yang MENGHADIAHKAN
    // izin tidak boleh diblokir oleh salinan bawaan yang tertanam di proxy, dan
    // dokumen Next melarang proxy mengandalkan modul/global bersama (cache
    // matriks + invalidasinya tak pernah terlihat dari sana). Penegakan izin
    // sepenuhnya di requirePagePermission/requireApiPermission — dua tes cakupan
    // di atas membuktikan setiap halaman & route memanggil penjaganya.
    const src = readFileSync(join(__dirname, "..", "src", "proxy.ts"), "utf8");
    expect(src).not.toContain("rolesFor");
    expect(src).not.toContain("PERMISSION_ROLES");
    expect(src).not.toContain("@/lib/prisma");
  });
});
