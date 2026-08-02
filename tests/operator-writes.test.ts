/**
 * Aksi TULIS konsol operator (issue #155) — empat aturan yang diuji, bukan
 * sekadar dijanjikan:
 *
 *   1. setiap aksi sukses = TEPAT SATU baris jejak audit tenant, dengan
 *      OPERATOR sebagai aktor dan ALASAN yang diketiknya;
 *   2. transfer yang sama dua kali = SATU pembayaran — kiriman kedua ditolak
 *      duplikat (pola idempotensi webhook, jangkar `gateway_ref` UNIQUE);
 *   3. turun paket di bawah pemakaian = PERINGATAN yang tercatat, bukan
 *      penghalang;
 *   4. urutan tulis #137 (platform DULU, kendali BELAKANGAN) terekam dari
 *      urutan operasi fake client, bukan dari membaca komentar.
 *
 * Ditambah sapuan sumber: setiap server action konsol menjatuhkan cache
 * status tenant (`invalidateTenantState()`) — suspensi terasa SEKETIKA,
 * bukan setelah TTL 60 detik.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Basis KENDALI palsu untuk `lib/tenant-state.ts` — dipakai HANYA oleh blok
 * "terasa seketika" di bawah: cache status tenant itulah yang berdiri antara
 * suspensi dan penolakan `403 tenant_suspended`, dan satu-satunya cara
 * membuktikan "tanpa menunggu TTL" adalah menjalankan cache-nya sungguhan.
 */
const controlFake = vi.hoisted(() => ({
  tenant: {
    id: 7,
    status: "active",
    planKey: "starter",
    maxCompanies: 3,
    maxUsers: 10,
    trialEndsAt: null as Date | null,
  },
}));
vi.mock("@/lib/control-db", () => ({
  controlDb: {
    company: { findUnique: async () => ({ tenant: controlFake.tenant }) },
  },
}));

import {
  changeTenantPlan,
  executeTenantDeletion,
  recordManualPayment,
  setTenantSuspension,
} from "@/lib/operator/writes";
import { readTenantAuditLogs } from "@/lib/tenant-audit";
import { readOnlyRefusal } from "@/lib/subscription-lifecycle";
import { invalidateTenantState, tenantStateForCompany } from "@/lib/tenant-state";

type Deps = Parameters<typeof recordManualPayment>[0];

const ACTOR = { operator: "vyn", reason: "transfer masuk rekening BCA 1 Agu" };

function dec(value: string) {
  return { toString: () => value };
}

