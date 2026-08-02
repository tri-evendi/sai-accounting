/**
 * Dari JALUR URL ke konteks perusahaan (lib/company-route.ts) — issue #157,
 * dan pasangan lintas-tenant yang diminta #156.
 *
 * Ini gerbang yang dilewati setiap halaman `/t/{tenant}/{company}/…` sebelum
 * satu query pun berjalan, jadi yang diuji bukan "true/false" melainkan
 * akibat-akibat yang masing-masing berbeda bila salah:
 *
 *  1. Perusahaan tenant LAIN yang slugnya kebetulan sama dijawab persis seperti
 *     slug yang tidak pernah ada. Sejak #153 slug hanya unik DI DALAM tenant,
 *     jadi `cv-maju` milik dua pelanggan adalah keadaan normal — bukan kasus
 *     pinggiran. Jawaban yang BERBEDA untuk keduanya sudah cukup untuk memetakan
 *     pelanggan orang lain (§4.4 docs/MULTI-TENANT.md).
 *  2. Peran datang dari KEANGGOTAAN yang baru dibaca, bukan dari sesi. Sesi
 *     menyimpan peran di perusahaan yang TERAKHIR dibuka; memakainya di sini
 *     memberi hak PT A di buku PT B.
 *  3. Perusahaan NONAKTIF dan bukan-anggota memakai jawaban yang sama — 404,
 *     bukan 403, dan bukan galat basis data yang berujung 500.
 *
 * Basis data kendali dipalsukan DENGAN MENGHORMATI where-clause: bila penjaga
 * berhenti menyaring tenant, fake-nya mengembalikan baris asing dan tes ini
 * merah — arah gagal yang memang diinginkan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Dunia palsu: dua tenant, dua PT dengan slug yang SAMA ────────────────── */

const COMPANIES = [
  { id: 11, slug: "cv-maju", name: "CV Maju", databaseName: "sai_t1_cv-maju", isActive: true, tenantId: 1 },
  // Slug kembar milik tenant LAIN — sah sejak #153, dan justru inilah yang
  // membuat tenant wajib ada di jalur.
  { id: 22, slug: "cv-maju", name: "CV Maju (pelanggan lain)", databaseName: "sai_t2_cv-maju", isActive: true, tenantId: 2 },
  { id: 33, slug: "pt-tutup", name: "PT Tutup", databaseName: "sai_t1_pt-tutup", isActive: false, tenantId: 1 },
];

const TENANT_SLUGS: Record<number, string> = { 1: "acme", 2: "globex" };

/** Keanggotaan akuntansi: (userId, companyId) → peran. */
const MEMBERSHIPS = new Map<string, { role: string; accountantMode: boolean | null }>([
  ["5:11", { role: "finance_manager", accountantMode: null }],
  // Anggota di PT tenant lain — keadaan yang TIDAK BISA lahir lewat alur normal
  // (satu pengguna, satu tenant), dipasang di sini justru untuk membuktikan
  // penjaganya tetap menolak bila suatu hari ia lahir lewat skrip perbaikan.
  ["5:22", { role: "managing_director", accountantMode: null }],
  ["5:33", { role: "staff", accountantMode: null }],
]);

/** Pengguna → tenant pemiliknya. */
const USER_TENANT: Record<number, number | null> = { 5: 1, 9: null };

const controlDb = vi.hoisted(() => ({
  company: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const membershipFor = vi.hoisted(() => vi.fn());
const setRouteCompany = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/control-db", () => ({ controlDb }));
vi.mock("@/lib/company-registry", () => ({ membershipFor }));
vi.mock("@/lib/current-company", () => ({ setRouteCompany }));

import { enterCompanyFromRoute, routeForCompany } from "@/lib/company-route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  controlDb.company.findFirst.mockImplementation(
    async ({ where }: { where: { slug: string; tenant: { slug: string } } }) => {
      const row = COMPANIES.find(
        (c) => c.slug === where.slug && TENANT_SLUGS[c.tenantId] === where.tenant.slug
      );
      return row ? { id: row.id, tenantId: row.tenantId } : null;
    }
  );

  controlDb.company.findUnique.mockImplementation(
    async ({ where }: { where: { id: number } }) => {
      const row = COMPANIES.find((c) => c.id === where.id);
      return row
        ? { slug: row.slug, isActive: row.isActive, tenant: { slug: TENANT_SLUGS[row.tenantId] } }
        : null;
    }
  );

  controlDb.user.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
    const tenantId = USER_TENANT[where.id];
    return tenantId === undefined ? null : { tenantId, tenant: null };
  });

  membershipFor.mockImplementation(async (userId: number, companyId: number) => {
    const company = COMPANIES.find((c) => c.id === companyId);
    const hit = MEMBERSHIPS.get(`${userId}:${companyId}`);
    // Cerminan `company-registry.membershipFor`: PT nonaktif = bukan keanggotaan.
    if (!hit || !company || !company.isActive) return null;
    return {
      role: hit.role,
      accountantMode: hit.accountantMode,
      company: {
        companyId: company.id,
        slug: company.slug,
        name: company.name,
        databaseName: company.databaseName,
        isActive: company.isActive,
      },
    };
  });
});

