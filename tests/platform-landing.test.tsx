/**
 * `/platform` — pendaratan pasca-masuk & pemisahan isinya menurut kewenangan
 * (issue #172).
 *
 * Halaman ini dulu beralamat `/tenant` dan dijaga `tenant.settings` (OWNER
 * saja). Sejak ia menjadi tujuan pasca-masuk SETIAP anggota, satu kesalahan
 * menjadi mungkin dan mahal: menjadikannya terbuka untuk semua TANPA memisah
 * isinya — sehingga seorang staf gudang membaca tagihan langganan, atau
 * mengetahui bahwa pemilik akunnya memegang PT lain yang bukan tempatnya
 * bekerja. Kebocoran seperti itu tidak berbunyi; ia hanya terbaca.
 *
 * Karena itu yang diuji di sini bukan "halamannya merender sesuatu" melainkan
 * empat janji:
 *   1. bagian yang bukan haknya TIDAK DIRENDER (dan untuk langganan: query-nya
 *      pun tidak dijalankan) — bukan dirender lalu ditolak;
 *   2. daftar perusahaan datang dari KEANGGOTAANNYA SENDIRI, bukan dari isi
 *      tenant;
 *   3. nol perusahaan dijawab berbeda untuk yang boleh membuat dan yang tidak
 *      — tak satu pun menjadi jalan buntu;
 *   4. alamat lama `/tenant` dipantulkan 307, `/api/tenant/*` TIDAK ikut
 *      pindah, dan tak ada jalur yang memantul ke dirinya sendiri.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderToReadableStream } from "react-dom/server";

import { LocaleProvider } from "@/lib/i18n/client";
import { translate, type Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { POST_LOGIN_PATH } from "@/lib/post-login";
import { legacyTenantScopedPath, renamedPagePath } from "@/lib/tenant-routes";

const dict = id as unknown as Dictionary;
const T = (key: string, values?: Record<string, string | number>) =>
  translate(dict, key, values);

const SRC = join(__dirname, "..", "src");

interface CompanyRow {
  companyId: number;
  slug: string;
  name: string;
  databaseName: string;
  isActive: boolean;
}

const company = (companyId: number, slug: string, name: string): CompanyRow => ({
  companyId,
  slug,
  name,
  databaseName: `sai_t1_${slug.replace(/-/g, "_")}`,
  isActive: true,
});

const OVERVIEW = {
  tenant: {
    id: 1,
    name: "CV Acme",
    status: "active",
    planKey: "pro",
    trialEndsAt: null,
    maxCompanies: 3,
    maxUsers: 10,
  },
  usage: { companies: 2, users: 4 },
  billing: {
    subscription: null,
    plan: null,
    invoices: [],
    profile: null,
  },
};

const state = {
  role: "owner",
  tenantStatus: "active",
  companies: [] as CompanyRow[],
  /** Izin yang benar-benar diminta penjaga — dibuktikan, bukan diasumsikan. */
  guardedWith: [] as string[],
  /** userId yang dipakai membaca daftar perusahaan. */
  companiesForUserId: null as number | null,
  /** Berapa kali data langganan DIBACA. Untuk `member` harus tetap 0. */
  billingReads: 0,
};

vi.mock("@/lib/tenant-guard", () => ({
  requireTenantPagePermission: async (permission: string) => {
    state.guardedWith.push(permission);
    return {
      user: { id: "7", name: "Budi Santoso", email: "budi@example.test" },
      tenant: {
        tenantId: 1,
        tenantSlug: "acme",
        tenantName: "CV Acme Nusantara",
        tenantStatus: state.tenantStatus,
        role: state.role,
      },
    };
  },
}));

vi.mock("@/lib/company-registry", () => ({
  companiesForUser: async (userId: number) => {
    state.companiesForUserId = userId;
    return state.companies;
  },
}));

vi.mock("@/lib/subscription-store", () => ({
  billingOverviewForTenant: async () => {
    state.billingReads += 1;
    return OVERVIEW;
  },
}));

vi.mock("@/lib/i18n/server", () => ({
  getT: async () => T,
}));