/** Dunia kecil in-memory: satu tenant menunggak dengan satu tagihan terbit. */
function makeWorld() {
  const state = {
    tenant: {
      id: 7,
      slug: "contoh",
      name: "PT Contoh Sejahtera",
      status: "past_due",
      planKey: "starter",
      maxCompanies: 3,
      maxUsers: 10,
      trialEndsAt: null as Date | null,
    },
    plans: [
      {
        id: 1,
        key: "starter",
        isActive: true,
        priceMonthly: dec("150000.00"),
        currency: "IDR",
        maxCompanies: 3,
        maxUsers: 10,
        trialDays: 0,
      },
      {
        id: 2,
        key: "lite",
        isActive: true,
        priceMonthly: dec("50000.00"),
        currency: "IDR",
        maxCompanies: 1,
        maxUsers: 3,
        trialDays: 0,
      },
    ],
    subscriptions: [
      {
        id: 3,
        tenantId: 7,
        planId: 1,
        status: "past_due",
        pastDueSince: new Date("2026-07-20T00:00:00Z") as Date | null,
        trialEndsAt: null as Date | null,
        price: dec("150000.00"),
        currency: "IDR",
        initialForTenantId: 7 as number | null,
      },
    ],
    invoices: [
      {
        id: 31,
        tenantId: 7,
        subscriptionId: 3,
        number: "PINV-S3-20260801",
        status: "issued",
        total: dec("166500.00"),
      },
    ],
    payments: [] as {
      id: number;
      tenantId: number;
      platformInvoiceId: number;
      status: string;
      method: string | null;
      gateway: string | null;
      gatewayRef: string | null;
      amount: string;
      paidAt: Date | null;
    }[],
    companies: [
      { id: 21, tenantId: 7, slug: "pusat", databaseName: "sai_pusat", isActive: true },
      { id: 22, tenantId: 7, slug: "cabang", databaseName: "sai_cabang", isActive: true },
    ],
    users: [
      {
        id: 100,
        email: "budi@contoh.co.id",
        username: "budi",
        name: "Budi",
        password: "hash",
        mustChangePassword: false,
        sessionVersion: 1,
      },
    ],
    deletionRequests: [] as {
      id: number;
      tenantId: number;
      status: string;
      graceEndsAt: Date;
      executedAt: Date | null;
      retentionUntil: Date | null;
      createdAt: Date;
    }[],
    /** Urutan operasi TULIS — bukti urutan #137 direkam, bukan dipercaya. */
    ops: [] as string[],
  };

  let nextPaymentId = 41;
  let nextSubscriptionId = 4;

  const platform = {
    platformInvoice: {
      findUnique: async ({ where }: { where: { number: string } }) =>
        state.invoices.find((inv) => inv.number === where.number) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: { status: string } }) => {
        state.ops.push("platform:invoice.update");
        const invoice = state.invoices.find((inv) => inv.id === where.id)!;
        invoice.status = data.status;
        return invoice;
      },
    },
    payment: {
      findUnique: async ({ where }: { where: { gatewayRef: string } }) =>
        state.payments.find((p) => p.gatewayRef === where.gatewayRef) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.payments.some((p) => p.gatewayRef === data.gatewayRef)) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        state.ops.push("platform:payment.create");
        const row = {
          id: nextPaymentId++,
          paidAt: null,
          ...(data as object),
        } as (typeof state.payments)[number];
        state.payments.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        state.ops.push("platform:payment.update");
        const row = state.payments.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    subscription: {
      findFirst: async ({ where }: { where: { tenantId: number } }) => {
        const rows = state.subscriptions.filter((s) => s.tenantId === where.tenantId);
        // Salinan — lihat catatan pada tenant.findUnique.
        return rows.length ? { ...rows[rows.length - 1] } : null;
      },
      findUnique: async ({ where }: { where: { id: number } }) => {
        const row = state.subscriptions.find((s) => s.id === where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        state.ops.push("platform:subscription.update");
        const row = state.subscriptions.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (
          data.initialForTenantId != null &&
          state.subscriptions.some((s) => s.initialForTenantId === data.initialForTenantId)
        ) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        state.ops.push("platform:subscription.create");
        const row = {
          id: nextSubscriptionId++,
          pastDueSince: null,
          ...(data as object),
        } as unknown as (typeof state.subscriptions)[number];
        state.subscriptions.push(row);
        return row;
      },
    },
    plan: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        state.plans.find((p) => p.key === where.key) ?? null,
    },
  };

  const control = {
    tenant: {
      findUnique: async ({ where }: { where: { id?: number; slug?: string } }) =>
        (where.id !== undefined && state.tenant.id === where.id) ||
        (where.slug !== undefined && state.tenant.slug === where.slug)
          ? // Salinan, bukan referensi hidup — Prisma sungguhan mengembalikan
            // snapshot; pembacaan setelah update tidak boleh ikut berubah.
            { ...state.tenant }
          : null,
      update: async ({ data }: { where: { id: number }; data: Record<string, unknown> }) => {
        state.ops.push("control:tenant.update");
        Object.assign(state.tenant, data);
        return state.tenant;
      },
    },
    company: {
      count: async () => state.companies.filter((c) => c.isActive).length,
      findMany: async () => state.companies,
      updateMany: async ({ data }: { data: { isActive: boolean } }) => {
        state.ops.push("control:company.updateMany");
        for (const company of state.companies) company.isActive = data.isActive;
        return { count: state.companies.length };
      },
    },
    user: {
      count: async () => state.users.length,
      findMany: async () => state.users,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        state.ops.push("control:user.update");
        const row = state.users.find((u) => u.id === where.id)!;
        const { sessionVersion, ...rest } = data as { sessionVersion?: { increment: number } };
        Object.assign(row, rest);
        if (sessionVersion?.increment) row.sessionVersion += sessionVersion.increment;
        return row;
      },
    },
    membership: {
      updateMany: async () => {
        state.ops.push("control:membership.updateMany");
        return { count: 1 };
      },
    },
    passwordResetToken: { deleteMany: async () => ({ count: 0 }) },
    registration: { deleteMany: async () => ({ count: 0 }) },
    tenantDeletionRequest: {
      findFirst: async ({ where }: { where: { tenantId: number; status: string } }) =>
        state.deletionRequests.find(
          (r) => r.tenantId === where.tenantId && r.status === where.status
        ) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        state.ops.push("control:deletionRequest.update");
        const row = state.deletionRequests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(control),
  };

  const deps = { platform, control } as unknown as Deps;

  return {
    state,
    deps,
    /**
     * Dependensi `executeTenantDeletion` — SENGAJA hanya kendali + pembaca
     * buku: eksekusi penghapusan tidak menyentuh `sai_platform` satu kali pun,
     * jadi bentuk dependensinya pun tidak boleh berpura-pura membutuhkannya.
     */
    deletionDeps(latestJournalDate: () => Promise<Date | null>) {
      return { control, latestJournalDate } as unknown as Parameters<
        typeof executeTenantDeletion
      >[0];
    },
  };
}