const NOT_FOUND = { ok: false, reason: "not-found" };

describe("enterCompanyFromRoute — jalan yang benar", () => {
  it("menanam konteks & mengembalikan peran DARI KEANGGOTAAN", async () => {
    const result = await enterCompanyFromRoute({
      tenantSlug: "acme",
      companySlug: "cv-maju",
      userId: "5",
    });

    expect(result).toEqual({
      ok: true,
      companyId: 11,
      tenantSlug: "acme",
      companySlug: "cv-maju",
      companyName: "CV Maju",
      role: "finance_manager",
      accountantMode: null,
    });
    // Konteks ditulis ke penyimpan per-permintaan, bukan hanya ke ALS: tanpa
    // itu `currentCompany()` bisa jatuh ke perusahaan di SESI.
    expect(setRouteCompany).toHaveBeenCalledWith({
      companyId: 11,
      slug: "cv-maju",
      databaseName: "sai_t1_cv-maju",
    });
  });
});

describe("lintas-tenant = 404 yang IDENTIK (issue #156)", () => {
  it("PT tenant lain dijawab persis seperti slug yang tak pernah ada", async () => {
    /*
     * Pemanggil ini bahkan PUNYA keanggotaan di PT tenant lain (baris yatim
     * yang sengaja dipasang di dunia palsu). Ia tetap ditolak — dan ditolak
     * dengan jawaban yang sama persis dengan slug fiktif, sehingga tidak ada
     * satu bit pun yang membedakan "ada tapi bukan punyamu" dari "tidak ada".
     */
    const foreign = await enterCompanyFromRoute({
      tenantSlug: "globex",
      companySlug: "cv-maju",
      userId: "5",
    });
    const fictitious = await enterCompanyFromRoute({
      tenantSlug: "tidak-ada",
      companySlug: "juga-tidak-ada",
      userId: "5",
    });

    expect(foreign).toEqual(NOT_FOUND);
    expect(JSON.stringify(foreign)).toBe(JSON.stringify(fictitious));
    expect(setRouteCompany).not.toHaveBeenCalled();
  });

  it("slug perusahaan yang tidak ada DI TENANT ini juga 404 yang sama", async () => {
    const result = await enterCompanyFromRoute({
      tenantSlug: "acme",
      companySlug: "pt-entah",
      userId: "5",
    });
    expect(result).toEqual(NOT_FOUND);
  });

  it("pengguna tanpa tenant tidak bisa membuka PT mana pun", async () => {
    // Sisa masa adopsi #134: akun tanpa `tenant_id`. Gagal-TERTUTUP.
    const result = await enterCompanyFromRoute({
      tenantSlug: "acme",
      companySlug: "cv-maju",
      userId: "9",
    });
    expect(result).toEqual(NOT_FOUND);
  });
});

describe("penolakan lain memakai jawaban yang sama", () => {
  it("bukan anggota → 404, bukan 403", async () => {
    const result = await enterCompanyFromRoute({
      tenantSlug: "acme",
      companySlug: "cv-maju",
      userId: "7",
    });
    expect(result).toEqual(NOT_FOUND);
  });

  it("perusahaan NONAKTIF → 404, bukan 500 dari basis data yang tak lagi dibuka", async () => {
    const result = await enterCompanyFromRoute({
      tenantSlug: "acme",
      companySlug: "pt-tutup",
      userId: "5",
    });
    expect(result).toEqual(NOT_FOUND);
  });

  it("slug berbentuk aneh ditolak SEBELUM menjadi query", async () => {
    const result = await enterCompanyFromRoute({
      tenantSlug: "..",
      companySlug: "cv-maju",
      userId: "5",
    });
    expect(result).toEqual(NOT_FOUND);
    expect(controlDb.company.findFirst).not.toHaveBeenCalled();
  });

  it("tanpa sesi dibedakan dari 404 — orangnya perlu MASUK, bukan diberi tahu tak ada", async () => {
    expect(
      await enterCompanyFromRoute({ tenantSlug: "acme", companySlug: "cv-maju", userId: null })
    ).toEqual({ ok: false, reason: "no-session" });
  });
});

describe("routeForCompany — jalan pulang untuk sesi lama", () => {
  it("memetakan id perusahaan kembali ke sepasang slug jalurnya", async () => {
    expect(await routeForCompany(11)).toEqual({ tenantSlug: "acme", companySlug: "cv-maju" });
  });

  it("perusahaan nonaktif tidak punya jalur — pemanggilnya jatuh ke pemilih, bukan 404", async () => {
    expect(await routeForCompany(33)).toBeNull();
    expect(await routeForCompany(999)).toBeNull();
  });
});
