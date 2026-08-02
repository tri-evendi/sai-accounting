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

const APP_DIR = join(__dirname, "..", "src", "app");
const API_DIR = join(APP_DIR, "api");

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

/** Halaman yang sah TANPA requirePagePermission, beserta alasannya. */
const PAGE_EXCEPTIONS = new Set([
  // Beranda terbuka untuk semua peran, jadi tidak ada satu izin yang bisa ia
  // deklarasikan. Ia menjaga diri dengan auth() + `enterCompanyFromRoute`
  // (konteks perusahaan dari JALUR, keanggotaan diverifikasi permintaan ini,
  // gagal = 404) dan menyusun isinya per peran di server.
  "(dashboard)/t/[tenantSlug]/[companySlug]/dashboard/page.tsx",
  // `/dashboard` TELANJANG (issue #157): bukan halaman, melainkan pengarah.
  // Tidak ada query di dalamnya — hanya auth() lalu `resolvePostLoginPath`.
  // Ia tinggal di jalur lama karena `/dashboard` adalah tujuan bawaan seluruh
  // aplikasi DAN karena proxy tidak bisa memantulkan token tanpa slug: yang
  // belum memilih PT, yang belum punya PT, dan sesi terbitan sebelum #157
  // justru rombongan yang paling butuh jawaban benar.
  "(dashboard)/dashboard/page.tsx",
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
  "user/accountant-mode/route.ts", // self-scoped: preferensi tampilan milik sendiri
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
      "api", // route API — cakupannya dijaga describe "cakupan penjaga API route"
      ...GUARDED_PAGE_GROUPS,
      ...TENANT_PAGE_GROUPS,
      ...OPERATOR_PAGE_GROUPS,
      ...UNGUARDED_PAGE_GROUPS,
    ]);
    const unregistered = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !known.has(name));
    expect(unregistered).toEqual([]);
  });
});

describe("cakupan penjaga halaman tenant (issue #135)", () => {
  const pages = TENANT_PAGE_GROUPS.flatMap((group) =>
    existsSync(join(APP_DIR, group)) ? filesNamed(join(APP_DIR, group), "page.tsx") : []
  ).map((f) => relative(APP_DIR, f).split(sep).join("/"));

  it("grup (tenant) ada dan berisi halaman — kalau kosong, tes di bawah tidak menjaga apa pun", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toContain("(tenant)/companies/new/page.tsx");
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
    expect(pages).toContain("(setup)/setup/page.tsx");
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

describe("cakupan penjaga API route", () => {
  const routes = filesNamed(API_DIR, "route.ts");

  it("menemukan route untuk diperiksa", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("setiap route mendeklarasikan izinnya (requireApiPermission)", () => {
    const offenders = routes
      .map((f) => relative(API_DIR, f))
      .filter((rel) => !API_EXCEPTIONS.has(rel) && !TENANT_API_ROUTES.has(rel))
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
 * (`requirePagePermission`/`requireApiPermission` menanamkannya lewat
 * `enterCompanyFromSession`), bukan membaca `session.user.companyId` sendiri.
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
    // penukar perusahaan — dipanggil justru saat konteks BELUM ada.
    "api/user/companies/route.ts",
    // Self-scoped: izin efektif peran sendiri untuk penyaringan menu; tanpa
    // perusahaan aktif jawabannya daftar kosong, bukan galat.
    "api/user/permissions/route.ts",
    // Route tenant (#139): PT aktif dipakai sebagai KONTEKS undangan dan
    // DIBUKTIKAN milik tenant pemanggil (companyOfTenant) sebelum dipakai.
    // #157 memindahkan pembacaan ini ke penjaga tenant — lalu entri ini hapus.
    "api/tenant/invitations/route.ts",
    "api/tenant/invitations/[id]/route.ts",
  ]);

  const readers = sourceFiles(APP_DIR)
    .map((f) => relative(APP_DIR, f).split(sep).join("/"))
    .filter((rel) => SESSION_COMPANY_PATTERN.test(readFileSync(join(APP_DIR, rel), "utf8")));

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