let auditDir: string;
beforeEach(async () => {
  auditDir = await mkdtemp(join(tmpdir(), "operator-writes-audit-"));
  process.env.TENANT_AUDIT_DIR = auditDir;
});
afterEach(async () => {
  delete process.env.TENANT_AUDIT_DIR;
  await rm(auditDir, { recursive: true, force: true });
});

const NOW = new Date("2026-08-02T03:00:00Z");

describe("recordManualPayment — pelunasan transfer manual (aksi #1)", () => {
  const INPUT = {
    invoiceNumber: "PINV-S3-20260801",
    amount: "166500.00",
    bankRef: "TRF/20260801/00123",
    transferDate: new Date("2026-08-01T00:00:00Z"),
    actor: ACTOR,
  };

  it("mencatat SATU pembayaran manual + tagihan lunas + langganan pulih lewat mesin — dan SATU jejak audit beraktor+beralasan", async () => {
    const { state, deps } = makeWorld();
    const result = await recordManualPayment(deps, INPUT, NOW);

    expect(result).toMatchObject({ outcome: "paid", subscriptionStatus: "active" });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      gateway: "manual",
      method: "manual_transfer",
      gatewayRef: INPUT.bankRef,
      status: "paid",
      paidAt: INPUT.transferDate, // tanggal TRANSFER, bukan saat mengetik
    });
    expect(state.invoices[0].status).toBe("paid");
    // past_due --payment_received--> active — lewat mesin siklus hidup.
    expect(state.subscriptions[0].status).toBe("active");
    expect(state.subscriptions[0].pastDueSince).toBeNull();
    expect(state.tenant.status).toBe("active");

    // Urutan #137: seluruh tulisan platform mendahului salinan kendali.
    const controlIndex = state.ops.indexOf("control:tenant.update");
    expect(controlIndex).toBeGreaterThan(-1);
    for (const op of state.ops.slice(controlIndex + 1)) {
      expect(op.startsWith("platform:")).toBe(false);
    }

    const logs = await readTenantAuditLogs("contoh");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "tenant.payment.manual",
      username: "operator:vyn",
      userId: "operator:vyn",
    });
    expect(logs[0].details).toMatchObject({
      reason: ACTOR.reason,
      bankRef: INPUT.bankRef,
      amount: "166500.00",
    });
  });

  it("transfer yang SAMA dua kali → satu pembayaran; kiriman kedua duplikat tanpa jejak baru", async () => {
    const { state, deps } = makeWorld();
    await recordManualPayment(deps, INPUT, NOW);
    const second = await recordManualPayment(deps, INPUT, NOW);

    expect(second.outcome).toBe("duplicate");
    expect(state.payments).toHaveLength(1);
    expect((await readTenantAuditLogs("contoh")).length).toBe(1);
  });

  it("referensi bank yang sama pada tagihan LAIN juga duplikat — constraint yang memutuskan (P2002), bukan periksa-lalu-tulis", async () => {
    const { state, deps } = makeWorld();
    state.invoices.push({
      id: 32,
      tenantId: 7,
      subscriptionId: 3,
      number: "PINV-S3-20260901",
      status: "issued",
      total: dec("166500.00"),
    });
    await recordManualPayment(deps, INPUT, NOW);
    // findUnique fake mengembalikan baris lama; paksa jalur balapan dengan
    // menghapus deteksi dini — create-lah yang menabrak UNIQUE.
    const rawPlatform = (deps as unknown as { platform: { payment: { findUnique: () => Promise<null> } } })
      .platform;
    rawPlatform.payment.findUnique = async () => null;

    const second = await recordManualPayment(
      deps,
      { ...INPUT, invoiceNumber: "PINV-S3-20260901" },
      NOW
    );
    expect(second.outcome).toBe("duplicate");
    expect(state.payments).toHaveLength(1);
  });

  it("tagihan yang sudah LUNAS → duplikat, bukan pembayaran kedua", async () => {
    const { state, deps } = makeWorld();
    state.invoices[0].status = "paid";
    const result = await recordManualPayment(deps, INPUT, NOW);
    expect(result.outcome).toBe("duplicate");
    expect(state.payments).toHaveLength(0);
    expect((await readTenantAuditLogs("contoh")).length).toBe(0);
  });

  it("tagihan draft/void → not_issued; tagihan tak dikenal → invoice_not_found", async () => {
    const { state, deps } = makeWorld();
    state.invoices[0].status = "void";
    expect((await recordManualPayment(deps, INPUT, NOW)).outcome).toBe("not_issued");
    expect(
      (await recordManualPayment(deps, { ...INPUT, invoiceNumber: "PINV-X" }, NOW)).outcome
    ).toBe("invoice_not_found");
  });
});

