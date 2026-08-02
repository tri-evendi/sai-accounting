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
  isTenantScopedPath,
  isValidSlug,
  legacyTenantScopedPath,
  parseTenantPath,
  tenantPath,
} from "@/lib/tenant-routes";

const SRC = join(__dirname, "..", "src");
const DASHBOARD_DIR = join(SRC, "app", "(dashboard)");
const SCOPED_DIR = join(DASHBOARD_DIR, "t", "[tenantSlug]", "[companySlug]");

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
      rest: "/",
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
  it("sama persis dengan direktori di bawah (dashboard)/t/[tenantSlug]/[companySlug]", () => {
    expect([...MIGRATED_ROOT_SEGMENTS].sort()).toEqual(directoriesIn(SCOPED_DIR));
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
     * bukan jaminan; dan `current-company.ts` jatuh ke SESI bila konteksnya
     * tidak terlihat. Di halaman bertenant, "jatuh ke sesi" berarti menulis ke
     * perusahaan yang salah tanpa galat — persis yang issue ini hapus.
     */
    expect(guard).toContain("enterCompanyContext(");
    expect(guard).toContain("setRouteCompany(");

    const current = readFileSync(join(SRC, "lib", "current-company.ts"), "utf8");
    const routeAt = current.indexOf("routeCompanyHolder().value");
    const sessionAt = current.indexOf("await companyFromSession()");
    expect(routeAt).toBeGreaterThan(-1);
    expect(sessionAt).toBeGreaterThan(-1);
    // Jalur HARUS dibaca sebelum sesi — kalau tidak, urutannya tidak menjaga apa pun.
    expect(routeAt).toBeLessThan(sessionAt);
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

  it("penjaga halaman masih menerima pemanggilan TANPA params (halaman belum pindah)", () => {
    const pageAuth = readFileSync(join(SRC, "lib", "page-auth.ts"), "utf8");
    expect(pageAuth).toContain("enterCompanyFromSession");
    expect(pageAuth).toMatch(/route\?:\s*PageRouteParams/);
  });
});

describe("sesi & URL tetap sejalan sampai #158", () => {
  const sync = readFileSync(
    join(SRC, "components", "layout", "company-session-sync.tsx"),
    "utf8"
  );
  const layout = readFileSync(join(SCOPED_DIR, "layout.tsx"), "utf8");

  it("tata letak bertenant memasang penyelaras sesi", () => {
    expect(layout).toContain("CompanySessionSync");
  });

  it("isi halaman DITAHAN sampai cookie menunjuk perusahaan yang sama dengan jalur", () => {
    /*
     * Sampai #158, `/api/invoices` masih mengambil perusahaannya dari sesi.
     * Menampilkan spanduk peringatan tidak cukup — peringatan bisa diabaikan,
     * tombol yang tidak dirender tidak bisa ditekan.
     */
    expect(sync).toMatch(/if \(!synced\) return <PageLoader/);
    expect(sync).toContain("update({ companyId })");
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
