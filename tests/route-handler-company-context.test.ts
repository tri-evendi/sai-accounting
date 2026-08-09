/**
 * KONTEKS PERUSAHAAN HARUS SAMPAI KE BADAN ROUTE HANDLER (issue #333).
 *
 * ══ CACAT YANG DITUTUP BERKAS INI ══════════════════════════════════════════
 * `POST /api/setup` menjawab 500 di produksi dengan `MissingCompanyContextError`
 * yang dilempar DI DALAM penjaga — sesudah penjaga berhasil menyelesaikan
 * perusahaannya. Dua sabuk yang seharusnya membawa konteks itu gagal bersamaan,
 * dan keduanya karena alasan yang sama: keduanya diukur di tempat yang salah.
 *
 *   1. `cache()` React memoisasi HANYA di dalam sebuah render. Route handler
 *      bukan render, jadi `holder() === holder()` → **false** di sana: penjaga
 *      menulis ke satu objek dan pembacaan berikutnya menerima objek lain.
 *   2. `als.enterWith()` hanya merambat ke pemanggil bila dipanggil SEBELUM
 *      `await` apa pun. Penjaga selalu membaca basis data kendali lebih dulu,
 *      jadi konteks yang ia tanam tidak pernah terlihat oleh badan route.
 *
 * Akibatnya bukan satu wizard yang gagal melainkan SETIAP route handler yang
 * menyentuh basis data perusahaan — yaitu hampir seluruh API aplikasi ini.
 *
 * ══ KENAPA 2.908 TES LAIN MELEWATKANNYA ════════════════════════════════════
 * Tiga sebab, dan ketiganya masih berlaku untuk berkas tes lain — karena itu
 * berkas ini sengaja melanggar ketiganya:
 *
 *   • `tests/setup-company-context.ts` menanam konteks ALS untuk SETIAP berkas
 *     tes. Dengan konteks ambien itu, `currentCompany()` selalu terjawab oleh
 *     sabuk pertama dan sabuk kedua tidak pernah diuji. → Di sini setiap
 *     permintaan dijalankan di dalam `runWithoutCompany()`, persis seperti
 *     permintaan HTTP sungguhan yang lahir TANPA store.
 *   • `tests/current-company-route.test.ts` menukar `cache()` React dengan
 *     memoizer yang benar-benar mengingat, dan `tests/api-company-scope.test.ts`
 *     menukar seluruh `@/lib/current-company` dengan slot palsu. Keduanya
 *     karena itu menguji sebuah fiksi yang tidak pernah ada di runtime. → Di
 *     sini `@/lib/current-company`, `@/lib/company-route`, `@/lib/auth-guard`,
 *     `@/lib/authz-effective`, `@/lib/prisma`, dan `react` semuanya ASLI.
 *   • Tidak ada satu pun tes yang memanggil ROUTE HANDLER sungguhan lewat
 *     penjaganya. Tes yang memanggil fungsi penjaga langsung tidak bisa
 *     menangkap cacat ini — cacatnya justru hidup di selisih antara "penjaga
 *     dipanggil" dan "badan route berjalan". → Di sini yang dipanggil adalah
 *     `GET` yang diekspor `src/app/api/accounts/route.ts`.
 *
 * ══ SEBERAPA SETIA TIRUAN PERMINTAANNYA ════════════════════════════════════
 * Vitest tidak bisa menyediakan lingkup permintaan Next, jadi `next/headers`
 * ditiru. Kontrak yang ditiru bukan tebakan — ia DIUKUR di dalam route handler
 * dan render Next 16.2.1 yang sungguhan (`next dev`, Node 22.22): dua panggilan
 * `headers()` dalam satu permintaan mengembalikan objek yang IDENTIK, dan
 * permintaan lain mendapat objek lain. Itulah tepatnya yang `beginRequest()` di
 * bawah tirukan — satu objek per permintaan, tidak pernah dipakai ulang.
 *
 * Dua mekanisme kegagalan produksi TIDAK ditiru melainkan berjalan apa adanya:
 * `cache()` React memang tidak memoisasi di sini (tidak ada dispatcher, persis
 * seperti di route handler), dan `enterWith` sesudah `await` memang tidak
 * merambat di Node yang sama. Karena itu mengembalikan cacatnya membuat berkas
 * ini MERAH — dan itu sudah dibuktikan, bukan diharapkan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Dunia palsu: satu tenant, DUA perusahaan dengan basis data berbeda ───── */