describe("changeTenantPlan — ganti paket (aksi #2)", () => {
  it("turun paket DI BAWAH pemakaian: peringatan dikembalikan DAN tercatat — aksi tetap selesai", async () => {
    const { state, deps } = makeWorld();
    // pemakaian: 2 PT, 1 pengguna; paket lite: 1 PT, 3 pengguna.
    const result = await changeTenantPlan(
      deps,
      { tenantRef: { id: 7 }, planKey: "lite", actor: ACTOR },
      NOW
    );

    expect(result).toMatchObject({
      outcome: "changed",
      fromPlanKey: "starter",
      toPlanKey: "lite",
      quotaWarning: { companies: { used: 2, max: 1 }, users: null },
    });
    // Snapshot harga + kuota disalin; status TIDAK berubah (tetap past_due).
    expect(state.subscriptions[0].price.toString()).toBe("50000.00");
    expect(state.tenant).toMatchObject({ planKey: "lite", maxCompanies: 1, maxUsers: 3 });
    expect(state.tenant.status).toBe("past_due");

    const logs = await readTenantAuditLogs("contoh");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "tenant.plan.change", username: "operator:vyn" });
    expect(logs[0].details).toMatchObject({
      reason: ACTOR.reason,
      from: "starter",
      to: "lite",
      quotaWarning: { companies: { used: 2, max: 1 }, users: null },
    });
  });

  it("tenant suspended: ganti paket TIDAK memulihkan — status langganan & kendali tetap suspended", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "suspended";
    state.tenant.status = "suspended";
    const result = await changeTenantPlan(
      deps,
      { tenantRef: { slug: "contoh" }, planKey: "lite", actor: ACTOR },
      NOW
    );
    expect(result.outcome).toBe("changed");
    expect(state.subscriptions[0].status).toBe("suspended");
    expect(state.tenant.status).toBe("suspended");
  });

  it("kalah balapan kelahiran dengan penjadwal (UNIQUE initial_for_tenant_id) → race_lost, bukan langganan kembar", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "cancelled"; // memaksa jalur create baru
    // Langganan lama masih memegang penanda initialForTenantId = 7 → create
    // pertama TANPA penanda (existing ≠ null), jadi paksa lewat penanda:
    state.subscriptions[0].tenantId = 999; // seolah tenant belum pernah berlangganan
    const result = await changeTenantPlan(
      deps,
      { tenantRef: { id: 7 }, planKey: "lite", actor: ACTOR },
      NOW
    );
    expect(result.outcome).toBe("race_lost");
    expect((await readTenantAuditLogs("contoh")).length).toBe(0);
  });

  it("paket tak dikenal / nonaktif → plan_not_found tanpa satu pun tulisan", async () => {
    const { state, deps } = makeWorld();
    const result = await changeTenantPlan(
      deps,
      { tenantRef: { id: 7 }, planKey: "enterprise", actor: ACTOR },
      NOW
    );
    expect(result.outcome).toBe("plan_not_found");
    expect(state.ops).toHaveLength(0);
  });
});