/*
 * Kulit halaman diganti kerangka setipis mungkin: yang diuji di sini adalah
 * ISI halaman, dan `PlatformShell` menyeret lambang produk, pemilih bahasa,
 * dan sakelar tema — tiga permukaan yang diuji di tempatnya sendiri dan yang
 * di sini hanya menambah derau ke dalam markup.
 *
 * ⚠ Kulitnya berganti bersama tata letaknya: sampai audit tata letak,
 * halaman ini memakai `AuthShell` (kolom `max-w-md` untuk layar pra-aplikasi).
 * Yang TIDAK ikut berganti adalah janji di berkas ini — seluruh assertion di
 * bawah dibiarkan apa adanya, justru supaya perubahan bentuk terbukti tidak
 * menggeser satu pun batas kewenangan.
 */
vi.mock("@/components/tenant/platform-shell", () => ({
  PlatformShell: ({
    heading,
    description,
    children,
    account,
  }: {
    heading: string;
    description?: string;
    children: React.ReactNode;
    account?: React.ReactNode;
  }) => (
    <div>
      <h1>{heading}</h1>
      {description && <p>{description}</p>}
      {/* `account` = SignedInAs, yaitu JALAN KELUAR. Ia dirender di sini justru
          karena diuji di bawah: sejak kulitnya menjadi panel admin, tempatnya
          bilah atas, dan kulit yang dipalsukan tanpa slot ini akan membuat
          "setiap keadaan tetap punya jalan keluar" lulus tanpa jalan keluar. */}
      {account}
      {children}
    </div>
  ),
}));

const { default: PlatformPage } = await import("@/app/(tenant)/platform/page");

/**
 * Markup halaman, dengan entitas HTML dikembalikan ke huruf aslinya — teks
 * kamus mengandung `&` ("Akun & Perusahaan", "Data & Privasi") dan
 * membandingkannya dalam bentuk `&amp;` hanya menguji peng-escape-an React.
 */
