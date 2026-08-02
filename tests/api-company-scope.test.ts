/**
 * Perusahaan datang dari PERMINTAAN, bukan dari sesi (issue #158).
 *
 * Ini separuh kedua dari perubahan yang dimulai #157. #157 memindahkan halaman
 * ke `/t/{tenant}/{company}/…`; selama route API masih menanyakan perusahaan
 * kepada SESI, halaman itu tetap bisa menampilkan buku PT A sambil menulis ke
 * PT B — bahayanya tidak hilang, ia hanya turun satu lapis.
 *
 * Yang diuji di sini adalah sifat-sifat yang masing-masing punya akibat berbeda
 * bila salah, bukan "true/false":
 *
 *  1. Header itu MASUKAN PENGGUNA. Header karangan yang menunjuk PT tenant lain
 *     dijawab 404 yang sama persis dengan slug fiktif — dan tidak ada satu pun
 *     gerbang sesudahnya yang sempat berjalan (tidak ada tulisan).
 *  2. Peran dinilai dari KEANGGOTAAN di PT yang diminta, bukan dari JWT. Sesi
 *     menyimpan peran di PT yang terakhir dibuka; memakainya berarti memberi
 *     hak PT A di buku PT B.
 *  3. Dua tab pada dua perusahaan: dua permintaan berurutan dengan SESI YANG
 *     SAMA mendarat di buku yang berbeda-beda sesuai headernya. Inilah tes yang
 *     menutup #151 seutuhnya.
 *  4. Sesi TIDAK pernah dilihat ketika permintaan membawa lingkupnya sendiri.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Dunia palsu: dua tenant, dua PT dengan slug yang SAMA (sah sejak #153) ── */

const COMPANIES = [
  { id: 11, slug: "cv-maju", name: "CV Maju", databaseName: "sai_t1_cv-maju", isActive: true, tenantId: 1 },
  { id: 12, slug: "pt-sejahtera", name: "PT Sejahtera", databaseName: "sai_t1_pt-sejahtera", isActive: true, tenantId: 1 },
  { id: 22, slug: "cv-maju", name: "CV Maju (pelanggan lain)", databaseName: "sai_t2_cv-maju", isActive: true, tenantId: 2 },
];

const TENANT_SLUGS: Record<number, string> = { 1: "acme", 2: "globex" };

/** (userId, companyId) → peran DI PT itu. Sengaja BERBEDA antar PT. */
const MEMBERSHIPS = new Map<string, string>([
  ["5:11", "finance_manager"],
  ["5:12", "staff"],
]);

const USER_TENANT: Record<number, number | null> = { 5: 1 };

