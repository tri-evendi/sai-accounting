/**
 * Jalur ber-slug tenant `/t/{tenantSlug}/{companySlug}/…` (issue #157).
 *
 * Yang dijaga di sini bukan kerapian URL melainkan satu kelas kegagalan:
 * "yang dilihat bukan yang ditulis". Sampai issue ini, perusahaan aktif hidup
 * di cookie yang dibagi SELURUH TAB — membuka PT lain di tab sebelah membuat
 * tab ini menampilkan buku lama sambil menulis ke buku baru, tanpa galat.
 *
 * Empat hal yang dikunci:
 *   1. bentuk jalur & pemetaannya (murni, tanpa I/O);
 *   2. DAFTAR segmen yang sudah dimigrasikan sama persis dengan direktori
 *      sungguhan — daftar yang meleset memantulkan orang ke halaman yang belum
 *      ada, dan itu 404 yang tampak seperti kerusakan;
 *   3. penjaga membaca URL, memverifikasi keanggotaan SETIAP permintaan, dan
 *      menjawab 404 (bukan 403) untuk apa pun yang bukan haknya;
 *   4. sesi & URL tetap sejalan sampai #158 — tanpa ini, migrasi ini hanya
 *      MEMINDAHKAN ketidakcocokannya, tidak menghapusnya.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  MIGRATED_ROOT_SEGMENTS,
  appPath,
  isTenantScopedPath,
  isValidSlug,
  legacyTenantScopedPath,
  parseTenantPath,
  tenantPath,
} from "@/lib/tenant-routes";
import { scopedHref } from "@/components/ui/app-link";
import { activeNavHref } from "@/lib/nav";
import { tourForPath } from "@/lib/tours";

const SRC = join(__dirname, "..", "src");
const DASHBOARD_DIR = join(SRC, "app", "(dashboard)");
/**
 * Direktori bertenant ada di DUA grup rute, dan itu disengaja: wizard penyiapan
 * tinggal di `(setup)` demi kerangkanya sendiri (issue #103), lalu ikut pindah
 * ke jalur bertenant di #158 supaya `/api/setup` — satu-satunya route TULIS
 * yang tersisa di luar jalur — berhenti mengambil perusahaannya dari sesi.
 * Grup rute tidak mengubah URL, jadi keduanya menyumbang ke ruang nama segmen
 * akar yang SAMA.
 */
const SCOPED_DIRS = [
  join(DASHBOARD_DIR, "t", "[tenantSlug]", "[companySlug]"),
  join(SRC, "app", "(setup)", "t", "[tenantSlug]", "[companySlug]"),
];

function directoriesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("bentuk jalur bertenant", () => {
  it("menyusun jalur kanonik dari jalur lama", () => {
    expect(tenantPath("acme", "cv-maju", "/invoices/12")).toBe("/t/acme/cv-maju/invoices/12");
    expect(tenantPath("acme", "cv-maju", "invoices")).toBe("/t/acme/cv-maju/invoices");
    expect(tenantPath("acme", "cv-maju", "/")).toBe("/t/acme/cv-maju/");
    /* Beranda buku = AKAR perusahaan, tanpa segmen. Pasangan baliknya diuji di
       `parseTenantPath` di bawah; keduanya harus bergerak bersama. */
    expect(tenantPath("acme", "cv-maju", "/dashboard")).toBe("/t/acme/cv-maju");
  });

  it("mengenali jalur yang sudah bertenant — supaya pantulan tidak memantul ke dirinya sendiri", () => {
    expect(isTenantScopedPath("/t/acme/cv-maju/invoices")).toBe(true);
    expect(isTenantScopedPath("/t")).toBe(true);
    expect(isTenantScopedPath("/tax")).toBe(false);
    expect(isTenantScopedPath("/tenant/billing")).toBe(false);
  });

  it("memecah jalur bertenant kembali menjadi slug + sisa jalur lama", () => {
    expect(parseTenantPath("/t/acme/cv-maju/invoices/12")).toEqual({
      tenantSlug: "acme",
      companySlug: "cv-maju",
      rest: "/invoices/12",
    });
    expect(parseTenantPath("/t/acme/cv-maju")).toEqual({
      tenantSlug: "acme",
      companySlug: "cv-maju",
      /* Akar perusahaan memetakan balik ke jalur APLIKASI berandanya, bukan
         "/" — yang terakhir itu halaman pendaratan pemasaran, dan tak satu pun
         tabel jalur-aplikasi (menu, tur, docs) mengenalnya. */
      rest: "/dashboard",
    });
    expect(parseTenantPath("/invoices/12")).toBeNull();
    expect(parseTenantPath("/t/acme")).toBeNull();
  });

  it("menolak slug yang bentuknya tidak sah SEBELUM ia menjadi query", () => {
    expect(isValidSlug("cv-maju")).toBe(true);
    expect(isValidSlug("pt2")).toBe(true);
    expect(isValidSlug("..")).toBe(false);
    expect(isValidSlug("CV-Maju")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("x".repeat(51))).toBe(false);
    expect(isValidSlug(null)).toBe(false);
  });
});