async function render(): Promise<string> {
  const node = await PlatformPage();
  const stream = await renderToReadableStream(
    <LocaleProvider locale="id" dictionary={dict}>
      {node}
    </LocaleProvider>
  );
  const html = await new Response(stream).text();
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

beforeEach(() => {
  state.role = "owner";
  state.tenantStatus = "active";
  state.companies = [company(1, "pt-satu", "PT Satu"), company(2, "pt-dua", "PT Dua")];
  state.guardedWith = [];
  state.companiesForUserId = null;
  state.billingReads = 0;
});

/** Bagian-bagian yang HANYA boleh dilihat owner, dalam teks yang dirender. */
const OWNER_ONLY_TEXT = [
  T("tenantSettings.planHeading"),
  T("tenantSettings.usageHeading"),
  T("tenantSettings.billingHeading"),
  T("billing.profileHeading"),
  T("tenantSettings.privacyHeading"),
  T("tenantSettings.exportButton"),
  T("tenantSettings.deletionRequestButton"),
];

describe("penjaga & bentuk halaman", () => {
  it("dijaga `tenant.home` — izin yang dipegang SETIAP anggota tenant", async () => {
    await render();
    expect(state.guardedWith).toEqual(["tenant.home"]);
  });

  it("daftar perusahaannya dibaca dari KEANGGOTAAN PEMANGGIL, bukan dari isi tenant", async () => {
    await render();
    expect(state.companiesForUserId).toBe(7);

    const src = readFileSync(join(SRC, "app", "(tenant)", "platform", "page.tsx"), "utf8");
    expect(src).toContain("companiesForUser(");
    // Membaca `tenant.companies` (atau menyentuh basis data kendali langsung)
    // akan membocorkan keberadaan PT lain kepada staf salah satu PT.
    expect(src).not.toContain("tenant.companies");
    expect(src).not.toContain("@/lib/control-db");
    expect(src).not.toContain("@/lib/prisma");
  });
});

describe("owner — melihat langganan DAN daftar perusahaannya", () => {
  it("merender identitas akun, perusahaan, langganan, dan data & privasi", async () => {
    const html = await render();

    expect(html).toContain(T("platform.title"));
    expect(html).toContain("CV Acme Nusantara");
    expect(html).toContain("PT Satu");
    expect(html).toContain("PT Dua");
    // Membuka buku = pergi ke alamat kanonik PT itu (#157/#158).
    expect(html).toContain("/t/acme/pt-satu/dashboard");
    expect(html).toContain("/t/acme/pt-dua/dashboard");

    for (const text of OWNER_ONLY_TEXT) {
      expect(html, text).toContain(text);
    }
    // Kewenangan manajer ikut, karena owner memegangnya juga.
    expect(html).toContain(T("companies.newTitle"));
    expect(html).toContain(T("platform.teamHeading"));
    expect(state.billingReads).toBe(1);
  });

  it("langganan yang ditangguhkan diberitahukan, bukan disembunyikan", async () => {
    state.tenantStatus = "suspended";
    const html = await render();
    expect(html).toContain(T("tenantSettings.readOnlyNote"));
  });
});

describe("member biasa — mendarat, melihat perusahaannya, TIDAK melihat milik owner", () => {
  beforeEach(() => {
    state.role = "member";
    state.companies = [company(1, "pt-satu", "PT Satu")];
  });

  it("halamannya terbuka dan berisi perusahaan yang boleh ia buka", async () => {
    const html = await render();
    expect(html).toContain(T("platform.title"));
    expect(html).toContain("PT Satu");
    expect(html).toContain("/t/acme/pt-satu/dashboard");
  });

  it("TIDAK ada satu pun bagian owner di markup — bukan dirender lalu ditolak", async () => {
    const html = await render();
    for (const text of OWNER_ONLY_TEXT) {
      expect(html, `bagian owner bocor: ${text}`).not.toContain(text);
    }
  });

  it("dan data langganannya tidak pernah DIBACA sama sekali", async () => {
    await render();
    expect(state.billingReads).toBe(0);
  });

  it("kewenangan manajer (buat PT, undang staf) juga tidak muncul", async () => {
    const html = await render();
    expect(html).not.toContain(T("companies.newTitle"));
    expect(html).not.toContain(T("platform.teamHeading"));
  });

  it("hanya perusahaan yang menjadi haknya — PT lain di tenant yang sama tidak ikut", async () => {
    // Tenantnya memegang PT Rahasia; keanggotaan orang ini tidak. Halaman
    // membaca keanggotaan, jadi namanya tidak boleh muncul di mana pun.
    const html = await render();
    expect(html).not.toContain("PT Rahasia");
    expect(html).not.toContain("pt-rahasia");
  });
});

describe("nol perusahaan — dua keadaan, dua jawaban, tak satu pun jalan buntu", () => {
  it("boleh membuat (admin) → alasan + ajakan membuat yang pertama", async () => {
    state.role = "admin";
    state.companies = [];
    const html = await render();

    expect(html).toContain(T("auth.selectCompany.noCompanyYetBody"));
    expect(html).toContain(T("companies.newTitle"));
    expect(html).toContain("/companies/new");
    expect(html).not.toContain(T("auth.selectCompany.noAccessBody"));
  });

  it("tidak boleh membuat (member) → alasan + langkah berikutnya, tanpa tombol palsu", async () => {
    state.role = "member";
    state.companies = [];
    const html = await render();

    expect(html).toContain(T("auth.selectCompany.noAccessBody"));
    expect(html).toContain(T("auth.selectCompany.noAccessNext"));
    expect(html).not.toContain(T("companies.newTitle"));
    expect(html).not.toContain("/companies/new");
  });

  it("keduanya tetap punya jalan keluar (identitas + keluar)", async () => {
    for (const role of ["admin", "member"]) {
      state.role = role;
      state.companies = [];
      const html = await render();
      expect(html, role).toContain(T("auth.selectCompany.signOut"));
      expect(html, role).toContain("Budi Santoso");
    }
  });
});

describe("alamat lama /tenant → /platform (307)", () => {
  it("jalur halaman lama dipetakan, sub-jalurnya ikut", () => {
    expect(renamedPagePath("/tenant")).toBe("/platform");
    expect(renamedPagePath("/tenant/apa-pun")).toBe("/platform/apa-pun");
  });

  it("`/api/tenant/*` TIDAK ikut pindah — itu permukaan API tingkat tenant (#135)", () => {
    expect(renamedPagePath("/api/tenant/invitations")).toBeNull();
    expect(renamedPagePath("/api/tenant/export")).toBeNull();
    expect(renamedPagePath("/api/tenant")).toBeNull();
  });

  it("dan tidak ada jalur lain yang tersenggol — termasuk tautan dalam", () => {
    for (const path of [
      "/platform",
      "/t/acme/pt-satu/invoices",
      "/t/acme/pt-satu/dashboard",
      "/select-company",
      "/companies/new",
      "/login",
      "/tenants",
    ]) {
      expect(renamedPagePath(path), path).toBeNull();
    }
  });

  it("proxy memantulkannya 307 (bukan permanen) dan lewat peta yang sama", () => {
    const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
    expect(proxy).toContain("renamedPagePath");
    expect(proxy).toMatch(/NextResponse\.redirect\([^)]*,\s*307\s*\)/);
    // 308/301 ter-cache di peramban selamanya; alamat halaman masih bisa
    // berganti lagi, dan pantulan yang ter-cache tidak bisa ditarik kembali.
    expect(proxy).not.toMatch(/redirect\([^)]*,\s*30[81]\s*\)/);
  });

  it("halamannya DIPINDAHKAN, bukan digandakan — tidak ada berkas tersisa di /tenant", () => {
    const group = join(SRC, "app", "(tenant)");
    const dirs = readdirSync(group, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs).toContain("platform");
    expect(dirs).not.toContain("tenant");
  });
});

