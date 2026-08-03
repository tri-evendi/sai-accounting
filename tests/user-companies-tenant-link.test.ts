/**
 * `/api/user/companies` ikut menjawab BOLEH-TIDAKNYA membuka `/platform`.
 *
 * Kenapa ini diuji sendiri: menu pengguna tidak boleh menebak kewenangan
 * tenant. Sesi hanya membawa peran DI PERUSAHAAN (seseorang bisa Direktur di
 * PT A dan staf gudang di PT B), sedangkan pintu ke halaman akun ditentukan
 * KEANGGOTAAN TENANT — yang hanya bisa dibaca server.
 *
 * Sejak issue #172 halaman itu beralamat `/platform` dan menjadi pendaratan
 * pasca-masuk SETIAP anggota tenant (`tenant.home`), bukan lagi layar owner
 * (`tenant.settings`). Dua hal yang dijaga di sini, dan keduanya mudah rusak
 * diam-diam:
 *   1. jawabannya datang dari keanggotaan TENANT yang dibaca server;
 *   2. yang TIDAK punya keanggotaan tenant sama sekali (sisa masa adopsi #134)
 *      tetap tidak ditawari tautannya — menawarkan pintu yang memantul sama
 *      tidak membantunya dengan tidak ada pintu sama sekali.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  session: { user: { id: string; companyId: number | null } } | null;
  membership: { role: string } | null;
} = { session: null, membership: null };

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/tenant-directory", () => ({
  tenantMembershipForUser: async () => state.membership,
}));
vi.mock("@/lib/company-registry", () => ({
  companiesForUser: async () => [
    { companyId: 1, name: "PT Satu", slug: "pt-satu", databaseName: "sai_t1_pt_satu" },
  ],
}));
vi.mock("@/lib/company-request", () => ({ companyScopeFromRequest: async () => null }));
vi.mock("@/lib/i18n/server", () => ({
  getRequestI18n: async () => ({ t: (key: string) => key }),
}));

const { GET } = await import("@/app/api/user/companies/route");

beforeEach(() => {
  state.session = { user: { id: "7", companyId: 1 } };
  state.membership = null;
});

describe("/api/user/companies — tautan halaman akun (/platform)", () => {
  it("owner tenant BOLEH: canOpenPlatform true", async () => {
    state.membership = { role: "owner" };
    const body = await (await GET()).json();
    expect(body.canOpenPlatform).toBe(true);
  });

  it("member biasa JUGA boleh sejak #172 — di sanalah daftar perusahaannya", async () => {
    state.membership = { role: "member" };
    const body = await (await GET()).json();
    expect(body.canOpenPlatform).toBe(true);
  });

  it("admin tenant boleh", async () => {
    state.membership = { role: "admin" };
    const body = await (await GET()).json();
    expect(body.canOpenPlatform).toBe(true);
  });

  it("tanpa keanggotaan tenant (sisa masa adopsi #134) → false, bukan meledak", async () => {
    state.membership = null;
    const body = await (await GET()).json();
    expect(body.canOpenPlatform).toBe(false);
  });

  it("peran yang tidak dikenal ditolak — deny-by-default, bukan 'boleh saja'", async () => {
    // Peran PT penuh akses BUKAN peran tenant: matriks tenant tidak mengenalnya.
    state.membership = { role: "managing_director" };
    const body = await (await GET()).json();
    expect(body.canOpenPlatform).toBe(false);
    // Daftar perusahaannya tetap dijawab seperti biasa.
    expect(body.companies).toHaveLength(1);
  });

  it("tanpa sesi → 401, sebelum keanggotaan tenant dibaca sama sekali", async () => {
    state.session = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
