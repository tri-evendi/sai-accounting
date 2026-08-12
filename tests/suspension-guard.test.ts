/**
 * Gerbang HANYA-BACA saat tenant ditangguhkan — DIUJI LEWAT PENJAGANYA
 * (issue #156).
 *
 * `tests/subscription-lifecycle.test.ts` sudah menyapu `readOnlyRefusal(...)`
 * sebagai fungsi murni, tapi fungsi murni yang benar TIDAK membuktikan
 * penjaganya memanggilnya. Tes di sini menjalankan `requireApiPermission` dan
 * `requirePagePermission` yang SESUNGGUHNYA — dari sesi sampai keputusan —
 * dengan hanya tepian yang dipalsukan (sesi, basis data kendali, Prisma
 * perusahaan). Ukuran keberhasilannya harfiah: MENGHAPUS blok gerbang di
 * `auth-guard.ts` / `page-auth.ts` harus membuat berkas ini MERAH.
 *
 * Yang dikunci:
 *   • suspended/cancelled + izin TULIS → 403 `tenant_suspended` (API) dan
 *     pantulan ke /dashboard (halaman);
 *   • izin baca & `export` TETAP lolos — pelanggan menunggak wajib tetap bisa
 *     mengunduh bukunya;
 *   • trialing/active/past_due → tulis lolos;
 *   • perusahaan TANPA tenant (pemasangan di tengah adopsi #134) BUKAN
 *     hanya-baca;
 *   • aksi TAK DIKENAL dihitung TULIS — diuji MELALUI penjaga, bukan hanya di
 *     fungsi murninya;
 *   • suspensi terasa SEKETIKA di proses yang memanggil
 *     `invalidateTenantState()`; TANPA invalidasi, cache 60 detiknya memang
 *     dipakai — perilaku yang disengaja, bukan bug, dan TIDAK dilemahkan demi
 *     tes ini.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Permission } from "@/lib/authz";
import { encodeUnlockCookie, NAMA_COOKIE_KUNCI } from "@/lib/company-unlock";

/* ── Tepian yang dipalsukan ──────────────────────────────────────────────────
 * Hanya LIMA hal: sesi (auth), header permintaan (lingkup perusahaan yang
 * dibawa `apiFetch` — issue #158), basis data kendali (baris companies+tenant),
 * Prisma perusahaan (override izin & modul — kosong = matriks bawaan), dan
 * gerbang setup (selesai). Semua di antaranya — company-request, registry,
 * tenant-state BESERTA cache-nya, authz-effective, readOnlyRefusal — berjalan
 * ASLI.
 *
 * `enterCompanyFromRoute` ikut dipalsukan karena ia satu-satunya pintu ke basis
 * data KENDALI untuk keanggotaan, dan keanggotaan bukan yang diuji di sini —
 * sifatnya sendiri dikunci tests/company-route.test.ts. Yang penting: fake-nya
 * MENANAM konteks perusahaan sungguhan, sehingga seluruh lapisan di bawahnya
 * (authz-effective, tenant-state) berjalan sebagaimana adanya. */

interface FakeTenantRow {
  id: number;
  status: string;
  planKey: string;
  maxCompanies: number;
  maxUsers: number;
  trialEndsAt: Date | null;
}

interface FakeCompanyRow {
  slug: string;
  name: string;
  databaseName: string;
  isActive: boolean;
  tenant: FakeTenantRow | null;
}

const state = vi.hoisted(() => ({
  session: null as unknown,
  companies: new Map<number, FakeCompanyRow>() as Map<
    number,
    {
      slug: string;
      name: string;
      databaseName: string;
      isActive: boolean;
      tenant: {
        id: number;
        status: string;
        planKey: string;
        maxCompanies: number;
        maxUsers: number;
        trialEndsAt: Date | null;
      } | null;
    }
  >,
  userOverrides: [] as Array<{ permission: string; allowed: boolean }>,
  /** Slug PT yang "sedang dibuka" menurut alamat — sumber header lingkup. */
  activeSlug: null as string | null,
  /** Cookie kunci buku — diisi di `beforeEach`, lihat catatan di `vi.mock`. */
  unlockCookie: "" as string,
}));

const TENANT_SLUG = "tenant-uji";

