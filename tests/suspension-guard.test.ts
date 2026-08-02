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

/* ── Tepian yang dipalsukan ──────────────────────────────────────────────────
 * Hanya EMPAT hal: sesi (auth), basis data kendali (baris companies+tenant),
 * Prisma perusahaan (override izin & modul — kosong = matriks bawaan), dan
 * gerbang setup (selesai). Semua di antaranya — company-session, registry,
 * tenant-state BESERTA cache-nya, authz-effective, readOnlyRefusal — berjalan
 * ASLI. */

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
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => state.session,
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
 *  yang bisa menolaknya adalah gerbang hanya-baca yang sedang diuji. */
function openSession(companyId: number): void {
  state.session = {
    user: {
      id: "1",
      role: ROLES.MANAGING_DIRECTOR,
      name: "Penguji",
      email: "penguji@example.com",
      companyId,
      mustChangePassword: false,
    },
  };
}

async function expectRedirect(promise: Promise<unknown>, url: string): Promise<void> {
  await expect(promise).rejects.toThrowError(`REDIRECT:${url}`);
}

beforeEach(() => {
  state.session = null;
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
      await expectRedirect(requirePagePermission("invoice.write"), "/dashboard");
    }
  );

  it("tenant suspended: halaman BACA dan EKSPOR tetap terbuka", async () => {
    openSession(seedCompany("suspended"));
    await expect(requirePagePermission("invoice.read")).resolves.toBeTruthy();
    await expect(requirePagePermission("report.export")).resolves.toBeTruthy();
  });

  it("tenant aktif: halaman tulis terbuka — pantulan di atas benar-benar milik gerbang hanya-baca", async () => {
    openSession(seedCompany("active"));
    const session = await requirePagePermission("invoice.write");
    expect(session.user.role).toBe(ROLES.MANAGING_DIRECTOR);
  });

  it("perusahaan tanpa tenant: halaman tulis terbuka — gerbangnya tentang suspensi, bukan adopsi", async () => {
    openSession(seedCompany(null));
    await expect(requirePagePermission("invoice.write")).resolves.toBeTruthy();
  });
});