describe("daftar segmen yang sudah dimigrasikan", () => {
  /*
   * `proxy.ts` berjalan di Edge dan tidak boleh menyentuh `node:fs`, jadi
   * daftarnya WAJIB statis. Tes inilah yang membuatnya tidak boleh bohong:
   * segmen yang didaftarkan tapi halamannya belum pindah = pantulan ke 404;
   * halaman yang sudah pindah tapi tidak didaftarkan = tautan lama & bookmark
   * mati diam-diam. Keduanya merah di sini.
   */
  it("sama persis dengan direktori bertenant sungguhan di semua grup rute", () => {
    /*
     * `dashboard` SATU-SATUNYA segmen tanpa direktori, dan itu disengaja:
     * alamat kanonik beranda buku adalah AKAR perusahaan (`/t/{t}/{c}`), jadi
     * halamannya duduk di `[companySlug]/page.tsx`, bukan di sebuah
     * subdirektori. Ia tetap terdaftar di sini karena bentuk jalur-APLIKASI-nya
     * (`/dashboard`) masih dipakai seluruh app sebagai kunci identitas menu,
     * tur, dan docs — dan proxy harus tetap memantulkannya. Lihat
     * `COMPANY_HOME_PATH` di `lib/tenant-routes.ts`.
     */
    const actual = [...new Set(SCOPED_DIRS.flatMap(directoriesIn)), "dashboard"].sort();
    expect([...MIGRATED_ROOT_SEGMENTS].sort()).toEqual(actual);
  });

  it("halaman DIPINDAHKAN, bukan digandakan — yang tersisa di jalur lama hanya pengarah", () => {
    /*
     * Menyisakan salinan di jalur lama akan membuat `/invoices` tetap menjawab
     * 200 dengan perusahaan dari SESI — persis kebiasaan yang issue ini hapus,
     * hanya kini bersembunyi di balik jalur yang terlihat usang. Umumnya tidak
     * ada berkas yang tertinggal sama sekali: pantulan 307 milik proxy tidak
     * membutuhkannya.
     *
     * Satu pengecualian yang HARUS dibuktikan sifatnya, bukan cuma didaftar:
     * `/dashboard` telanjang tetap ada karena ia tujuan bawaan seluruh aplikasi
     * dan karena proxy tak bisa memantulkan token tanpa slug. Syaratnya ia
     * benar-benar PENGARAH — tanpa penjaga izin, tanpa satu pun query.
     */
    for (const segment of MIGRATED_ROOT_SEGMENTS) {
      const legacy = join(DASHBOARD_DIR, segment, "page.tsx");
      if (!existsSync(legacy)) {
        expect(
          existsSync(join(DASHBOARD_DIR, segment)),
          `${segment} masih punya berkas di jalur lama`
        ).toBe(false);
        continue;
      }
      const src = readFileSync(legacy, "utf8");
      expect(src, `${segment} tertinggal di jalur lama tapi bukan pengarah`).toContain("redirect(");
      expect(src).not.toContain("requirePagePermission");
      expect(src).not.toContain("@/lib/prisma");
    }
  });

  it("hanya jalur lama bersegmen terdaftar yang dipantulkan", () => {
    for (const segment of MIGRATED_ROOT_SEGMENTS) {
      expect(legacyTenantScopedPath(`/${segment}`)).toBe(true);
      expect(legacyTenantScopedPath(`/${segment}/12/edit`)).toBe(true);
    }
    // Jalur yang BUKAN milik dashboard tidak pernah ikut terpantul.
    expect(legacyTenantScopedPath("/login")).toBe(false);
    expect(legacyTenantScopedPath("/select-company")).toBe(false);
    expect(legacyTenantScopedPath("/companies/new")).toBe(false);
    expect(legacyTenantScopedPath("/tenant/billing")).toBe(false);
    expect(legacyTenantScopedPath("/api/invoices")).toBe(false);
    // Dan jalur yang SUDAH kanonik tidak dipantulkan lagi.
    expect(legacyTenantScopedPath("/t/acme/cv-maju/invoices")).toBe(false);
  });
});