describe("setTenantSuspension — suspensi/pemulihan manual (aksi #3)", () => {
  it("suspend: platform DULU kendali BELAKANGAN, lewat mesin siklus hidup — dan penjaga hanya-baca langsung menolak tulis", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "active";
    state.tenant.status = "active";

    const result = await setTenantSuspension(deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: { operator: "vyn", reason: "permintaan pemilik via tiket #88" },
    });

    expect(result).toEqual({ outcome: "done", from: "active", to: "suspended" });
    expect(state.ops).toEqual(["platform:subscription.update", "control:tenant.update"]);
    expect(state.tenant.status).toBe("suspended");

    // Status salinan kendali inilah yang dibaca penjaga → tulis ditolak
    // `tenant_suspended`; TANPA menunggu TTL karena server action menjatuhkan
    // cache (diuji sapuan sumber di bawah).
    const refusal = readOnlyRefusal(state.tenant.status, "invoice.write");
    expect(refusal?.code).toBe("tenant_suspended");

    const logs = await readTenantAuditLogs("contoh");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "tenant.suspend", username: "operator:vyn" });
    expect(logs[0].details).toMatchObject({ reason: "permintaan pemilik via tiket #88" });
  });

  it("restore: suspended → active, tunggakan lama tidak lagi jadi jangkar tenggang", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "suspended";
    state.tenant.status = "suspended";

    const result = await setTenantSuspension(deps, {
      tenantRef: { id: 7 },
      mode: "restore",
      actor: ACTOR,
    });

    expect(result).toEqual({ outcome: "done", from: "suspended", to: "active" });
    expect(state.subscriptions[0].pastDueSince).toBeNull();
    expect(state.tenant.status).toBe("active");
    expect((await readTenantAuditLogs("contoh"))[0].action).toBe("tenant.restore");
  });

  it("mesin berkata TIDAK: suspend saat sudah suspended / restore saat aktif / cancelled → not_applicable tanpa tulisan", async () => {
    const cases: { status: string; mode: "suspend" | "restore" }[] = [
      { status: "suspended", mode: "suspend" },
      { status: "active", mode: "restore" },
      { status: "cancelled", mode: "suspend" },
      { status: "cancelled", mode: "restore" },
    ];
    for (const { status, mode } of cases) {
      const { state, deps } = makeWorld();
      state.subscriptions[0].status = status;
      const result = await setTenantSuspension(deps, {
        tenantRef: { id: 7 },
        mode,
        actor: ACTOR,
      });
      expect(result).toEqual({ outcome: "not_applicable", status });
      expect(state.ops).toHaveLength(0);
    }
  });

  it("tanpa langganan → no_subscription (atur paket dulu), tanpa tulisan", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions.length = 0;
    const result = await setTenantSuspension(deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: ACTOR,
    });
    expect(result).toEqual({ outcome: "no_subscription" });
    expect(state.ops).toHaveLength(0);
  });
});

