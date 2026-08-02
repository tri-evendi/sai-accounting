/**
 * Bacaan konsol operator (issue #154) — sifat inti yang diuji: TAHAN MATI.
 * `sai_platform` yang tidak terjangkau TIDAK BOLEH mematikan halaman —
 * daftar tenant tetap terisi (murni kendali), rincian tenant tetap tampil
 * dengan `billing: null`, rekonsiliasi & riwayat penjadwal menjawab `null`
 * (kalimat "tidak terjangkau"), tidak pernah 500. Pola yang sama dengan
 * `billingOverviewForTenant`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  listTenantsForOperator,
  reconciliationForOperator,
  schedulerRunsForOperator,
  tenantDetailForOperator,
} from "@/lib/operator/store";

type Deps = Parameters<typeof tenantDetailForOperator>[1];

const TENANT = {
  id: 7,
  name: "PT Contoh Sejahtera",
  slug: "contoh",
  status: "active",
  planKey: "starter",
  trialEndsAt: null,
  maxCompanies: 3,
  maxUsers: 10,
  createdAt: new Date("2026-01-15T00:00:00Z"),
};

/** Klien kendali palsu — cukup untuk jalur yang dipakai store. */
function fakeControl() {
  return {
    tenant: {
      findMany: vi.fn(async () => [TENANT]),
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) =>
        where.id === TENANT.id ? TENANT : null
      ),
    },
    company: {
      groupBy: vi.fn(async () => [{ tenantId: 7, _count: { _all: 2 } }]),
      findMany: vi.fn(async () => [
        {
          id: 21,
          name: "PT Contoh Sejahtera",
          slug: "pusat",
          isActive: true,
          createdAt: new Date("2026-01-16T00:00:00Z"),
        },
        {
          id: 22,
          name: "PT Contoh Cabang",
          slug: "cabang",
          isActive: false,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ]),
    },
    user: {
      groupBy: vi.fn(async () => [{ tenantId: 7, _count: { _all: 4 } }]),
      count: vi.fn(async () => 4),
    },
    membership: {
      groupBy: vi.fn(async () => [{ companyId: 21, _count: { _all: 3 } }]),
    },
  } as unknown as NonNullable<Deps>["control"];
}

/** Platform MATI: setiap sentuhan model melempar — persis Proxy `platformDb`
 *  saat PLATFORM_DATABASE_URL kosong / basisnya tumbang. */
function deadPlatform() {
  const boom = () => {
    throw new Error("PLATFORM_DATABASE_URL is not set");
  };
  return new Proxy({}, { get: boom }) as NonNullable<Deps>["platform"];
}

function silenced<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return fn().finally(() => spy.mockRestore());
}

