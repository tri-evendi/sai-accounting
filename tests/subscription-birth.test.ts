/**
 * Langganan lahir BERSAMA tenant (issue #152) — sifat yang dikunci:
 *   • verifikasi email melahirkan baris `subscriptions`: harga SNAPSHOT dari
 *     paket `trial` (§5), `trial_ends_at` dari `plans.trial_days`, platform
 *     DULU lalu salinan kendali;
 *   • `sai_platform` mati / tabel `plans` kosong → verifikasi TETAP 200:
 *     helper-nya tidak pernah melempar, sebabnya tercatat di log server;
 *   • putaran adopsi penjadwal melahirkan langganan untuk tenant yatim
 *     (trialing/active/past_due) MEMAKAI trial_ends_at kendali apa adanya —
 *     trial tidak pernah diperpanjang diam-diam;
 *   • idempoten: putaran kedua tidak melahirkan apa pun; balapan ditahan
 *     UNIQUE `initial_for_tenant_id` (P2002 = mundur), bukan periksa-lalu-tulis;
 *   • `pending_verification` TIDAK dilahirkan langganan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const platformDb = vi.hoisted(() => ({
  plan: { findUnique: vi.fn() },
  subscription: { create: vi.fn(), findFirst: vi.fn() },
}));
const controlDb = vi.hoisted(() => ({
  tenant: { update: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/platform-db", () => ({ platformDb }));
vi.mock("@/lib/control-db", () => ({ controlDb }));

import { createInitialSubscription } from "@/lib/subscription-store";
import {
  ORPHAN_ADOPTABLE_TENANT_STATUSES,
  initialSubscriptionFromPlan,
  planOrphanSubscriptionAdoptions,
} from "@/lib/subscription-lifecycle";

const NOW = new Date("2026-08-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Paket `trial` seperti yang dikembalikan Prisma — harga sebagai nilai buram
 *  (Decimal di produksi): snapshot berarti nilai ini LEWAT APA ADANYA. */
const TRIAL_PLAN = {
  id: 7,
  key: "trial",
  isActive: true,
  priceMonthly: "150000.00",
  currency: "IDR",
  trialDays: 14,
  maxCompanies: 1,
  maxUsers: 3,
};