const controlDb = vi.hoisted(() => ({
  company: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const membershipFor = vi.hoisted(() => vi.fn());
const routeSlot = vi.hoisted(() => ({ value: null as unknown }));
const setRouteCompany = vi.hoisted(() => vi.fn());
const routeCompany = vi.hoisted(() => vi.fn());

const authFn = vi.hoisted(() => vi.fn());
const headersFn = vi.hoisted(() => vi.fn());
const enterCompanyFromSession = vi.hoisted(() => vi.fn());
const canEffective = vi.hoisted(() => vi.fn());
const isModuleActiveFor = vi.hoisted(() => vi.fn());
const tenantStateForCompany = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/control-db", () => ({ controlDb }));
vi.mock("@/lib/company-registry", () => ({ membershipFor }));
vi.mock("@/lib/current-company", () => ({ setRouteCompany, routeCompany }));
vi.mock("@/lib/auth", () => ({ auth: authFn }));
vi.mock("next/headers", () => ({ headers: headersFn }));
vi.mock("@/lib/company-session", () => ({ enterCompanyFromSession }));
vi.mock("@/lib/authz-effective", () => ({ canEffective, isModuleActiveFor }));
vi.mock("@/lib/tenant-state", () => ({ tenantStateForCompany }));

import { requireApiPermission } from "@/lib/auth-guard";
import { companyScopeFromHeaders, COMPANY_SLUG_HEADER, TENANT_SLUG_HEADER } from "@/lib/company-scope";
import { withCompanyScope } from "@/lib/api-fetch";

/** Sesi yang perusahaannya PT Sejahtera — sengaja BUKAN yang diminta header. */
const SESSION = {
  user: {
    id: "5",
    name: "Rina",
    email: "rina@example.com",
    role: "staff",
    companyId: 12,
    mustChangePassword: false,
  },
};

function withHeaders(values: Record<string, string>) {
  headersFn.mockResolvedValue({ get: (name: string) => values[name] ?? null });
}

beforeEach(() => {
  vi.clearAllMocks();

  routeSlot.value = null;
  setRouteCompany.mockImplementation((ctx: unknown) => {
    routeSlot.value = ctx;
  });
  routeCompany.mockImplementation(() => routeSlot.value);

  controlDb.company.findFirst.mockImplementation(
    async ({ where }: { where: { slug: string; tenant: { slug: string } } }) => {
      const row = COMPANIES.find(
        (c) => c.slug === where.slug && TENANT_SLUGS[c.tenantId] === where.tenant.slug
      );
      return row ? { id: row.id, tenantId: row.tenantId } : null;
    }
  );
  controlDb.user.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
    const tenantId = USER_TENANT[where.id];
    return tenantId === undefined ? null : { tenantId };
  });
  membershipFor.mockImplementation(async (userId: number, companyId: number) => {
    const company = COMPANIES.find((c) => c.id === companyId);
    const role = MEMBERSHIPS.get(`${userId}:${companyId}`);
    if (!role || !company || !company.isActive) return null;
    return {
      role,
      accountantMode: null,
      company: {
        companyId: company.id,
        slug: company.slug,
        name: company.name,
        databaseName: company.databaseName,
        isActive: company.isActive,
      },
    };
  });

  authFn.mockResolvedValue(SESSION);
  headersFn.mockResolvedValue({ get: () => null });
  canEffective.mockResolvedValue(true);
  isModuleActiveFor.mockResolvedValue(true);
  tenantStateForCompany.mockResolvedValue({ status: "active" });
  enterCompanyFromSession.mockResolvedValue({
    ok: true,
    companyId: 12,
    slug: "pt-sejahtera",
    role: "staff",
  });
});

describe("bentuk lingkup — murni, tanpa jaringan", () => {
  it("membaca sepasang slug dari header", () => {
    expect(
      companyScopeFromHeaders((n) =>
        ({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "cv-maju" })[n] ?? null
      )
    ).toEqual({ tenantSlug: "acme", companySlug: "cv-maju" });
  });

  it("slug berbentuk aneh = TIDAK ADA lingkup, bukan lingkup yang dicoba", () => {
    // `..` dan slug sepanjang satu kilobyte tidak layak menjadi query; menolak
    // di sini membuat satu-satunya jalan masuk ke penyelesai selalu waras.
    expect(
      companyScopeFromHeaders((n) =>
        ({ [TENANT_SLUG_HEADER]: "..", [COMPANY_SLUG_HEADER]: "cv-maju" })[n] ?? null
      )
    ).toBeNull();
    expect(companyScopeFromHeaders(() => null)).toBeNull();
  });

  it("hanya SATU dari dua header = tidak ada lingkup — tenant wajib ikut (#153)", () => {
    expect(
      companyScopeFromHeaders((n) => ({ [COMPANY_SLUG_HEADER]: "cv-maju" })[n] ?? null)
    ).toBeNull();
  });
});

describe("apiFetch menyuntikkan lingkup dari ALAMAT, bukan dari sesi", () => {
  it("menambahkan sepasang header di jalur bertenant", () => {
    const init = withCompanyScope(
      { method: "POST", headers: { "Content-Type": "application/json" } },
      "/t/acme/cv-maju/invoices/new"
    );
    const sent = new Headers(init?.headers);
    expect(sent.get(TENANT_SLUG_HEADER)).toBe("acme");
    expect(sent.get(COMPANY_SLUG_HEADER)).toBe("cv-maju");
    // Header pemanggil tidak boleh hilang — badan JSON masih harus terbaca.
    expect(sent.get("Content-Type")).toBe("application/json");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("di luar jalur bertenant tidak mengarang apa pun", () => {
    // /select-company, /companies/new, halaman masuk: route yang dipanggil dari
    // sana memang tingkat tenant atau publik.
    expect(withCompanyScope({ method: "POST" }, "/companies/new")).toEqual({ method: "POST" });
    expect(withCompanyScope(undefined, null)).toBeUndefined();
  });
});

describe("penjaga API — header adalah masukan pengguna (issue #158)", () => {
  it("header sah → konteks PT itu yang ditanam, dan peran dari KEANGGOTAAN", async () => {
    withHeaders({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "cv-maju" });

    const result = await requireApiPermission("invoice.write");

    expect(result.authorized).toBe(true);
    if (!result.authorized) return;
    expect(result.companyId).toBe(11);
    // Sesi mengatakan `staff` di PT Sejahtera; keanggotaan di PT yang DIMINTA
    // mengatakan `finance_manager`. Yang dipakai harus yang kedua.
    expect(result.session.user.role).toBe("finance_manager");
    expect(canEffective).toHaveBeenCalledWith(
      expect.objectContaining({ role: "finance_manager", companyId: 11 }),
      "invoice.write"
    );
    // Sesi tidak pernah ditanya perusahaan apa pun.
    expect(enterCompanyFromSession).not.toHaveBeenCalled();
  });

  it("header KARANGAN ke PT tenant lain → 404 identik dengan slug fiktif, tanpa satu gerbang pun berjalan", async () => {
    withHeaders({ [TENANT_SLUG_HEADER]: "globex", [COMPANY_SLUG_HEADER]: "cv-maju" });
    const foreign = await requireApiPermission("invoice.write");

    withHeaders({ [TENANT_SLUG_HEADER]: "tidak-ada", [COMPANY_SLUG_HEADER]: "juga-tidak-ada" });
    const fictitious = await requireApiPermission("invoice.write");

    expect(foreign.authorized).toBe(false);
    expect(fictitious.authorized).toBe(false);
    if (foreign.authorized || fictitious.authorized) return;

    expect(foreign.response.status).toBe(404);
    expect(fictitious.response.status).toBe(404);
    // Byte demi byte sama: tidak ada satu bit pun yang membedakan "ada tapi
    // bukan punyamu" dari "tidak ada" (§4.4 docs/MULTI-TENANT.md).
    expect(await foreign.response.text()).toBe(await fictitious.response.text());

    // Ditolak SEBELUM gerbang mana pun — jadi tidak ada tulisan yang mungkin
    // terjadi, dan konteks perusahaan tidak pernah ditanam.
    expect(canEffective).not.toHaveBeenCalled();
    expect(isModuleActiveFor).not.toHaveBeenCalled();
    expect(setRouteCompany).not.toHaveBeenCalled();
  });

  it("bukan anggota PT yang diminta → 404 yang sama, bukan 403", async () => {
    authFn.mockResolvedValue({ ...SESSION, user: { ...SESSION.user, id: "7" } });
    withHeaders({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "cv-maju" });

    const result = await requireApiPermission("invoice.write");
    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(404);
    expect(setRouteCompany).not.toHaveBeenCalled();
  });

  it("tanpa sesi → 401, sebelum header dilihat sama sekali", async () => {
    authFn.mockResolvedValue(null);
    withHeaders({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "cv-maju" });

    const result = await requireApiPermission("invoice.write");
    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(401);
  });
});

describe("dua tab, dua perusahaan — satu sesi (menutup #151)", () => {
  it("dua permintaan dengan SESI YANG SAMA mendarat di buku yang berbeda", async () => {
    withHeaders({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "cv-maju" });
    const tabA = await requireApiPermission("invoice.write");

    withHeaders({ [TENANT_SLUG_HEADER]: "acme", [COMPANY_SLUG_HEADER]: "pt-sejahtera" });
    const tabB = await requireApiPermission("invoice.write");

    expect(tabA.authorized && tabA.companyId).toBe(11);
    expect(tabB.authorized && tabB.companyId).toBe(12);
    // Dan masing-masing dengan peran DI PT-nya sendiri.
    expect(tabA.authorized && tabA.session.user.role).toBe("finance_manager");
    expect(tabB.authorized && tabB.session.user.role).toBe("staff");
    expect(setRouteCompany).toHaveBeenNthCalledWith(1, expect.objectContaining({ companyId: 11 }));
    expect(setRouteCompany).toHaveBeenNthCalledWith(2, expect.objectContaining({ companyId: 12 }));
  });
});