describe("listTenantsForOperator — murni kendali", () => {
  it("mengembalikan baris + pemakaian TANPA menyentuh platform sama sekali", async () => {
    const rows = await listTenantsForOperator({}, { control: fakeControl() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      slug: "contoh",
      planKey: "starter",
      usage: { companies: 2, users: 4 },
    });
  });

  it("tenant tanpa hitungan → pemakaian 0, bukan lubang", async () => {
    const control = fakeControl();
    (control.company.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (control.user.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const rows = await listTenantsForOperator({}, { control });
    expect(rows[0].usage).toEqual({ companies: 0, users: 0 });
  });
});

describe("tenantDetailForOperator — platform mati ≠ halaman mati", () => {
  it("bagian kendali tetap utuh, billing = null", async () => {
    const detail = await silenced(() =>
      tenantDetailForOperator(7, { control: fakeControl(), platform: deadPlatform() })
    );
    expect(detail).not.toBeNull();
    expect(detail!.tenant.slug).toBe("contoh");
    expect(detail!.usage).toEqual({ companies: 1, users: 4 }); // aktif saja
    expect(detail!.companies).toHaveLength(2);
    expect(detail!.companies[0].userCount).toBe(3);
    expect(detail!.companies[1].userCount).toBe(0);
    expect(detail!.billing).toBeNull();
  });

  it("tenant tidak ada → null (404), bukan galat", async () => {
    const detail = await tenantDetailForOperator(999, {
      control: fakeControl(),
      platform: deadPlatform(),
    });
    expect(detail).toBeNull();
  });

  it("platform hidup → langganan, tagihan + pembayaran, profil pajak terisi", async () => {
    const platform = {
      subscription: {
        findFirst: vi.fn(async () => ({
          status: "active",
          billingCycle: "monthly",
          price: { toString: () => "150000.00" },
          currency: "IDR",
          currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
          currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
          trialEndsAt: null,
          pastDueSince: null,
          cancelledAt: null,
          plan: { key: "starter", name: "Starter" },
        })),
      },
      platformInvoice: {
        findMany: vi.fn(async () => [
          {
            id: 31,
            number: "PINV-2026-00031",
            status: "issued",
            issueDate: new Date("2026-07-01T00:00:00Z"),
            dueDate: new Date("2026-07-08T00:00:00Z"),
            amount: { toString: () => "150000.00" },
            taxAmount: { toString: () => "16500.00" },
            total: { toString: () => "166500.00" },
            currency: "IDR",
          },
        ]),
      },
      payment: {
        findMany: vi.fn(async () => [
          {
            id: 41,
            platformInvoiceId: 31,
            status: "pending",
            method: "virtual_account",
            gateway: "midtrans",
            amount: { toString: () => "166500.00" },
            bank: "bca",
            vaNumber: "12345678",
            paidAt: null,
            createdAt: new Date("2026-07-01T01:00:00Z"),
          },
        ]),
      },
      tenantBillingProfile: {
        findUnique: vi.fn(async () => ({ npwp: "01.234.567.8-901.000", name: "PT Contoh", address: null })),
      },
    } as unknown as NonNullable<Deps>["platform"];

    const detail = await tenantDetailForOperator(7, { control: fakeControl(), platform });
    expect(detail!.billing).not.toBeNull();
    expect(detail!.billing!.subscription).toMatchObject({ status: "active", price: "150000.00" });
    expect(detail!.billing!.invoices[0]).toMatchObject({ number: "PINV-2026-00031", total: "166500.00" });
    expect(detail!.billing!.invoices[0].payments[0]).toMatchObject({ status: "pending", vaNumber: "12345678" });
    expect(detail!.billing!.profile?.npwp).toBe("01.234.567.8-901.000");
  });
});

describe("reconciliationForOperator", () => {
  it("platform mati → null (kalimat 'tidak terjangkau'), bukan lemparan", async () => {
    const control = {
      $queryRaw: vi.fn(async () => [{ id: 7, status: "active" }]),
    } as unknown as NonNullable<Deps>["control"];
    const report = await silenced(() =>
      reconciliationForOperator({ control, platform: deadPlatform() })
    );
    expect(report).toBeNull();
  });

  it("kedua sisi terbaca → laporan runReconciliation apa adanya", async () => {
    const control = {
      $queryRaw: vi.fn(async () => []),
    } as unknown as NonNullable<Deps>["control"];
    const platform = {
      subscription: { findMany: vi.fn(async () => []) },
      usageCounter: { findMany: vi.fn(async () => []) },
    } as unknown as NonNullable<Deps>["platform"];
    const report = await reconciliationForOperator({ control, platform });
    expect(report).toEqual({ findings: [], skipped: [], subscriptionsChecked: 0 });
  });
});

describe("schedulerRunsForOperator", () => {
  it("platform mati / tabel belum ada → null", async () => {
    const runs = await silenced(() => schedulerRunsForOperator(5, { platform: deadPlatform() }));
    expect(runs).toBeNull();
  });

  it("baris ada → ringkasan + details JSON terurai (JSON korup → null yang tenang)", async () => {
    const platform = {
      schedulerRun: {
        findMany: vi.fn(async () => [
          {
            id: 2,
            startedAt: new Date("2026-08-01T01:00:00Z"),
            finishedAt: new Date("2026-08-01T01:00:05Z"),
            status: "error",
            invoicesIssued: 1,
            remindersSent: 2,
            statusChanges: 1,
            adoptions: 0,
            errorCount: 1,
            details: JSON.stringify({
              issued: ["PINV-2026-00031 (sub #3, total 166500.00)"],
              reminders: ["invoice_due H-3 → sub #3 (1 owner)"],
              transitions: ["sub #3: trialing → active (trial habis)"],
              adoptions: [],
              errors: ["rekonsiliasi [status-tak-serasi] tenant #7 …"],
            }),
          },
          {
            id: 1,
            startedAt: new Date("2026-07-31T01:00:00Z"),
            finishedAt: new Date("2026-07-31T01:00:03Z"),
            status: "ok",
            invoicesIssued: 0,
            remindersSent: 0,
            statusChanges: 0,
            adoptions: 0,
            errorCount: 0,
            details: "{korup",
          },
        ]),
      },
    } as unknown as NonNullable<Parameters<typeof schedulerRunsForOperator>[1]>["platform"];

    const runs = await schedulerRunsForOperator(5, { platform });
    expect(runs).toHaveLength(2);
    expect(runs![0].status).toBe("error");
    expect(runs![0].details?.issued).toEqual(["PINV-2026-00031 (sub #3, total 166500.00)"]);
    expect(runs![0].details?.errors).toHaveLength(1);
    expect(runs![1].details).toBeNull();
  });
});