/** `users.id` pemanggil di seluruh berkas ini — sama dengan sesi di bawah. */
const USER_ID = "1";

vi.mock("@/lib/auth", () => ({
  auth: async () => state.session,
}));

/* Lingkup perusahaan datang dari HEADER permintaan sejak #158 (disuntikkan
 * `apiFetch` dari alamat yang sedang dibuka). Di luar lingkup permintaan Next,
 * `headers()` melempar — jadi ia dipalsukan di sini, bukan dilewati. */
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name === "x-tenant-slug"
        ? TENANT_SLUG
        : name === "x-company-slug"
          ? state.activeSlug
          : null,
  }),
  /*
   * Kunci buku (otentikasi ulang, `lib/company-unlock.ts`) berdiri PALING AWAL
   * di `gateAfterCompany`, jadi tanpa cookie ini setiap tes di berkas ini akan
   * memantul ke `/unlock` sebelum sempat menyentuh gerbang suspensi yang
   * memang sedang diuji. Yang dipalsukan hanya PEMBACAAN cookienya; nilainya
   * ditandatangani sungguhan oleh `encodeUnlockCookie`, jadi tes ini tetap
   * gagal kalau verifikasi tanda tangannya rusak — bukan cangkang yang selalu
   * mengiyakan.
   */
  cookies: async () => ({
    get: (name: string) =>
      name === NAMA_COOKIE_KUNCI ? { name, value: state.unlockCookie } : undefined,
  }),
}));

vi.mock("@/lib/company-route", () => ({
  enterCompanyFromRoute: async ({
    tenantSlug,
    companySlug,
  }: {
    tenantSlug: string;
    companySlug: string;
  }) => {
    const entry = [...state.companies.entries()].find(([, row]) => row.slug === companySlug);
    if (!entry || tenantSlug !== TENANT_SLUG) return { ok: false, reason: "not-found" };
    const [companyId, row] = entry;
    if (!row.isActive) return { ok: false, reason: "not-found" };
    enterCompanyContext({ companyId, slug: row.slug, databaseName: row.databaseName });
    return {
      ok: true,
      companyId,
      tenantSlug,
      companySlug,
      companyName: row.name,
      role: ROLES.MANAGING_DIRECTOR,
      accountantMode: null,
    };
  },
}));

vi.mock("@/lib/control-db", () => ({
  controlDb: {
    company: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: number };
        select?: Record<string, unknown>;
      }) => {
        const row = state.companies.get(where.id);
        if (!row) return null;
        // Dua pemakai, dua bentuk select: registry meminta kolom datar,
        // tenant-state meminta relasi `tenant` — dibedakan persis seperti
        // MariaDB membedakannya.
        if (select && "tenant" in select) return { tenant: row.tenant };
        return {
          id: where.id,
          slug: row.slug,
          name: row.name,
          databaseName: row.databaseName,
          isActive: row.isActive,
        };
      },
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rolePermissionOverride: { findMany: async () => [] },
    userPermissionOverride: { findMany: async () => state.userOverrides },
    companySetting: { findFirst: async () => ({ enabledModules: null }) },
  },
}));

vi.mock("@/lib/setup-gate", () => ({
  isSetupDone: async () => true,
}));

/* `redirect` Next tidak pernah kembali; mock-nya MELEMPAR supaya kode setelah
 * pantulan tidak ikut berjalan — persis kontrak aslinya. */
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireApiPermission } from "@/lib/auth-guard";
import { requirePagePermission } from "@/lib/page-auth";
import { enterCompanyContext } from "@/lib/company-context";
import { invalidateTenantState } from "@/lib/tenant-state";
import {
  invalidateEffectiveMatrix,
  invalidateEnabledModules,
  invalidateUserOverrides,
} from "@/lib/authz-effective";
import { ROLES } from "@/lib/constants";

/* Setiap skenario memakai companyId BARU: cache tenant-state & registry (60
 * dtk) tidak pernah menyimpan sisa skenario lain — kecuali di tes yang memang
 * menguji cache itu sendiri. */
let nextCompanyId = 9000;