describe("executeTenantDeletion — eksekusi lewat masa tenggang (aksi #4)", () => {
  const GRACE_PASSED = new Date("2026-07-01T00:00:00Z");

  function withRequest(state: ReturnType<typeof makeWorld>["state"], graceEndsAt: Date) {
    state.deletionRequests.push({
      id: 51,
      tenantId: 7,
      status: "pending",
      graceEndsAt,
      executedAt: null,
      retentionUntil: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
  }

  const DELETE_INPUT = {
    tenantSlug: "contoh",
    confirmSlug: "contoh",
    actor: { operator: "vyn", reason: "permintaan #51 lewat tenggang; tiket legal #12" },
  };

  it("masa tenggang BELUM lewat → ditolak, nol tulisan, nol jejak", async () => {
    const world = makeWorld();
    const { state } = world;
    withRequest(state, new Date("2026-09-01T00:00:00Z"));
    const result = await executeTenantDeletion(
      world.deletionDeps(async () => null),
      DELETE_INPUT,
      NOW
    );
    expect(result).toEqual({
      outcome: "grace_active",
      graceEndsAt: new Date("2026-09-01T00:00:00Z"),
    });
    expect(state.ops).toHaveLength(0);
    expect((await readTenantAuditLogs("contoh")).length).toBe(0);
  });

  it("tanpa permintaan pending → ditolak: penghapusan HANYA atas permintaan pemilik", async () => {
    const world = makeWorld();
    const { state } = world;
    const result = await executeTenantDeletion(
      world.deletionDeps(async () => null),
      DELETE_INPUT,
      NOW
    );
    expect(result).toEqual({ outcome: "no_pending_request" });
    expect(state.ops).toHaveLength(0);
  });

  it("slug yang diketik ulang tidak cocok → ditolak sebelum satu byte pun ditulis", async () => {
    const world = makeWorld();
    const { state } = world;
    withRequest(state, GRACE_PASSED);
    const result = await executeTenantDeletion(
      world.deletionDeps(async () => null),
      { ...DELETE_INPUT, confirmSlug: "contoh-salah" },
      NOW
    );
    expect(result).toEqual({ outcome: "confirm_mismatch" });
    expect(state.ops).toHaveLength(0);
  });

  it("eksekusi: nonaktif + anonimisasi + retensi 10 tahun dari jurnal termuda — buku TIDAK disentuh; satu jejak beralasan", async () => {
    const world = makeWorld();
    const { state } = world;
    withRequest(state, GRACE_PASSED);
    const latestJournal = new Date("2026-05-31T00:00:00Z");

    const result = await executeTenantDeletion(
      world.deletionDeps(async () => latestJournal),
      DELETE_INPUT,
      NOW
    );

    expect(result).toMatchObject({
      outcome: "executed",
      requestId: 51,
      companiesDeactivated: 2,
      usersAnonymized: 1,
    });
    // Jangkar retensi: jurnal termuda < sekarang → 10 tahun dari SEKARANG
    // (retentionUntilFrom memilih yang lebih lambat — arah konservatif).
    expect((result as { retentionUntil: Date }).retentionUntil.getUTCFullYear()).toBe(2036);

    expect(state.tenant.status).toBe("cancelled");
    expect(state.companies.every((c) => !c.isActive)).toBe(true);
    expect(state.users[0]).toMatchObject({
      email: "dihapus-100@anonim.invalid",
      username: "dihapus-100",
      name: null,
      mustChangePassword: true,
      sessionVersion: 2,
    });
    expect(state.deletionRequests[0]).toMatchObject({ status: "executed" });
    // TIDAK ADA operasi penghancuran buku dalam bentuk apa pun.
    expect(state.ops.some((op) => op.toLowerCase().includes("drop"))).toBe(false);

    const logs = await readTenantAuditLogs("contoh");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "tenant.deletion.execute", username: "operator:vyn" });
    expect(logs[0].details).toMatchObject({
      reason: DELETE_INPUT.actor.reason,
      phase: "deactivate_anonymize",
    });
  });
});

describe("aktor jejak audit — dua bidang, dua awalan", () => {
  it("konsol menulis `operator:<nama>`; skrip CLI menulis `cli:<user>` tanpa awalan ganda", async () => {
    const konsol = makeWorld();
    await setTenantSuspension(konsol.deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: { operator: "vyn", reason: "permintaan pemilik via tiket #88" },
    });
    expect((await readTenantAuditLogs("contoh"))[0]).toMatchObject({
      userId: "operator:vyn",
      username: "operator:vyn",
    });

    const cli = makeWorld();
    cli.state.subscriptions[0].status = "active";
    await setTenantSuspension(cli.deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: { operator: "cli:vyn", reason: "pemulihan lewat shell, konsol mati" },
    });
    expect((await readTenantAuditLogs("contoh"))[0]).toMatchObject({
      userId: "cli:vyn",
      username: "cli:vyn",
    });
  });
});