describe("tautan & sorotan menu ikut pindah", () => {
  it("href lama dipetakan ke jalur kanonik saat kita SEDANG di jalur bertenant", () => {
    expect(scopedHref("/invoices/12", "/t/acme/cv-maju/dashboard")).toBe(
      "/t/acme/cv-maju/invoices/12"
    );
    // Querystring ikut, dan tidak ikut menentukan segmen tujuan.
    expect(scopedHref("/finance/new?arah=masuk", "/t/acme/cv-maju/finance")).toBe(
      "/t/acme/cv-maju/finance/new?arah=masuk"
    );
  });

  it("di luar jalur bertenant, href diteruskan apa adanya", () => {
    // Halaman masuk, pemilih perusahaan, konsol operator — tidak ada slug untuk
    // dipasang, dan menebaknya dari sesi justru memasang kembali kegagalan
    // "tab sebelah berganti perusahaan" yang issue ini hapus.
    expect(scopedHref("/invoices", "/login")).toBe("/invoices");
    expect(scopedHref("/invoices", null)).toBe("/invoices");
  });

  it("jalur di luar dashboard tidak pernah ikut dipetakan", () => {
    for (const href of ["/select-company", "/companies/new", "/tenant/billing", "/login"]) {
      expect(scopedHref(href, "/t/acme/cv-maju/dashboard")).toBe(href);
    }
    // Tautan luar & jalur yang sudah kanonik juga tidak disentuh.
    expect(scopedHref("https://example.test", "/t/acme/cv-maju/dashboard")).toBe(
      "https://example.test"
    );
    expect(scopedHref("/t/acme/cv-maju/invoices", "/t/acme/cv-maju/dashboard")).toBe(
      "/t/acme/cv-maju/invoices"
    );
  });

  it("menu tetap tersorot di jalur bertenant", () => {
    /*
     * Tabel menu ditulis dalam jalur lama dan tidak bisa ditulis ulang — slug
     * baru diketahui saat permintaan berjalan. Tanpa `appPath`, tidak ada satu
     * pun menu yang tersorot di seluruh aplikasi, dan "tidak ada yang tersorot"
     * terbaca sebagai tersesat.
     */
    expect(appPath("/t/acme/cv-maju/invoices/12")).toBe("/invoices/12");
    expect(appPath("/invoices/12")).toBe("/invoices/12");
    expect(activeNavHref("/t/acme/cv-maju/invoices/12", ["/invoices", "/inventory"])).toBe(
      "/invoices"
    );
    expect(activeNavHref("/t/acme/cv-maju/dashboard", ["/dashboard"])).toBe("/dashboard");
  });

  it("tur panduan tetap mengenali halamannya di jalur bertenant", () => {
    const legacy = tourForPath("/dashboard");
    expect(legacy).not.toBeNull();
    expect(tourForPath("/t/acme/cv-maju/dashboard")?.id).toBe(legacy?.id);
  });
});

