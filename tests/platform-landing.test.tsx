/**
 * Permukaan `/platform` — pendaratan pasca-masuk & pemisahan isinya menurut
 * kewenangan (issue #172), kini sebagai RUTE-RUTE TERSENDIRI.
 *
 * Halaman ini dulu beralamat `/tenant` dan dijaga `tenant.settings` (OWNER
 * saja). Sejak ia menjadi tujuan pasca-masuk SETIAP anggota, satu kesalahan
 * menjadi mungkin dan mahal: menjadikannya terbuka untuk semua TANPA memisah
 * isinya — sehingga seorang staf gudang membaca tagihan langganan, atau
 * mengetahui bahwa pemilik akunnya memegang PT lain yang bukan tempatnya
 * bekerja. Kebocoran seperti itu tidak berbunyi; ia hanya terbaca.
 *
 * ══ APA YANG BERUBAH DI BERKAS INI, DAN KENAPA ═════════════════════════════
 * Versi sebelumnya menguji SATU halaman panjang: seluruh isi dirender dalam
 * satu permintaan, dan pemisahannya berupa `{canX && …}` di setiap cabang.
 * Yang diuji karena itu adalah "teks milik owner TIDAK ADA di markup" — janji
 * yang benar, tapi hanya sejauh cabangnya benar.
 *
 * Sejak isinya dipecah menjadi rute, janjinya menjadi lebih kuat dan bentuk
 * ujinya ikut berubah: yang menolak bukan lagi cabang render melainkan PENJAGA
 * di baris pertama tiap halaman. Karena itu di bawah ada dua kelompok uji yang
 * dulu tidak mungkin ditulis:
 *
 *   • setiap rute MEMANGGIL penjaga dengan izin yang benar — dibuktikan, bukan
 *     diasumsikan (`guardedWith`);
 *   • `member` yang mengetik `/platform/billing` MEMANTUL — halamannya tidak
 *     pernah dirender sama sekali, jadi query langganan pun tidak berjalan.
 *
 * Janji lama yang tetap dijaga apa adanya: daftar perusahaan dari keanggotaan
 * PEMANGGIL, nol perusahaan dijawab dua cara tanpa jalan buntu, pantulan 307
 * dari alamat lama, dan tidak ada jalur yang memantul ke dirinya sendiri.
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
    /* Langganan BERJALAN, bukan `null`: tanpa periode & harga snapshot-nya
     * tidak ada dasar prorata, dan katalog paket dengan sengaja tidak
     * menawarkan tombol yang tidak bisa menghitung apa pun. */
    subscription: {
      status: "active",
      billingCycle: "monthly",
      price: "450000",
      currency: "IDR",
      currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-08-31T00:00:00Z"),
    },
    plan: { key: "pro", name: "Pro" },
    invoices: [],
    profile: null,
  },
};

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    description: null,
    priceMonthly: 150000,
    priceYearly: null,
    currency: "IDR",
    maxCompanies: 1,
    maxUsers: 3,
  },
  {
    key: "pro",
    name: "Pro",
    description: null,
    priceMonthly: 450000,
    priceYearly: 4500000,
    currency: "IDR",
    maxCompanies: 3,
    maxUsers: 10,
  },
];

/** Pantulan penjaga. `redirect()` asli Next.js juga bekerja dengan melempar. */
class GuardRedirect extends Error {
  constructor(readonly permission: string) {
    super(`redirect: ${permission}`);
  }
}

const state = {
  role: "owner",
  tenantStatus: "active",
  companies: [] as CompanyRow[],
  /**
   * Izin yang DIPEGANG pengunjung dalam uji ini. Penjaga palsu di bawah
   * memantulkan apa pun yang tidak ada di sini — meniru `redirect()` asli,
   * sehingga "member membuka halaman tagihan" bisa diuji sebagai pantulan,
   * bukan sebagai halaman kosong.
   */
  held: [] as string[],
  /** Izin yang benar-benar DIMINTA tiap halaman — dibuktikan, bukan diasumsikan. */
  guardedWith: [] as string[],
  /** userId yang dipakai membaca daftar perusahaan. */
  companiesForUserId: null as number | null,
  /** Berapa kali data langganan DIBACA. Untuk `member` harus tetap 0. */
  billingReads: 0,
};