describe("tidak ada tautan internal yang tertinggal di alamat lama", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  it('tak satu pun `href="/tenant"` tersisa di seluruh src', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /href=\{?["'`]\/tenant["'`/]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("dua tautan yang dulu menuju /tenant kini menuju /platform", () => {
    for (const rel of [
      "components/layout/user-menu.tsx",
      "app/(auth)/select-company/page.tsx",
    ]) {
      const src = readFileSync(join(SRC, rel), "utf8");
      expect(src, rel).toContain('href="/platform"');
    }
  });
});

describe("tanpa pantulan yang berputar", () => {
  it("pendaratan pasca-masuk adalah /platform, dan proxy tidak pernah memantulkannya lagi", () => {
    expect(POST_LOGIN_PATH).toBe("/platform");
    // Dua-duanya adalah SELURUH sumber pantulan di proxy untuk jalur halaman.
    expect(renamedPagePath(POST_LOGIN_PATH)).toBeNull();
    expect(legacyTenantScopedPath(POST_LOGIN_PATH)).toBe(false);
  });

  it("halamannya sendiri tidak mengarahkan ke mana pun", () => {
    // Satu-satunya pantulan yang mungkin datang dari penjaga (tanpa sesi /
    // tanpa keanggotaan tenant), dan tujuannya BUKAN halaman ini.
    const src = readFileSync(join(SRC, "app", "(tenant)", "platform", "page.tsx"), "utf8");
    expect(src).not.toContain("redirect(");
    const guard = readFileSync(join(SRC, "lib", "tenant-guard.ts"), "utf8");
    expect(guard).not.toContain('"/platform"');
  });

  it("tautan dalam tetap sampai — /platform bukan gerbang, hanya tujuan bawaan", () => {
    const postLogin = readFileSync(join(SRC, "lib", "post-login.ts"), "utf8");
    // `callbackUrl` relatif tetap menang; aturannya sendiri diuji di
    // tests/post-login.test.ts.
    expect(postLogin).toContain("callbackUrl");
    // Dan tidak ada penjaga baru yang menyeret jalur bertenant ke /platform.
    const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
    expect(proxy).not.toMatch(/redirect\(new URL\("\/platform"/);
  });
});
