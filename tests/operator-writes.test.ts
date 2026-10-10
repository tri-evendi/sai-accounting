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
/*
 * Sejak #484 jejak tenant hidup di TABEL basis data kendali, bukan berkas —
 * jadi tiruan `controlDb` di berkas ini ikut memikulnya. Penyimpannya dalam
 * memori dan berperilaku seperti tabelnya: urut sisip, dibaca terbaru-dulu,
 * disaring per slug.
 */
const tenantAuditRows: Record<string, unknown>[] = [];
vi.mock("@/lib/control-db", () => ({
  controlDb: {
    company: { findUnique: async () => ({ tenant: controlFake.tenant }) },
    tenantAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        tenantAuditRows.push({
          ...data,
          id: tenantAuditRows.length + 1,
          createdAt: new Date(2026, 0, tenantAuditRows.length + 1),
        });
        return data;
      },
      findMany: async ({ where }: { where: { tenantSlug: string } }) =>
        tenantAuditRows.filter((r) => r.tenantSlug === where.tenantSlug).reverse(),
      count: async ({ where }: { where: { tenantSlug: string } }) =>
        tenantAuditRows.filter((r) => r.tenantSlug === where.tenantSlug).length,
    },
  },
}));

import {
  changeTenantPlan,
  executeTenantDeletion,
  extendSubscription,
  recordManualPayment,
  setTenantSuspension,
} from "@/lib/operator/writes";
import {
  PLATFORM_INVOICE_STATUSES,
  platformInvoiceIsRevenue,
} from "@/lib/platform-constants";
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
        /* Tahunan = 10 bulan (`PRICING.md` §1) — kolom tersendiri, bukan
           hitungan. Dipakai penjaga potret-ulang harga `extendSubscription`. */
        priceYearly: dec("1500000.00") as ReturnType<typeof dec> | null,
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
        /* SENGAJA tanpa harga tahunan — bentuk paket rundingan, dan satu-satunya
           cara menguji bahwa perpanjangan tahunan atas paket seperti itu
           DITOLAK alih-alih ditebak. */
        priceYearly: null as ReturnType<typeof dec> | null,
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
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2026-08-31T00:00:00Z"),
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
  let nextInvoiceId = 61;
  let nextSubscriptionId = 4;

  const platform = {
    platformInvoice: {
      findUnique: async ({ where }: { where: { number: string } }) =>
        state.invoices.find((inv) => inv.number === where.number) ?? null,
      /* Tagihan KOMPENSASI (`extendSubscription`): nomornya UNIK, jadi
         perpanjangan yang sama dijalankan dua kali menabrak constraint alih-alih
         memberi periode kedua — perilaku itu yang ditiru di sini. */
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.invoices.some((inv) => inv.number === data.number)) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        state.ops.push("platform:invoice.create");
        const row = {
          id: nextInvoiceId++,
          ...(data as object),
        } as unknown as (typeof state.invoices)[number];
        state.invoices.push(row);
        return row;
      },
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
      findUnique: async ({ where }: { where: { key?: string; id?: number } }) =>
        state.plans.find(
          (p) =>
            (where.key !== undefined && p.key === where.key) ||
            (where.id !== undefined && p.id === where.id)
        ) ?? null,
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

/* Jejaknya sekarang di tabel (#484), jadi yang perlu dikosongkan tiap tes
   adalah penyimpan tiruannya — bukan sebuah direktori sementara. */