describe("penjaga membaca URL, bukan sesi", () => {
  const guard = readFileSync(join(SRC, "lib", "company-route.ts"), "utf8");
  const pageAuth = readFileSync(join(SRC, "lib", "page-auth.ts"), "utf8");

  it("keanggotaan dibaca ULANG dari basis data kendali, tidak diambil dari JWT", () => {
    expect(guard).toContain("membershipFor(");
    // Peran datang dari keanggotaan yang baru dibaca — bukan dari token.
    expect(guard).toMatch(/role:\s*membership\.role/);
    expect(guard).not.toMatch(/session[?.]*\.user[?.]*\.role/);
  });

  it("penjaga halaman menimpa peran sesi dengan peran DI PERUSAHAAN jalur", () => {
    /*
     * Tanpa penimpaan ini, `finance_manager` di PT A membuka buku PT B — tempat
     * ia hanya staf — dengan hak PT A, sebab `canEffective` membaca
     * `session.user.role` yang isinya peran perusahaan TERAKHIR.
     */
    expect(pageAuth).toContain("enterCompanyFromRoute");
    expect(pageAuth).toMatch(/role:\s*scoped\.role/);
  });

  it("gagal apa pun dijawab notFound(), tidak pernah 403", () => {
    expect(pageAuth).toContain("notFound()");
    // Satu-satunya alasan gagal yang dikenal tipenya, selain "belum bersesi".
    expect(guard).toMatch(/reason:\s*"no-session"\s*\|\s*"not-found"/);
    expect(guard).not.toMatch(/status:\s*403/);
    expect(guard).not.toMatch(/forbidden\(/);
  });

  it("pengguna dari tenant lain tetap ditolak walau keanggotaannya ada", () => {
    /*
     * Satu pengguna milik tepat satu tenant (docs/MULTI-TENANT.md §2), jadi
     * keanggotaan lintas tenant tidak bisa lahir lewat alur normal. Justru
     * karena itu penjaganya wajib ada DAN wajib dijaga tes: yang menegakkan
     * kemustahilan itu ada di kode LAIN, dan satu skrip perbaikan data sudah
     * cukup untuk membuatnya bocor.
     */
    expect(guard).toMatch(/actor\.tenantId !== ids\.tenantId/);
  });

  it("konteks perusahaan dari jalur ditanam DUA kali — ALS dan penyimpan per-permintaan", () => {
    /*
     * `company-context.ts` menyebut rambatan `enterWith` sebagai JALAN PINTAS,
     * bukan jaminan. Sabuk kedua inilah yang membuat kegagalan rambatan
     * berbunyi keras alih-alih diam.
     */
    expect(guard).toContain("enterCompanyContext(");
    expect(guard).toContain("setRouteCompany(");
  });

  it("pembuktiannya membaca sabuk yang BERTAHAN, bukan yang baru saja ditulis (issue #333)", () => {
    /*
     * Bentuk lamanya `getCompanyContext() ?? routeCompany()` — dan cabang
     * pertamanya SELALU lulus, sebab `enterWith` yang baru dipanggil pasti
     * terbaca di frame yang sama. Pembuktian yang selalu lulus tidak pernah
     * memeriksa apa pun, dan itulah yang membuat #333 hidup delapan bulan:
     * penyimpan per-permintaan — satu-satunya sabuk yang bertahan sampai badan
     * route — tidak pernah tersentuh olehnya.
     */
    expect(guard).toContain("const planted = await routeCompany();");
    expect(guard).not.toMatch(/const planted\s*=\s*getCompanyContext\(\)/);
  });

  it("`currentCompany()` TIDAK PUNYA jawaban cadangan dari sesi (issue #158)", () => {
    /*
     * Selama sesi masih menjawab di sana, setiap jalur yang lupa membawa
     * perusahaannya tetap BEKERJA — dengan PT yang kebetulan terakhir dibuka —
     * dan bekerja dengan diam adalah cara kesalahan ini bertahan hidup. Yang
     * dikunci di sini bukan urutan sumber melainkan KETIADAAN sumber ketiga:
     * setelah ALS dan penyimpan per-permintaan, satu-satunya kelanjutan adalah
     * melempar.
     */
    const current = readFileSync(join(SRC, "lib", "current-company.ts"), "utf8");
    /*
     * Sejak #333 penyimpan per-permintaan tidak lagi bertanya kepada `cache()`
     * React — yang memoisasi HANYA di dalam render, sehingga route handler
     * mendapat objek baru setiap kali dan sabuk kedua tidak pernah bekerja
     * untuk API. Jangkarnya kini objek permintaan milik Next sendiri.
     */
    expect(current).toContain("const fromRoute = await routeCompany();");
    expect(current).toContain("new WeakMap<object, RouteCompanyHolder>()");
    expect(current).not.toContain('from "react"');
    expect(current).toContain("throw new MissingCompanyContextError()");
    expect(current).not.toContain("companyFromSession");
    // Sesi tidak boleh masuk kembali lewat pintu belakang.
    expect(current).not.toContain("@/lib/auth");
  });
});

describe("jalur lama tetap hidup selama migrasi", () => {
  const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");

  it("proxy memantulkan jalur lama dengan 307, bukan permanen", () => {
    expect(proxy).toContain("legacyTenantScopedPath");
    expect(proxy).toMatch(/NextResponse\.redirect\([^)]*,\s*307\s*\)/);
    // 308/301 akan ter-cache selamanya padahal tujuannya bergantung pada sesi.
    expect(proxy).not.toMatch(/redirect\([^)]*,\s*30[81]\s*\)/);
  });

  it("tanpa slug di token, proxy TIDAK memantulkan — penjaga yang mengarahkan", () => {
    expect(proxy).toMatch(/if \(tenantSlug && companySlug\)/);
  });

  it("penjaga halaman MENUNTUT params — jalan sesi ditutup, bukan sekadar tak dipakai (issue #158)", () => {
    /*
     * Selama migrasi #157 argumennya opsional dan halaman yang belum pindah
     * tetap mengambil perusahaannya dari sesi. Sejak seluruh halaman berizin
     * hidup di jalur bertenant, pilihan itu ditutup di TIPENYA: halaman baru
     * yang lupa meneruskan `params` ditolak `tsc`, bukan diam-diam dilayani
     * dengan perusahaan yang terakhir dibuka.
     */
    const pageAuth = readFileSync(join(SRC, "lib", "page-auth.ts"), "utf8");
    expect(pageAuth).not.toContain("enterCompanyFromSession");
    expect(pageAuth).toMatch(/route:\s*PageRouteParams/);
  });
});