function seedCompany(tenantStatus: string | null): number {
  nextCompanyId += 1;
  const id = nextCompanyId;
  /*
   * Buku setiap PT yang di-seed dianggap SUDAH terbuka. Berkas ini menguji
   * gerbang suspensi, sedangkan gerbang kunci buku (otentikasi ulang,
   * `lib/company-unlock.ts`) berdiri lebih awal — tanpa baris ini setiap tes
   * memantul ke `/unlock` sebelum sempat menyentuh yang sedang diuji.
   *
   * Cookienya DITANDATANGANI sungguhan, bukan cangkang yang selalu mengiyakan:
   * kalau verifikasi tanda tangan atau pengikatan ke `users.id` rusak, tes di
   * berkas ini ikut merah.
   */
  state.unlockCookie = encodeUnlockCookie({
    u: USER_ID,
    c: [...state.companies.keys(), id].map((c) => [c, Date.now() + 60 * 60 * 1000] as const),
  });
  state.companies.set(id, {
    slug: `pt-uji-${id}`,
    name: `PT Uji ${id}`,
    databaseName: `sai_uji_${id}`,
    isActive: true,
    tenant:
      tenantStatus === null
        ? null
        : {
            id: id * 10,
            status: tenantStatus,
            planKey: "starter",
            maxCompanies: 3,
            maxUsers: 10,
            trialEndsAt: null,
          },
  });
  return id;
}

/** Direktur Utama — memegang SEMUA izin perusahaan, jadi satu-satunya gerbang
 *  yang bisa menolaknya adalah gerbang hanya-baca yang sedang diuji.
 *
 *  `companyId` di sesi sengaja dibiarkan `null`: sejak #158 sesi tidak lagi
 *  punya suara tentang perusahaan mana, dan menaruhnya di sini akan membuat
 *  tes ini lulus seandainya penjaga diam-diam membacanya kembali. */
function openSession(companyId: number): void {
  const row = state.companies.get(companyId);
  state.activeSlug = row?.slug ?? null;
  state.session = {
    user: {
      id: "1",
      role: ROLES.MANAGING_DIRECTOR,
      name: "Penguji",
      email: "penguji@example.com",
      companyId: null,
      mustChangePassword: false,
    },
  };
}

/** `params` halaman bertenant untuk PT yang sedang dibuka. */
function routeParams() {
  return { tenantSlug: TENANT_SLUG, companySlug: state.activeSlug ?? "" };
}

/** Beranda PT yang sedang dibuka — tujuan setiap pantulan penolakan. */
function homePath(): string {
  return `/t/${TENANT_SLUG}/${state.activeSlug}`;
}

async function expectRedirect(promise: Promise<unknown>, url: string): Promise<void> {
  await expect(promise).rejects.toThrowError(`REDIRECT:${url}`);
}

beforeEach(() => {
  state.session = null;
  state.activeSlug = null;
  state.unlockCookie = "";
  state.userOverrides = [];
  state.companies.clear();
  invalidateTenantState();
  invalidateEffectiveMatrix();
  invalidateEnabledModules();
  invalidateUserOverrides(1);
});