beforeEach(() => {
  vi.restoreAllMocks();
  platformDb.plan.findUnique.mockReset();
  platformDb.subscription.create.mockReset();
  controlDb.tenant.update.mockReset();
  /* Kegagalan yang DIRANCANG tercatat — tesnya memeriksa pencatatannya,
   * keluaran vitest tidak perlu ikut berisik. */
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createInitialSubscription — verifikasi email melahirkan langganan (#152)", () => {
  it("baris subscriptions lahir: harga SNAPSHOT §5, trial_ends_at dari paket, kunci idempotensi terisi", async () => {
    platformDb.plan.findUnique.mockResolvedValue(TRIAL_PLAN);
    const bornTrialEnd = new Date(NOW.getTime() + 14 * DAY_MS);
    platformDb.subscription.create.mockResolvedValue({ id: 11, trialEndsAt: bornTrialEnd });
    controlDb.tenant.update.mockResolvedValue({});

    const outcome = await createInitialSubscription(5, NOW);

    expect(outcome).toEqual({ created: true, subscriptionId: 11, status: "trialing" });
    const data = platformDb.subscription.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(5);
    expect(data.planId).toBe(7);
    expect(data.status).toBe("trialing");
    /* SNAPSHOT: nilai harga paket lewat apa adanya — bukan dirujuk ulang. */
    expect(data.price).toBe(TRIAL_PLAN.priceMonthly);
    expect(data.currency).toBe("IDR");
    expect(data.trialEndsAt.getTime()).toBe(NOW.getTime() + 14 * DAY_MS);
    expect(data.currentPeriodStart.getTime()).toBe(NOW.getTime());
    expect(data.currentPeriodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    /* Kunci idempotensi kelahiran — UNIQUE di skema; balapan menabraknya. */
    expect(data.initialForTenantId).toBe(5);
  });

  it("urutan tulis: PLATFORM dulu, salinan kendali (status + snapshot kuota/trial) belakangan", async () => {
    platformDb.plan.findUnique.mockResolvedValue(TRIAL_PLAN);
    const bornTrialEnd = new Date(NOW.getTime() + 14 * DAY_MS);
    platformDb.subscription.create.mockResolvedValue({ id: 11, trialEndsAt: bornTrialEnd });
    controlDb.tenant.update.mockResolvedValue({});

    await createInitialSubscription(5, NOW);

    expect(controlDb.tenant.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        planKey: "trial",
        maxCompanies: 1,
        maxUsers: 3,
        trialEndsAt: bornTrialEnd,
        status: "trialing",
      },
    });
    const createOrder = platformDb.subscription.create.mock.invocationCallOrder[0];
    const updateOrder = controlDb.tenant.update.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(updateOrder);
  });

  it("basis data platform MATI → tidak melempar (verifikasi tetap 200); sebabnya tercatat", async () => {
    platformDb.plan.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED sai_platform"));

    const outcome = await createInitialSubscription(5, NOW);

    expect(outcome).toEqual({ created: false, reason: "platform_unreachable" });
    expect(platformDb.subscription.create).not.toHaveBeenCalled();
    expect(controlDb.tenant.update).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("tabel plans kosong (belum db:seed:plans) → seperti platform mati: dicatat, tidak melempar", async () => {
    platformDb.plan.findUnique.mockResolvedValue(null);

    const outcome = await createInitialSubscription(5, NOW);

    expect(outcome).toEqual({ created: false, reason: "plan_missing" });
    expect(platformDb.subscription.create).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("balapan: constraint UNIQUE menabrak (P2002) → mundur dengan tenang, kendali tidak disentuh", async () => {
    platformDb.plan.findUnique.mockResolvedValue(TRIAL_PLAN);
    platformDb.subscription.create.mockRejectedValue({ code: "P2002" });

    const outcome = await createInitialSubscription(5, NOW);

    expect(outcome).toEqual({ created: false, reason: "already_exists" });
    expect(controlDb.tenant.update).not.toHaveBeenCalled();
  });

  it("salinan kendali gagal → langganan TETAP lahir (rekonsiliasi yang menemukan selisihnya)", async () => {
    platformDb.plan.findUnique.mockResolvedValue(TRIAL_PLAN);
    platformDb.subscription.create.mockResolvedValue({ id: 11, trialEndsAt: null });
    controlDb.tenant.update.mockRejectedValue(new Error("control down"));

    const outcome = await createInitialSubscription(5, NOW);

    expect(outcome.created).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("initialSubscriptionFromPlan — bentuk langganan pertama (murni)", () => {
  it("trial_days > 0 → trialing dengan trial_ends_at dari paket", () => {
    const spec = initialSubscriptionFromPlan({ trialDays: 14 }, NOW);
    expect(spec.status).toBe("trialing");
    expect(spec.trialEndsAt?.getTime()).toBe(NOW.getTime() + 14 * DAY_MS);
  });

  it("trial_days = 0 → langsung active tanpa trial; tagihan pertama urusan penjadwal (paritas change-plan)", () => {
    const spec = initialSubscriptionFromPlan({ trialDays: 0 }, NOW);
    expect(spec.status).toBe("active");
    expect(spec.trialEndsAt).toBeNull();
  });

  it("periode tagih pertama = satu bulan dari sekarang (nextPeriod monthly)", () => {
    const spec = initialSubscriptionFromPlan({ trialDays: 14 }, NOW);
    expect(spec.currentPeriodStart.getTime()).toBe(NOW.getTime());
    expect(spec.currentPeriodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("planOrphanSubscriptionAdoptions — penjadwal mengadopsi tenant yatim (#152)", () => {
  const trialEnd = new Date("2026-08-10T00:00:00Z");
  const TENANTS = [
    { id: 1, status: "trialing", planKey: "trial", trialEndsAt: trialEnd },
    { id: 2, status: "active", planKey: "starter", trialEndsAt: null },
    { id: 3, status: "pending_verification", planKey: "trial", trialEndsAt: null },
    { id: 4, status: "suspended", planKey: "starter", trialEndsAt: null },
    { id: 5, status: "past_due", planKey: "business", trialEndsAt: null },
    { id: 6, status: "cancelled", planKey: "starter", trialEndsAt: null },
  ];

  it("tenant berbayar tanpa langganan diadopsi; pending_verification/suspended/cancelled TIDAK", () => {
    const specs = planOrphanSubscriptionAdoptions(TENANTS, [], NOW);
    expect(specs.map((s) => s.tenantId)).toEqual([1, 2, 5]);
    expect(ORPHAN_ADOPTABLE_TENANT_STATUSES).toEqual(["trialing", "active", "past_due"]);
  });

  it("trial_ends_at KENDALI dipakai apa adanya — adopsi tidak memperpanjang trial diam-diam", () => {
    const [trialing] = planOrphanSubscriptionAdoptions(TENANTS, [], NOW);
    expect(trialing.status).toBe("trialing");
    expect(trialing.trialEndsAt).toEqual(trialEnd);
  });

  it("trialing tanpa tanggal (data cacat) → trial dianggap berakhir SEKARANG, bukan trial abadi", () => {
    const specs = planOrphanSubscriptionAdoptions(
      [{ id: 9, status: "trialing", planKey: "trial", trialEndsAt: null }],
      [],
      NOW
    );
    expect(specs[0].trialEndsAt).toEqual(NOW);
  });

  it("past_due: masa tenggang dihitung dari sekarang; active tanpa trial", () => {
    const specs = planOrphanSubscriptionAdoptions(TENANTS, [], NOW);
    const active = specs.find((s) => s.tenantId === 2)!;
    const pastDue = specs.find((s) => s.tenantId === 5)!;
    expect(active).toMatchObject({ status: "active", trialEndsAt: null, pastDueSince: null });
    expect(pastDue).toMatchObject({ status: "past_due", pastDueSince: NOW });
  });

  it("IDEMPOTEN: putaran kedua melihat langganan hasil putaran pertama → tidak ada kelahiran kedua", () => {
    const firstRound = planOrphanSubscriptionAdoptions(TENANTS, [], NOW);
    const bornSubscriptions = firstRound.map((s) => ({ tenantId: s.tenantId }));
    expect(planOrphanSubscriptionAdoptions(TENANTS, bornSubscriptions, NOW)).toEqual([]);
  });

  it("langganan CANCELLED pun menutup adopsi — berlangganan ulang adalah keputusan orang (change-plan)", () => {
    const specs = planOrphanSubscriptionAdoptions(
      [{ id: 2, status: "active", planKey: "starter", trialEndsAt: null }],
      [{ tenantId: 2 }],
      NOW
    );
    expect(specs).toEqual([]);
  });
});

describe("penjagaan bentuk sumber — pagar yang tidak boleh hilang", () => {
  it("route verify-email memanggil createInitialSubscription DI DALAM try/catch, SETELAH hasil ok", () => {
    const src = readFileSync(
      join(__dirname, "..", "src", "app", "api", "auth", "verify-email", "route.ts"),
      "utf8"
    );
    expect(src).toMatch(/try \{\s*await createInitialSubscription\(result\.tenantId\);/);
    /* Kegagalan langganan tidak boleh mengubah jawaban: 200 tetap 200. */
    const afterCall = src.slice(src.indexOf("createInitialSubscription(result.tenantId)"));
    expect(afterCall).toContain("return NextResponse.json({ ok: true });");
  });

  it("penjadwal menjalankan putaran adopsi yatim, tahan balapan lewat P2002 — bukan periksa-lalu-tulis", () => {
    const src = readFileSync(
      join(__dirname, "..", "scripts", "subscription-scheduler.ts"),
      "utf8"
    );
    expect(src).toContain("planOrphanSubscriptionAdoptions(");
    const adoption = src.slice(src.indexOf("planOrphanSubscriptionAdoptions("));
    expect(adoption).toContain("initialForTenantId: orphan.tenantId");
    expect(adoption).toContain('"P2002"');
  });
});
