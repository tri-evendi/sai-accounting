/**
 * MEMINDAHKAN PAKET TENANT — logika PENAGIHAN, dipakai tiga pintu.
 *
 * Pintu-pintunya:
 *   - konsol operator (`operator/tenants/[id]/actions.ts`) dan skrip CLI
 *     pemulihannya (`scripts/change-tenant-plan.ts`);
 *   - perpindahan swalayan tanpa tagihan (`api/tenant/billing/plan-change`);
 *   - tagihan perpindahan paket yang baru lunas, lewat `planChangeApplier`
 *     (`api/billing/webhook` dan transfer manual di `operator/writes.ts`).
 *
 * ══ KENAPA DI SINI, BUKAN DI `lib/operator/writes.ts` ══════════════════════
 * Ia pertama kali ditulis untuk konsol operator (#155), lalu dua rute
 * PELANGGAN memakainya ulang tanpa ia pernah berpindah tempat. Namanya
 * menyembunyikan bahwa ia dipakai bersama, dan pada hari konsol operator
 * dipisah menjadi aplikasi sendiri, modul yang tampak "milik operator" akan
 * ikut pindah dan memutus dua rute pelanggan
 * (docs/arsitektur/14-RENCANA-MONOREPO.md §3).
 *
 * Arahnya kini ditegakkan `tests/operator-dependency-direction.test.ts`:
 * berkas ini TIDAK BOLEH mengimpor `lib/operator/*`; `lib/operator/*` boleh
 * mengimpor berkas ini.
 *
 * Berbeda dari `lib/plan-change.ts`: berkas itu MURNI (aritmetika kuotasi,
 * tanpa I/O); berkas ini yang MENULIS.
 *
 * ══ ATURAN YANG IKUT PINDAH (#155) ═════════════════════════════════════════
 *   - Klien DISUNTIKKAN pemanggil, tanpa `server-only`: skrip CLI di luar Next
 *     harus bisa memuatnya, dan tes memakai fake in-memory.
 *   - Setiap perpindahan sukses menulis TEPAT SATU baris `writeTenantAuditLog`
 *     dengan aktor yang menyatakan siapa (`operator:<nama>`, `cli:<user>`,
 *     `self-service:<jalur>`), dan `reason` WAJIB.
 *   - Urutan tulis #137: `sai_platform` DULU, `sai_control` BELAKANGAN.
 *   - Cache status tenant TIDAK di-drop di sini (`lib/tenant-state.ts` ber-
 *     `server-only`); itu kewajiban pemanggil di proses Next.
 */

import type { PrismaClient as PlatformClient } from "@sai/db/client/platform";
import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { nextPeriod, tenantStatusForSubscription } from "@/lib/subscription-lifecycle";
import type { SubscriptionStatus } from "@sai/billing/platform-constants";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { recordSubscriptionEvent } from "@/lib/subscription-events";

/** Klien yang disuntikkan pemanggil — kedua lapis yang disentuh penagihan. */
export interface BillingWriteDeps {
  platform: PlatformClient;
  control: ControlClient;
}

/** Aktor + alasan — wajib pada SETIAP tulisan penagihan yang ber-audit. */
export interface BillingActor {
  /**
   * Nama aktor: akun operator dari sesi konsol, `cli:<user>` dari skrip, atau
   * `self-service:<jalur>` untuk tindakan pelanggan sendiri. Nama medannya
   * `operator` karena sejarah (#155); isinya tidak selalu operator.
   */
  operator: string;
  /** Alasan yang DIKETIK (operator) atau ditetapkan jalurnya — disimpan apa adanya. */
  reason: string;
}

/**
 * Aktor jejak audit. Bukan "system" dan bukan salah satu pengguna tenant:
 * jejak harus bisa menjawab "siapa" tanpa menebak.
 *
 * Nama yang SUDAH membawa awalan bidangnya (`cli:`, `self-service:`) dibiarkan
 * apa adanya; nama polos dari sesi konsol diberi awalan `operator:` —
 * `operator:cli:vyn` hanya akan menyulitkan pembacanya.
 */