vi.mock("@/lib/tenant-guard", () => ({
  requireTenantPagePermission: async (permission: string) => {
    state.guardedWith.push(permission);
    if (!state.held.includes(permission)) throw new GuardRedirect(permission);
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

vi.mock("@/lib/plan-catalog", () => ({
  activePlans: async () => PLANS,
}));

vi.mock("@/lib/i18n/server", () => ({
  getT: async () => T,
}));

/* Komponen klien di katalog paket memakai `useRouter().refresh()` untuk
 * mengambil ulang halaman setelah paket berpindah. Hook itu menuntut konteks
 * App Router yang tidak ada di perenderan SSR telanjang seperti di sini —
 * yang diuji pun bukan navigasinya, melainkan markup yang dihasilkan. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/platform/billing/plans",
}));

/*
 * Kulit panel diganti kerangka setipis mungkin: yang diuji di sini adalah ISI
 * halaman, dan `PlatformShell` menyeret lambang produk, pemilih bahasa, dan
 * sakelar tema — tiga permukaan yang diuji di tempatnya sendiri.
 *
 * `nav` dan `account` TETAP dirender, justru karena keduanya diuji di bawah:
 * menu yang hilang akan membuat "butir menu mengikuti izin" lulus tanpa menu,
 * dan `account` (yaitu SignedInAs) adalah JALAN KELUAR-nya.
 */
vi.mock("@/components/tenant/platform-shell", () => ({
  PlatformShell: ({
    children,
    tenantName,
    nav,
    account,
  }: {
    children: React.ReactNode;
    tenantName: string;
    nav: { href: string; label: string }[];
    account?: React.ReactNode;
  }) => (
    <div>
      <p>{tenantName}</p>
      <nav>
        {nav.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      {account}
      {children}
    </div>
  ),
}));

const { default: PlatformPage } = await import("@/app/(tenant)/platform/page");
const { default: PlatformLayout } = await import("@/app/(tenant)/platform/layout");
const { default: TeamPage } = await import("@/app/(tenant)/platform/team/page");
const { default: BillingPage } = await import("@/app/(tenant)/platform/billing/page");
const { default: PlansPage } = await import("@/app/(tenant)/platform/billing/plans/page");
const { default: PrivacyPage } = await import("@/app/(tenant)/platform/privacy/page");

/**
 * Markup sebuah halaman, dengan entitas HTML dikembalikan ke huruf aslinya —
 * teks kamus mengandung `&` ("Akun & Perusahaan", "Data & Privasi") dan
 * membandingkannya dalam bentuk `&amp;` hanya menguji peng-escape-an React.
 */
async function renderNode(node: React.ReactNode): Promise<string> {
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

const render = async (page: () => Promise<React.ReactNode>) => renderNode(await page());

/** Semua izin tenant yang dipegang owner dalam uji-uji di bawah. */
const OWNER_PERMISSIONS = [
  "tenant.home",
  "company.create",
  "tenant.member.invite",
  "tenant.billing",
  "tenant.export",
  "tenant.deletion",
];

beforeEach(() => {
  state.role = "owner";
  state.tenantStatus = "active";
  state.companies = [company(1, "pt-satu", "PT Satu"), company(2, "pt-dua", "PT Dua")];
  state.held = [...OWNER_PERMISSIONS];
  state.guardedWith = [];
  state.companiesForUserId = null;
  state.billingReads = 0;
});

describe("setiap rute menjaga dirinya sendiri", () => {
  it("pendaratan dijaga `tenant.home` — izin yang dipegang SETIAP anggota tenant", async () => {
    await render(PlatformPage);
    expect(state.guardedWith).toEqual(["tenant.home"]);
  });

  it("tim `tenant.member.invite`, tagihan & paket `tenant.billing`, privasi `tenant.export`", async () => {
    for (const [page, permission] of [
      [TeamPage, "tenant.member.invite"],
      [BillingPage, "tenant.billing"],
      [PlansPage, "tenant.billing"],
      [PrivacyPage, "tenant.export"],
    ] as const) {
      state.guardedWith = [];
      await render(page);
      expect(state.guardedWith, permission).toEqual([permission]);
    }
  });

  it("kerangkanya ikut menjaga dengan izin dasar — yang bukan anggota tenant tak sampai ke mana pun", async () => {
    await renderNode(await PlatformLayout({ children: null }));
    expect(state.guardedWith).toEqual(["tenant.home"]);
  });

  it("daftar perusahaannya dibaca dari KEANGGOTAAN PEMANGGIL, bukan dari isi tenant", async () => {
    await render(PlatformPage);
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

describe("member biasa — mendarat, TIDAK bisa menjangkau halaman owner", () => {
  beforeEach(() => {
    state.role = "member";
    state.companies = [company(1, "pt-satu", "PT Satu")];
    state.held = ["tenant.home"];
  });

  it("pendaratannya terbuka dan berisi perusahaan yang boleh ia buka", async () => {
    const html = await render(PlatformPage);
    expect(html).toContain(T("platform.title"));
    expect(html).toContain("PT Satu");
    expect(html).toContain("/t/acme/pt-satu/dashboard");
  });

  it("dan data langganannya tidak pernah DIBACA sama sekali", async () => {
    await render(PlatformPage);
    expect(state.billingReads).toBe(0);
  });

  it("setiap halaman owner MEMANTUL — bukan dirender lalu ditolak", async () => {
    for (const page of [TeamPage, BillingPage, PlansPage, PrivacyPage]) {
      await expect(render(page)).rejects.toBeInstanceOf(GuardRedirect);
    }
    // Dipantulkan penjaga = tak satu pun query langganan sempat berjalan.
    expect(state.billingReads).toBe(0);
  });

  it("menunya tidak menyebut ruangan yang tidak boleh ia masuki", async () => {
    const html = await renderNode(await PlatformLayout({ children: null }));
    expect(html).toContain("/platform");
    for (const href of [
      "/platform/team",
      "/platform/billing",
      "/platform/privacy",
      "/companies/new",
    ]) {
      expect(html, href).not.toContain(`href="${href}"`);
    }
  });

  it("hanya perusahaan yang menjadi haknya — PT lain di tenant yang sama tidak ikut", async () => {
    // Tenantnya memegang PT Rahasia; keanggotaan orang ini tidak. Halaman
    // membaca keanggotaan, jadi namanya tidak boleh muncul di mana pun.
    const html = await render(PlatformPage);
    expect(html).not.toContain("PT Rahasia");
    expect(html).not.toContain("pt-rahasia");
  });
});

describe("owner — melihat kuota, perusahaan, langganan, paket, dan privasi", () => {
  it("pendaratannya membawa identitas akun, perusahaan, dan ringkasan kuota", async () => {
    const html = await render(PlatformPage);

    expect(html).toContain(T("platform.title"));
    expect(html).toContain("CV Acme Nusantara");
    expect(html).toContain("PT Satu");
    expect(html).toContain("PT Dua");
    // Membuka buku = pergi ke alamat kanonik PT itu (#157/#158).
    expect(html).toContain("/t/acme/pt-satu/dashboard");
    expect(html).toContain("/t/acme/pt-dua/dashboard");
    // Kuota terpakai, di kartu ringkasan.
    expect(html).toContain(T("tenantSettings.usageHeading"));
    expect(html).toContain(T("tenantSettings.usageOf", { used: 2, max: 3 }));
    expect(state.billingReads).toBe(1);
  });

  it("menunya membuka seluruh ruangan yang menjadi haknya", async () => {
    const html = await renderNode(await PlatformLayout({ children: null }));
    for (const href of [
      "/platform",
      "/platform/team",
      "/platform/billing",
      "/platform/privacy",
      "/companies/new",
    ]) {
      expect(html, href).toContain(`href="${href}"`);
    }
  });

  it("halaman tagihan membawa paket, riwayat, dan profil penagihan", async () => {
    const html = await render(BillingPage);
    expect(html).toContain(T("tenantSettings.planHeading"));
    expect(html).toContain(T("tenantSettings.billingHeading"));
    expect(html).toContain(T("billing.profileHeading"));
    // Dan jalan menuju katalog paket, sebab "kalau saya butuh lebih?" adalah
    // pertanyaan yang paling sering menyusul setelah membaca tagihan.
    expect(html).toContain("/platform/billing/plans");
  });

  it("halaman privasi membawa ekspor dan permintaan penghapusan", async () => {
    const html = await render(PrivacyPage);
    expect(html).toContain(T("tenantSettings.privacyHeading"));
    expect(html).toContain(T("tenantSettings.exportButton"));
    expect(html).toContain(T("tenantSettings.deletionRequestButton"));
  });

  it("langganan yang ditangguhkan diberitahukan di pendaratan, bukan disembunyikan", async () => {
    state.tenantStatus = "suspended";
    const html = await render(PlatformPage);
    expect(html).toContain(T("tenantSettings.readOnlyNote"));
  });
});

describe("katalog paket — perbandingan yang jujur, tanpa tombol yang berbohong", () => {
  it("menampilkan paket aktif beserta harga dan kuotanya", async () => {
    const html = await render(PlansPage);
    expect(html).toContain("Starter");
    expect(html).toContain("Pro");
    expect(html).toContain(T("platform.plansQuotaCompanies", { max: 3 }));
    expect(html).toContain(T("platform.plansQuotaUsers", { max: 10 }));
  });

  it("menandai paket yang sedang berjalan dengan LENCANA BERTEKS, bukan warna saja", async () => {
    const html = await render(PlansPage);
    expect(html).toContain(T("platform.plansCurrent"));
  });

  it("memberi tombol pindah paket — tapi TIDAK pada paket yang sedang berjalan", async () => {
    const html = await render(PlansPage);
    // Dua paket di katalog, salah satunya paket berjalan (`pro`) → satu tombol.
    const buttons = html.split(T("platform.planChangeSelect")).length - 1;
    expect(buttons).toBe(1);
  });

  it("keputusannya TIDAK dihitung di halaman — halaman hanya memanggil server", async () => {
    /*
     * Penjaga niat, bukan penjaga markup. Kuota, prorata, dan penolakan
     * turun-paket ditimbang di `/api/tenant/billing/plan-change` dari pemakaian
     * NYATA. Halaman yang ikut memutuskan berarti dua kebenaran tentang uang
     * yang sama — dan yang di klien bisa dipalsukan siapa pun.
     *
     * Komentar dibuang dulu: berkas-berkas itu MENJELASKAN aturannya, dan
     * penjaga yang memindai teks mentah akan tersandung penjelasannya sendiri.
     */
    const strip = (path: string[]) =>
      readFileSync(join(SRC, ...path), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    const page = strip(["app", "(tenant)", "platform", "billing", "plans", "page.tsx"]);
    const actions = strip([
      "app",
      "(tenant)",
      "platform",
      "billing",
      "plans",
      "plan-actions.tsx",
    ]);

    // Halaman tetap server component; mesin paket tidak dipanggil dari sana.
    expect(page).not.toContain("changeTenantPlan");
    expect(page).not.toContain('"use client"');
    // Dan yang memutuskan adalah route, bukan komponen kliennya.
    expect(actions).toContain("/api/tenant/billing/plan-change");
    expect(actions).not.toContain("changeTenantPlan");
  });
});

describe("nol perusahaan — dua keadaan, dua jawaban, tak satu pun jalan buntu", () => {
  it("boleh membuat (admin) → alasan + ajakan membuat yang pertama", async () => {
    state.role = "admin";
    state.companies = [];
    state.held = ["tenant.home", "company.create", "tenant.member.invite"];
    const html = await render(PlatformPage);

    expect(html).toContain(T("auth.selectCompany.noCompanyYetBody"));
    expect(html).toContain(T("companies.newTitle"));
    expect(html).toContain("/companies/new");
    expect(html).not.toContain(T("auth.selectCompany.noAccessBody"));
  });

  it("tidak boleh membuat (member) → alasan + langkah berikutnya, tanpa tombol palsu", async () => {
    state.role = "member";
    state.companies = [];
    state.held = ["tenant.home"];
    const html = await render(PlatformPage);

    expect(html).toContain(T("auth.selectCompany.noAccessBody"));
    expect(html).toContain(T("auth.selectCompany.noAccessNext"));
    expect(html).not.toContain(T("companies.newTitle"));
    expect(html).not.toContain("/companies/new");
  });

  it("keduanya tetap punya jalan keluar (identitas + keluar) lewat kerangkanya", async () => {
    for (const role of ["admin", "member"]) {
      state.role = role;
      state.companies = [];
      state.held = ["tenant.home"];
      const html = await renderNode(await PlatformLayout({ children: null }));
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

  it("dan tidak ada jalur lain yang tersenggol — termasuk anak-rute /platform", () => {
    for (const path of [
      "/platform",
      "/platform/billing",
      "/platform/billing/plans",
      "/platform/privacy",
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