describe("requireApiPermission — suspended/cancelled = HANYA-BACA (gerbang auth-guard.ts)", () => {
  it.each(["suspended", "cancelled"])(
    "tenant %s: izin TULIS ditolak 403 dengan code tenant_suspended",
    async (status) => {
      openSession(seedCompany(status));

      for (const permission of ["invoice.write", "customer.delete", "user.manage"] as Permission[]) {
        const result = await requireApiPermission(permission);
        expect(result.authorized, permission).toBe(false);
        if (result.authorized) continue;
        expect(result.response.status, permission).toBe(403);
        const body = await result.response.json();
        expect(body.code, permission).toBe("tenant_suspended");
        expect(body.error, permission).toMatch(/HANYA-BACA/);
      }
    }
  );

  it.each(["suspended", "cancelled"])(
    "tenant %s: izin BACA dan EKSPOR tetap lolos — kewajiban retensi tidak terhalang tagihan",
    async (status) => {
      const companyId = seedCompany(status);
      openSession(companyId);

      for (const permission of ["invoice.read", "report.read", "report.export"] as Permission[]) {
        const result = await requireApiPermission(permission);
        expect(result.authorized, permission).toBe(true);
        if (result.authorized) expect(result.companyId).toBe(companyId);
      }
    }
  );

  it.each(["trialing", "active", "past_due"])(
    "tenant %s: izin tulis LOLOS — hanya suspended/cancelled yang hanya-baca",
    async (status) => {
      openSession(seedCompany(status));
      const result = await requireApiPermission("invoice.write");
      expect(result.authorized).toBe(true);
    }
  );

  it("perusahaan TANPA tenant (adopsi #134 belum tuntas) BUKAN hanya-baca", async () => {
    openSession(seedCompany(null));
    const result = await requireApiPermission("invoice.write");
    expect(result.authorized).toBe(true);
  });

  it("aksi TAK DIKENAL dihitung TULIS — melalui penjaga, bukan hanya fungsi murninya", async () => {
    /* Izin beraksi asing lahir lewat override per pengguna (jalur yang sama
     * dengan izin baru yang lupa didaftar di READ_ACTIONS): override
     * MELOLOSKAN cek peran, sehingga satu-satunya yang bisa menolak adalah
     * gerbang hanya-baca — dan arah gagalnya harus TERTUTUP. */
    state.userOverrides = [{ permission: "invoice.frobnicate", allowed: true }];

    openSession(seedCompany("suspended"));
    const refused = await requireApiPermission("invoice.frobnicate" as Permission);
    expect(refused.authorized).toBe(false);
    if (!refused.authorized) {
      expect(refused.response.status).toBe(403);
      expect((await refused.response.json()).code).toBe("tenant_suspended");
    }

    // Pembanding: pada tenant aktif izin yang sama lolos — penolakan di atas
    // benar-benar datang dari gerbang hanya-baca, bukan dari cek izin.
    openSession(seedCompany("active"));
    const allowed = await requireApiPermission("invoice.frobnicate" as Permission);
    expect(allowed.authorized).toBe(true);
  });

  it("suspensi terasa SEKETIKA setelah invalidateTenantState(); tanpa invalidasi, cache 60 dtk memang dipakai", async () => {
    const companyId = seedCompany("active");
    openSession(companyId);

    // Tulis lolos — dan status kini ter-cache untuk perusahaan ini.
    expect((await requireApiPermission("invoice.write")).authorized).toBe(true);

    // Proses LAIN menangguhkan tenantnya; proses ini belum diberi tahu.
    // Masih lolos = perilaku yang DISENGAJA (TTL 60 dtk, tenant-state.ts) —
    // bukan celah, dan tes ini tidak menuntut lebih dari satu TTL.
    state.companies.get(companyId)!.tenant!.status = "suspended";
    expect((await requireApiPermission("invoice.write")).authorized).toBe(true);

    // Proses yang MENULIS suspensi memanggil invalidateTenantState() —
    // di situ penolakannya wajib seketika.
    invalidateTenantState();
    const refused = await requireApiPermission("invoice.write");
    expect(refused.authorized).toBe(false);
    if (!refused.authorized) {
      expect((await refused.response.json()).code).toBe("tenant_suspended");
    }
  });
});

describe("requirePagePermission — cerminan gerbang yang sama (page-auth.ts)", () => {
  it.each(["suspended", "cancelled"])(
    "tenant %s: halaman ber-izin TULIS dipantulkan ke /dashboard",
    async (status) => {
      openSession(seedCompany(status));
      await expectRedirect(requirePagePermission("invoice.write", routeParams()), homePath());
    }
  );

  it("tenant suspended: halaman BACA dan EKSPOR tetap terbuka", async () => {
    openSession(seedCompany("suspended"));
    await expect(requirePagePermission("invoice.read", routeParams())).resolves.toBeTruthy();
    await expect(requirePagePermission("report.export", routeParams())).resolves.toBeTruthy();
  });

  it("tenant aktif: halaman tulis terbuka — pantulan di atas benar-benar milik gerbang hanya-baca", async () => {
    openSession(seedCompany("active"));
    const session = await requirePagePermission("invoice.write", routeParams());
    expect(session.user.role).toBe(ROLES.MANAGING_DIRECTOR);
  });

  it("perusahaan tanpa tenant: halaman tulis terbuka — gerbangnya tentang suspensi, bukan adopsi", async () => {
    openSession(seedCompany(null));
    await expect(requirePagePermission("invoice.write", routeParams())).resolves.toBeTruthy();
  });
});