export function auditActor(actor: BillingActor): { userId: string; username: string } {
  const name = actor.operator.includes(":") ? actor.operator : `operator:${actor.operator}`;
  return { userId: name, username: name };
}

/** Kuota paket baru yang LEBIH KECIL dari pemakaian nyata — peringatan, BUKAN
 *  penghalang: turun paket keputusan yang sah; konsekuensinya dinyatakan dan
 *  ikut tercatat di jejak. (Jalur swalayan MENOLAK lebih dulu di
 *  `lib/plan-change.ts`, jadi peringatan ini praktis milik konsol operator.) */
export interface QuotaWarning {
  companies: { used: number; max: number } | null;
  users: { used: number; max: number } | null;
}

export type ChangePlanResult =
  | {
      outcome: "changed";
      tenantSlug: string;
      fromPlanKey: string;
      toPlanKey: string;
      subscriptionId: number;
      subscriptionStatus: string;
      /** `null` = tidak ada kuota yang terlampaui. */
      quotaWarning: QuotaWarning | null;
    }
  | { outcome: "tenant_not_found" }
  | { outcome: "plan_not_found" }
  /** Kalah balapan dengan putaran adopsi penjadwal (UNIQUE
   *  `initial_for_tenant_id`) — coba lagi; langganannya kini sudah ada. */
  | { outcome: "race_lost" };

/**
 * Pindahkan tenant ke paket lain — logika `scripts/change-tenant-plan.ts`
 * DIANGKAT ke sini (bukan disalin); skrip kini pembungkus tipis.
 *
 * Urutan tulis #137: (1) langganan platform dibuat/dipindah dengan SNAPSHOT
 * harga, (2) salinan kendali (plan_key + kuota + status) ditulis TERAKHIR.
 *
 * Tenant `suspended`: ganti paket TIDAK memulihkan akses — status langganan
 * tidak disentuh; pemulihan adalah keputusan terpisah lewat
 * `setTenantSuspension` (mesin siklus hidup), dengan alasannya sendiri.
 */