beforeEach(() => {
  tenantAuditRows.length = 0;
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

describe("extendSubscription — kompensasi (aksi #5): HARGA dipotret ulang", () => {
  /**
   * ══ Kenapa penjaga ini ada ════════════════════════════════════════════════
   * Versi pertama fungsi ini mengubah `billing_cycle` ke siklus yang diminta
   * dan MEMBIARKAN `price` apa adanya. Akibatnya nyata di produksi: satu
   * langganan bersiklus `yearly` dengan `price` 599.000 — harga BULANAN paket
   * Pro. Saat periode kompensasinya habis (9 Sep 2027), siklus tagih
   * berikutnya akan menagih Rp 599.000 untuk SETAHUN: kurang tagih sepuluh
   * kali lipat, tanpa galat, tanpa peringatan, setahun kemudian.
   *
   * Itulah bentuk cacat yang paling mahal di kode penagihan — yang salah
   * hitung dalam diam. `docs/KOMERSIALISASI.md` §11.
   */
  it("bulanan → tahunan: harga diambil dari KOLOM TAHUNAN katalog, bukan dikalikan", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "active";
    state.tenant.status = "active";

    const result = await extendSubscription(
      deps,
      { tenantRef: { id: 7 }, cycle: "yearly", periods: 1, actor: ACTOR },
      NOW
    );

    expect(result.outcome).toBe("extended");
    expect(state.subscriptions[0].billingCycle).toBe("yearly");
    /* 1.500.000 = `price_yearly` katalog (10 bulan), BUKAN 150.000 yang lama
       dan BUKAN 1.800.000 (12 × bulanan) — dua angka yang akan muncul kalau
       harganya dihitung di sini alih-alih dibaca dari katalognya. */
    expect(state.subscriptions[0].price.toString()).toBe("1500000.00");

    const logs = await readTenantAuditLogs("contoh");
    expect(logs[0]).toMatchObject({ action: "tenant.extend" });
    /* Perubahan UANG harus terbaca di jejak, bukan hanya di baris basis data. */
    expect(logs[0].details).toMatchObject({ priceFrom: "150000.00", priceTo: "1500000.00" });
  });

  it("siklus SAMA: harga TIDAK disentuh — snapshot pelanggan berjalan tetap utuh", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "active";
    state.tenant.status = "active";
    /* Katalog sudah naik sejak pelanggan ini berlangganan. */
    state.plans[0].priceMonthly = dec("999000.00");

    const result = await extendSubscription(
      deps,
      { tenantRef: { id: 7 }, cycle: "monthly", periods: 3, actor: ACTOR },
      NOW
    );

    expect(result.outcome).toBe("extended");
    /* `PRICING.md` §3: perubahan katalog TIDAK menyentuh langganan berjalan.
       Perpanjangan bukan pintu belakang untuk memindahkan harga. */
    expect(state.subscriptions[0].price.toString()).toBe("150000.00");
    const logs = await readTenantAuditLogs("contoh");
    expect(logs[0].details).not.toHaveProperty("priceTo");
  });

  it("siklus TANPA harga di katalog → ditolak, dan tidak satu pun tulisan terjadi", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "active";
    state.subscriptions[0].planId = 2; // `lite` — sengaja tanpa `price_yearly`
    state.tenant.status = "active";

    const result = await extendSubscription(
      deps,
      { tenantRef: { id: 7 }, cycle: "yearly", periods: 1, actor: ACTOR },
      NOW
    );

    expect(result).toEqual({ outcome: "cycle_unpriced", cycle: "yearly" });
    /* Ditolak SEBELUM apa pun ditulis: tidak ada tagihan kompensasi, tidak ada
       pembaruan langganan, tidak ada jejak audit — sebab tidak ada yang
       terjadi. Menebak angkanya adalah cara paling halus untuk menagih sesuatu
       yang tidak pernah disepakati siapa pun. */
    expect(state.ops).toHaveLength(0);
    expect(state.invoices.some((i) => i.number.endsWith("-K"))).toBe(false);
    expect(await readTenantAuditLogs("contoh")).toHaveLength(0);
    expect(state.subscriptions[0].billingCycle).toBe("monthly");
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
    join(__dirname, "..", "src", "app", "(app)", "(operator)", "operator", "tenants", "[id]", "actions.ts"),
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
    join(__dirname, "..", "src", "app", "(app)", "(operator)", "operator", "tenants", "[id]", "page.tsx"),
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

/**
 * ══ KOMPENSASI BUKAN PENDAPATAN ════════════════════════════════════════════
 *
 * Kompensasi memakai satu baris tagihan sebagai kunci idempotensi — nomornya
 * deterministik + UNIK, jadi perpanjangan yang sama dijalankan dua kali
 * menabrak constraint alih-alih memberi periode kedua. Trik itu benar.
 *
 * Yang pernah salah adalah STATUSNYA: baris itu ditulis `paid` dengan total
 * Rp 0, dan akibatnya terukur di produksi 10 Okt 2026 — KELIMA tagihan
 * berstatus `paid` bernilai NOL rupiah, sehingga "berapa pendapatan kita?"
 * tidak bisa dijawab dari tabel mana pun tanpa lebih dulu tahu bahwa sebagian
 * "lunas" bukan uang (`docs/KOMERSIALISASI.md` §8).
 *
 * Penjaga ini menahan angka itu agar tidak bisa berbohong lagi.
 */
describe("tagihan kompensasi: `comped`, bukan `paid`", () => {
  it("perpanjangan menulis status `comped` dengan total nol dan TANPA baris pembayaran", async () => {
    const { state, deps } = makeWorld();
    state.subscriptions[0].status = "active";
    state.tenant.status = "active";

    const result = await extendSubscription(
      deps,
      { tenantRef: { id: 7 }, cycle: "monthly", periods: 1, actor: ACTOR },
      NOW
    );
    expect(result.outcome).toBe("extended");

    const comp = state.invoices.find((inv) => inv.number.endsWith("-K"));
    expect(comp, "tagihan kompensasi tidak terbit").toBeDefined();
    expect(comp!.status).toBe("comped");
    expect(Number(comp!.total)).toBe(0);
    /* Pembayaran nol adalah dokumen yang menyatakan sesuatu yang tidak pernah
       terjadi — jadi tidak satu pun baris `payments` dibuat. */
    expect(state.ops).not.toContain("platform:payment.create");
  });

  it("`comped` TIDAK dihitung sebagai pendapatan, `paid` dihitung", () => {
    expect(platformInvoiceIsRevenue("paid")).toBe(true);
    for (const status of ["comped", "issued", "draft", "void", "", "PAID"]) {
      expect(platformInvoiceIsRevenue(status), status).toBe(false);
    }
  });

  it("`comped` ada di daftar status sah — kolom VARCHAR tidak menolak apa pun", () => {
    expect(PLATFORM_INVOICE_STATUSES).toContain("comped");
    /* Dan ia bukan pengganti `void`: dibatalkan dan diberi-gratis adalah dua
       peristiwa berbeda — yang pertama tidak memberi hak pakai apa pun. */
    expect(PLATFORM_INVOICE_STATUSES).toContain("void");
  });

  it("tagihan `comped` TIDAK menerima pelunasan manual — tidak ada yang terutang", async () => {
    const { state, deps } = makeWorld();
    state.invoices[0].status = "comped";

    const result = await recordManualPayment(
      deps,
      {
        invoiceNumber: state.invoices[0].number,
        /* `amount` string & `transferDate` Date — bentuk yang sama dengan
           pemanggil nyata (server action mengurainya dari form). */
        amount: "166500",
        transferDate: new Date("2026-08-05T00:00:00Z"),
        bankRef: "TRF-COMPED",
        actor: ACTOR,
      },
      NOW
    );

    expect(result).toEqual({ outcome: "not_issued", status: "comped" });
    expect(state.ops).toHaveLength(0);
  });

  it("migration 0015 memperbaiki DATA lama dengan syarat yang sempit", () => {
    const sql = readFileSync(
      join(__dirname, "..", "prisma", "platform", "migrations", "0015_comped_invoice_status", "migration.sql"),
      "utf8"
    );
    /* Ketiganya harus benar bersamaan — tanpa salah satu pun, migration ini
       bisa menyentuh pelunasan sungguhan. Yang terakhir yang paling penting:
       bukti bahwa tidak ada uang yang pernah lewat. */
    expect(sql).toMatch(/status`?\s*=\s*'paid'/i);
    expect(sql).toMatch(/total`?\s*=\s*0/i);
    expect(sql).toMatch(/NOT EXISTS/i);
    expect(sql).toMatch(/platform_invoice_id/i);
    /* Dan ia TIDAK menghapus apa pun: dokumen bernomor tidak pernah dihapus. */
    expect(sql).not.toMatch(/DELETE|DROP/i);
  });
});