describe("sesi turun pangkat menjadi catatan 'yang terakhir dibuka' (#157 → #158)", () => {
  const sync = readFileSync(
    join(SRC, "components", "layout", "company-session-sync.tsx"),
    "utf8"
  );
  const layout = readFileSync(join(SCOPED_DIRS[0], "layout.tsx"), "utf8");

  it("tata letak bertenant tetap mencatat perusahaan yang sedang dibuka", () => {
    expect(layout).toContain("CompanySessionSync");
  });

  it("pencatatan itu TIDAK menahan permukaan halaman lagi (issue #158)", () => {
    /*
     * Di #157 komponen ini menahan seluruh isi halaman sampai cookie menyusul,
     * dan itu benar selama route API masih mengambil perusahaannya dari sesi.
     * Sejak setiap panggilan membawa perusahaannya sendiri dan penjaga API
     * memvalidasinya, penahanan itu tidak menjaga apa pun — ia hanya
     * memperlambat setiap perpindahan perusahaan. Yang dikunci: ia mencatat,
     * dan ia tidak merender apa pun.
     */
    expect(sync).toContain("update({ companyId })");
    expect(sync).toMatch(/return null;/);
    expect(sync).not.toContain("PageLoader");
    expect(sync).not.toContain("children");
  });

  it("permintaan penyelarasan tidak pernah berulang tanpa henti", () => {
    // Keanggotaan yang DITOLAK server membuat sesi tak pernah cocok; tanpa
    // penjaga ini komponennya akan membombardir server selamanya.
    expect(sync).toContain("requested.current === companyId");
  });

  it("sesi turun pangkat menjadi 'yang terakhir dibuka', dan itu tertulis di tipenya", () => {
    const types = readFileSync(join(SRC, "types", "next-auth.d.ts"), "utf8");
    expect(types).toContain("tenantSlug");
    expect(types).toMatch(/TERAKHIR DIBUKA/);
  });
});
