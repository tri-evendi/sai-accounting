/**
 * `/api/user/companies` ikut menjawab BOLEH-TIDAKNYA membuka /tenant.
 *
 * Kenapa ini diuji sendiri: halaman akun tenant (langganan, tagihan, undangan
 * staf, ekspor data) menuntut `tenant.settings` — OWNER saja. Sebelum
 * perbaikan ini satu-satunya tautan menujunya ada di `/select-company`, layar
 * yang pengguna BER-PT-SATU tidak pernah lihat karena perusahaannya
 * dipilihkan otomatis. Akibatnya halaman tempat pelanggan mengurus langganan
 * dan mengunduh datanya praktis tak terlihat.
 *
 * Yang dijaga di sini ada dua, dan keduanya mudah rusak diam-diam:
 *   1. jawabannya datang dari KEANGGOTAAN TENANT yang dibaca server, bukan
 *      dari peran DI PERUSAHAAN yang kebetulan ada di sesi;
 *   2. bukan-owner TIDAK mendapat tautannya — menawarkan tautan yang memantul
 *      sama tidak membantunya dengan tidak ada tautan sama sekali.
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

describe("/api/user/companies — tautan akun tenant (owner saja)", () => {
  it("owner tenant BOLEH: canManageTenant true", async () => {
    state.membership = { role: "owner" };
    const body = await (await GET()).json();
    expect(body.canManageTenant).toBe(true);
  });

  it("bukan owner TIDAK: peran tenant lain tetap false", async () => {
    state.membership = { role: "member" };
    const body = await (await GET()).json();
    expect(body.canManageTenant).toBe(false);
  });

  it("tanpa keanggotaan tenant (sisa masa adopsi #134) → false, bukan meledak", async () => {
    state.membership = null;
    const body = await (await GET()).json();
    expect(body.canManageTenant).toBe(false);
  });

  it("jawabannya TIDAK diambil dari peran di perusahaan yang ada di sesi", async () => {
    // Peran PT penuh akses, tetapi bukan owner TENANT: tetap tidak boleh.
    state.session = { user: { id: "7", companyId: 1 } };
    state.membership = { role: "member" };
    const body = await (await GET()).json();
    expect(body.canManageTenant).toBe(false);
    // Daftar perusahaannya tetap dijawab seperti biasa.
    expect(body.companies).toHaveLength(1);
  });

  it("tanpa sesi → 401, sebelum keanggotaan tenant dibaca sama sekali", async () => {
    state.session = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