describe("suspensi TERASA SEKETIKA — cache status tenant, bukan TTL 60 detik", () => {
  beforeEach(() => {
    controlFake.tenant.status = "active";
    invalidateTenantState();
  });

  it("tanpa invalidasi, penjaga masih membaca status LAMA — cache-nya nyata, bukan hiasan", async () => {
    // Cache dipanaskan saat tenant masih aktif (permintaan biasa sebelum
    // operator bertindak).
    expect((await tenantStateForCompany(21))?.status).toBe("active");

    const { deps } = makeWorld();
    await setTenantSuspension(deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: { operator: "vyn", reason: "penyalahgunaan — tiket abuse #12" },
    });
    // Basis data kendali sungguhan sudah `suspended`…
    controlFake.tenant.status = "suspended";

    // …tetapi penjaga yang membaca cache basi masih mengizinkan tulis. Inilah
    // persis lubang yang ditutup aturan #155 no. 4.
    const stale = await tenantStateForCompany(21);
    expect(stale?.status).toBe("active");
    expect(readOnlyRefusal(stale?.status, "invoice.write")).toBeNull();
  });

  it("dengan invalidasi (yang dipanggil server action), tulis LANGSUNG ditolak 403 tenant_suspended", async () => {
    expect((await tenantStateForCompany(21))?.status).toBe("active");

    const { deps } = makeWorld();
    await setTenantSuspension(deps, {
      tenantRef: { id: 7 },
      mode: "suspend",
      actor: { operator: "vyn", reason: "penyalahgunaan — tiket abuse #12" },
    });
    controlFake.tenant.status = "suspended";
    invalidateTenantState(); // ← yang dilakukan `felt()` di server action

    const fresh = await tenantStateForCompany(21);
    expect(fresh?.status).toBe("suspended");
    // Dua masukan penjaga API (`lib/auth-guard.ts`): status segar + izin
    // TULIS → 403 dengan kode `tenant_suspended`.
    expect(readOnlyRefusal(fresh?.status, "invoice.write")?.code).toBe("tenant_suspended");
    // Membaca & mengekspor TETAP boleh — hak hukum pelanggan (§7.4).
    expect(readOnlyRefusal(fresh?.status, "invoice.read")).toBeNull();
    expect(readOnlyRefusal(fresh?.status, "report.export")).toBeNull();
  });
});

describe("server action konsol — sapuan sumber (aturan #155 no. 4)", () => {
  const src = readFileSync(
    join(__dirname, "..", "src", "app", "(operator)", "operator", "tenants", "[id]", "actions.ts"),
    "utf8"
  );

  it("setiap aksi menjatuhkan cache status tenant — suspensi terasa seketika, bukan setelah TTL", () => {
    // `felt()` = invalidateTenantState + revalidatePath; empat aksi sukses,
    // empat panggilan — bukan satu panggilan yang kebetulan lolos.
    expect(src).toContain("invalidateTenantState()");
    const calls = src.match(/^\s*felt\(/gm) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("setiap aksi memeriksa sesi bidang operator sendiri (host+IP+cookie), tidak menumpang proxy", () => {
    expect(src).toContain("requireOperatorActionSession(");
  });

  it("tidak ada UPDATE status langganan langsung di lapisan action — semuanya lewat inti writes.ts", () => {
    expect(src).not.toMatch(/subscription\.update|tenant\.update/);
  });

  it("keempat aksi punya server action-nya sendiri — tidak ada aksi yatim", () => {
    for (const name of [
      "operatorMarkInvoicePaid",
      "operatorChangePlan",
      "operatorSetSuspension",
      "operatorExecuteDeletion",
    ]) {
      expect(src, name).toContain(`export async function ${name}(`);
    }
  });
});

/**
 * LAPISAN LOGIKA TANPA LAYAR BUKAN HASIL KERJA. Penjaga ini ada karena
 * kegagalan yang sesungguhnya terjadi: panel tindakan sempat selesai ditulis
 * tanpa pernah dipasang di halaman mana pun — lengkap, teruji, dan tak
 * terjangkau siapa pun.
 */
describe("panel tindakan benar-benar TERPASANG di layar rincian tenant", () => {
  const page = readFileSync(
    join(__dirname, "..", "src", "app", "(operator)", "operator", "tenants", "[id]", "page.tsx"),
    "utf8"
  );

  it("halaman merender <TenantActions /> dengan tenant, pemakaian, dan daftar paket", () => {
    expect(page).toContain("<TenantActions");
    expect(page).toContain('from "@/components/operator/tenant-actions"');
    for (const prop of [
      "tenantId=",
      "tenantSlug=",
      "usage=",
      "plans=",
      "issuedInvoices=",
      "deletionRequest=",
      "billingAvailable=",
    ]) {
      expect(page, prop).toContain(prop);
    }
  });

  it("halamannya tetap dijaga penjaga bidang operator", () => {
    expect(page).toContain("requireOperatorPage()");
  });

  it("hanya tagihan TERBIT yang ditawarkan untuk dilunasi", () => {
    expect(page).toMatch(/status === "issued"/);
  });
});