const COMPANIES = [
  { id: 11, slug: "cv-maju", name: "CV Maju", databaseName: "sai_t1_cv-maju", tenantId: 1 },
  { id: 12, slug: "pt-sejahtera", name: "PT Sejahtera", databaseName: "sai_t1_pt-sejahtera", tenantId: 1 },
];
const TENANT_SLUGS: Record<number, string> = { 1: "acme" };

/** Bagan akun yang BERBEDA di tiap basis data — supaya jawabannya bisa dibedakan. */
const ACCOUNTS: Record<string, { id: number; code: string; name: string }[]> = {
  "sai_t1_cv-maju": [{ id: 1, code: "1000", name: "Kas CV Maju" }],
  "sai_t1_pt-sejahtera": [{ id: 2, code: "1000", name: "Kas PT Sejahtera" }],
};

const controlDb = vi.hoisted(() => ({
  company: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const membershipFor = vi.hoisted(() => vi.fn());
const authFn = vi.hoisted(() => vi.fn());
const headersFn = vi.hoisted(() => vi.fn());
const getCompanyClient = vi.hoisted(() => vi.fn());
const tenantStateForCompany = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/control-db", () => ({ controlDb }));
vi.mock("@/lib/company-registry", () => ({ membershipFor }));
vi.mock("@/lib/auth", () => ({ auth: authFn }));
vi.mock("next/headers", () => ({ headers: headersFn }));
vi.mock("@/lib/company-clients", () => ({ getCompanyClient }));
vi.mock("@/lib/tenant-state", () => ({ tenantStateForCompany }));

import { runWithoutCompany } from "@/lib/company-context";
import { invalidateTenantRoute } from "@/lib/company-route";
import { resetAuthzCachesForCompany } from "@/lib/authz-effective";
import { COMPANY_SLUG_HEADER, TENANT_SLUG_HEADER } from "@/lib/company-scope";
import { GET as accountsGet } from "@/app/api/accounts/route";

/** Basis data yang benar-benar disentuh query — inilah yang diuji, bukan niat. */
const touched: string[] = [];

function fakeClientFor(databaseName: string) {
  return {
    account: {
      findMany: async () => {
        touched.push(databaseName);
        return ACCOUNTS[databaseName] ?? [];
      },
    },
    // dibaca `authz-effective` (matriks efektif + modul + override pengguna)
    rolePermissionOverride: { findMany: async () => [] },
    userPermissionOverride: { findMany: async () => [] },
    companySetting: { findFirst: async () => null },
  };
}

/**
 * Mulai sebuah PERMINTAAN baru: objek header baru (identitasnya yang menjadi
 * jangkar penyimpan per-permintaan), dengan sepasang slug yang dibawa
 * `apiFetch()`.
 */
function beginRequest(tenantSlug: string, companySlug: string): void {
  const values: Record<string, string> = {
    [TENANT_SLUG_HEADER]: tenantSlug,
    [COMPANY_SLUG_HEADER]: companySlug,
  };
  // SATU objek untuk seluruh permintaan ini — sifat yang diukur di Next.
  const requestHeaders = { get: (name: string) => values[name] ?? null };
  headersFn.mockResolvedValue(requestHeaders);
}

/** Permintaan yang TIDAK membawa lingkupnya sama sekali. */
function beginRequestWithoutScope(): void {
  headersFn.mockResolvedValue({ get: () => null });
}

/** Jalankan handler seperti permintaan HTTP: TANPA store perusahaan apa pun. */
function asHttpRequest<T>(fn: () => Promise<T>): Promise<T> {
  return runWithoutCompany(fn);
}

beforeEach(() => {
  vi.clearAllMocks();
  touched.length = 0;

  for (const company of COMPANIES) {
    invalidateTenantRoute(TENANT_SLUGS[company.tenantId], company.slug);
    resetAuthzCachesForCompany(company.id);
  }

  authFn.mockResolvedValue({
    user: {
      id: "5",
      name: "Rina",
      email: "rina@example.com",
      role: "staff",
      companyId: 12,
      mustChangePassword: false,
    },
  });

  controlDb.company.findFirst.mockImplementation(
    async ({ where }: { where: { slug: string; tenant: { slug: string } } }) => {
      const row = COMPANIES.find(
        (c) => c.slug === where.slug && TENANT_SLUGS[c.tenantId] === where.tenant.slug
      );
      return row ? { id: row.id, tenantId: row.tenantId } : null;
    }
  );
  controlDb.user.findUnique.mockResolvedValue({ tenantId: 1 });
  membershipFor.mockImplementation(async (_userId: number, companyId: number) => {
    const company = COMPANIES.find((c) => c.id === companyId);
    if (!company) return null;
    return {
      role: "finance_manager",
      accountantMode: null,
      company: {
        companyId: company.id,
        slug: company.slug,
        name: company.name,
        databaseName: company.databaseName,
        isActive: true,
      },
    };
  });
  getCompanyClient.mockImplementation((databaseName: string) => fakeClientFor(databaseName));
  tenantStateForCompany.mockResolvedValue({ status: "active" });
});

describe("route handler sungguhan: konteks perusahaan sampai ke badannya", () => {
  it("GET /api/accounts menjawab 200 dan querynya mendarat di basis data PERUSAHAAN DI HEADER", async () => {
    /*
     * Inilah tes yang cacat #333 tidak bisa lolos. Dengan cacatnya, penjaga
     * berhasil menyelesaikan perusahaannya, lalu `isModuleActiveFor` di penjaga
     * yang sama memanggil `currentCompanyId()` — dan melempar
     * `MissingCompanyContextError` sebelum satu baris badan route berjalan.
     */
    beginRequest("acme", "cv-maju");
    const response = await asHttpRequest(() => accountsGet());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 1, code: "1000", name: "Kas CV Maju" },
    ]);
    // Bukan "penjaga tahu perusahaannya", melainkan "querynya benar-benar
    // dijalankan di buku itu" — satu-satunya bentuk yang berarti (#104).
    expect(touched).toEqual(["sai_t1_cv-maju"]);
  });

  it("permintaan BERIKUTNYA dengan perusahaan lain mendarat di buku lain — penyimpannya per-permintaan", async () => {
    /*
     * Kalau penyimpannya tingkat modul (dan bukan per-permintaan), tes ini
     * lulus dengan cara yang salah: permintaan kedua akan membaca sisa
     * permintaan pertama. Karena itu keduanya diperiksa, berurutan, dengan
     * sesi yang SAMA — dua tab, dua perusahaan.
     */
    beginRequest("acme", "cv-maju");
    const first = await asHttpRequest(() => accountsGet());
    expect(first.status).toBe(200);

    beginRequest("acme", "pt-sejahtera");
    const second = await asHttpRequest(() => accountsGet());
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual([
      { id: 2, code: "1000", name: "Kas PT Sejahtera" },
    ]);

    expect(touched).toEqual(["sai_t1_cv-maju", "sai_t1_pt-sejahtera"]);
  });

  it("tanpa lingkup di permintaan: 409, dan TIDAK ada satu pun query yang berjalan (#158)", async () => {
    /*
     * Sisi lain dari perbaikan yang sama, dan yang tidak boleh ikut longgar:
     * permintaan tanpa perusahaan tetap ditolak, bukan dijatuhkan ke
     * perusahaan mana pun.
     */
    beginRequestWithoutScope();
    const response = await asHttpRequest(() => accountsGet());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "company_required" });
    expect(touched).toEqual([]);
    expect(getCompanyClient).not.toHaveBeenCalled();
  });
});