export async function changeTenantPlan(
  deps: BillingWriteDeps,
  input: {
    tenantRef: { id: number } | { slug: string };
    planKey: string;
    actor: BillingActor;
  },
  now: Date = new Date()
): Promise<ChangePlanResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true, planKey: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const plan = await deps.platform.plan.findUnique({ where: { key: input.planKey } });
  if (!plan || !plan.isActive) return { outcome: "plan_not_found" };

  /* ── 1. PLATFORM dulu ──────────────────────────────────────────────────── */
  const existing = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
  });

  let subscription;
  if (existing && existing.status !== "cancelled") {
    subscription = await deps.platform.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        /* SNAPSHOT harga — harga paket boleh naik besok; langganan ini tidak. */
        price: plan.priceMonthly,
        currency: plan.currency,
      },
    });
  } else {
    const status = plan.trialDays > 0 ? "trialing" : "active";
    const period = nextPeriod("monthly", now);
    try {
      subscription = await deps.platform.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status,
          billingCycle: "monthly",
          price: plan.priceMonthly,
          currency: plan.currency,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          trialEndsAt:
            plan.trialDays > 0
              ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
              : null,
          /* Kunci idempotensi KELAHIRAN (#152) — balapan dengan putaran adopsi
           * penjadwal menabrak UNIQUE ini, bukan melahirkan kembar. */
          initialForTenantId: existing ? null : tenant.id,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { outcome: "race_lost" };
      throw error;
    }
  }

  /* Dua cabang, dua pencatatan — sama dengan dua cabang tulisan di atas:
     memindahkan langganan yang hidup = `plan`; melahirkan yang baru (tidak ada
     / sudah `cancelled`) = `created`. */
  if (existing && existing.status !== "cancelled") {
    await recordSubscriptionEvent(
      deps.platform,
      {
        subscriptionId: subscription.id,
        tenantId: tenant.id,
        kind: "plan",
        actor: auditActor(input.actor).username,
        fromStatus: existing.status,
        toStatus: subscription.status,
        fromPlanId: existing.planId,
        toPlanId: plan.id,
        fromPrice: existing.price,
        toPrice: plan.priceMonthly,
        currency: plan.currency,
        details: { reason: input.actor.reason, from: tenant.planKey, to: plan.key },
      },
      now
    );
  } else {
    await recordSubscriptionEvent(
      deps.platform,
      {
        subscriptionId: subscription.id,
        tenantId: tenant.id,
        kind: "created",
        actor: auditActor(input.actor).username,
        toStatus: subscription.status,
        toPlanId: plan.id,
        toPrice: plan.priceMonthly,
        currency: plan.currency,
        details: { reason: input.actor.reason, via: "plan_change", replaces: existing?.id ?? null },
      },
      now
    );
  }

  /* ── 2. KENDALI belakangan: salin kuota + status (snapshot §5) ─────────── */
  await deps.control.tenant.update({
    where: { id: tenant.id },
    data: {
      planKey: plan.key,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
      trialEndsAt: subscription.trialEndsAt,
      status: tenantStatusForSubscription(subscription.status as SubscriptionStatus),
    },
  });

  /* Kuota vs pemakaian NYATA (sumber kebenaran, bukan usage_counters). */
  const [companiesUsed, usersUsed] = await Promise.all([
    deps.control.company.count({ where: { tenantId: tenant.id, isActive: true } }),
    deps.control.user.count({ where: { tenantId: tenant.id } }),
  ]);
  const quotaWarning: QuotaWarning | null =
    companiesUsed > plan.maxCompanies || usersUsed > plan.maxUsers
      ? {
          companies:
            companiesUsed > plan.maxCompanies
              ? { used: companiesUsed, max: plan.maxCompanies }
              : null,
          users: usersUsed > plan.maxUsers ? { used: usersUsed, max: plan.maxUsers } : null,
        }
      : null;

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.plan.change",
    details: {
      reason: input.actor.reason,
      from: tenant.planKey,
      to: plan.key,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
      subscriptionStatus: subscription.status,
      /* Konsekuensi turun paket di bawah pemakaian IKUT tercatat (#155). */
      quotaWarning,
    },
  });

  return {
    outcome: "changed",
    tenantSlug: tenant.slug,
    fromPlanKey: tenant.planKey,
    toPlanKey: plan.key,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    quotaWarning,
  };
}

/**
 * Pemasang paket untuk tagihan PERPINDAHAN PAKET yang baru lunas — dioper ke
 * `processPaymentNotification` (lihat `WebhookDeps.applyPlanChange`).
 *
 * DIOPER, bukan diimpor `payment-webhook.ts`: pemasangnya mengalir turun
 * bersama `deps`, jadi berkas webhook tidak perlu tahu mesin perpindahannya.
 * Yang dipakai tetap `changeTenantPlan` yang sama dengan konsol operator —
 * satu mesin, satu jejak audit, bukan implementasi kedua yang pelan-pelan
 * menyimpang.
 *
 * MELEMPAR bila perpindahannya gagal: pelanggan sudah membayar, jadi
 * "gagal diam-diam" berarti uang masuk tanpa paket naik. Webhook yang melempar
 * membuat gerbang mengulang kirimannya, dan pengulangan itu aman — pembayaran
 * sudah ter-idempoten oleh `gateway_ref` UNIQUE.
 */
export function planChangeApplier(deps: BillingWriteDeps, actor: BillingActor) {
  return async (input: {
    tenantId: number;
    planKey: string;
    invoiceNumber: string;
  }): Promise<void> => {
    const result = await changeTenantPlan(deps, {
      tenantRef: { id: input.tenantId },
      planKey: input.planKey,
      actor: {
        operator: actor.operator,
        reason: `${actor.reason} (tagihan ${input.invoiceNumber})`,
      },
    });
    if (result.outcome !== "changed") {
      throw new Error(
        `Perpindahan paket gagal untuk tagihan ${input.invoiceNumber} ` +
          `(→ ${input.planKey}): ${result.outcome}`
      );
    }
  };
}
