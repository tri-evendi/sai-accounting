/**
 * AKSI TULIS konsol operator untuk alur DEMO-FIRST (keputusan pemilik 24 Okt
 * 2026, `docs/KOMERSIALISASI.md` §1.2): tenant uji coba buatan operator,
 * perpanjangan uji coba (termasuk mencairkan yang beku), atribusi mitra, dan
 * permintaan aktivasi.
 *
 * Aturan yang sama dengan `writes.ts` (#155): tanpa `server-only`, klien
 * DISUNTIKKAN, setiap aksi sukses menulis tepat satu jejak tenant beraktor
 * operator + alasan, urutan tulis #137.
 *
 * ⚠ BERKAS TERSENDIRI, bukan bagian `writes.ts`, dengan sengaja: `writes.ts`
 * diimpor skrip pemulihan yang ikut image perkakas (`execute-tenant-deletion`,
 * `pause-platform-billing`), dan pembuatan tenant menuntut `@sai/core/
 * registration` — modul yang membaca `SELF_SERVE_SIGNUP`. Menaruhnya di sana
 * menyeret env pendaftaran ke penutupan dependensi layanan yang tidak pernah
 * mendaftarkan siapa pun (`tests/compose-env-allowlist.test.ts`).
 */

import { randomBytes } from "node:crypto";

import { TENANT_ROLES } from "@sai/core/constants";
import { slugAcak, tenantSlugCandidates, usernameFromEmail } from "@sai/core/registration";
import {
  nextPeriod,
  tenantStatusForSubscription,
  transition,
} from "@sai/billing/subscription-lifecycle";
import type { BillingMode, SubscriptionStatus } from "@sai/billing/platform-constants";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { recordSubscriptionEvent } from "@sai/platform/subscription-events";
import { auditActor } from "@sai/platform/billing/change-tenant-plan";

import type { OperatorActor, OperatorWriteDeps } from "@op/lib/operator/writes";

/* ═══════ 8. Tenant UJI COBA buatan operator (alur demo-first, 24 Okt 2026) ══ */

export type CreateTrialTenantResult =
  | {
      outcome: "created";
      tenantId: number;
      tenantSlug: string;
      ownerUserId: number;
      ownerEmail: string;
      trialEndsAt: Date | null;
      /** `false` = baris kendali lahir tetapi langganan platform gagal ditulis;
       *  putaran adopsi yatim penjadwal akan melahirkannya (#152). */
      subscriptionCreated: boolean;
    }
  /** Alamat surel pemilik sudah dipakai akun lain (unik global). */
  | { outcome: "email_taken" }
  | { outcome: "plan_not_found" };

/**
 * Buat TENANT UJI COBA untuk seorang prospek — dari konsol, bukan dari
 * `/register`.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Keputusan pemilik 24 Okt 2026: belum ada gerbang pembayaran, dan produk ini
 * sedang ditawarkan ke prospek. Jalurnya karena itu DEMO → uji coba yang DIBUAT
 * OPERATOR → aktivasi manual — bukan "daftar sendiri → uji coba habis →
 * tagihan otomatis" (`docs/KOMERSIALISASI.md` §1.2). Pendaftaran mandiri tetap
 * di balik gerbang konsol `/settings` (bawaannya tertutup).
 *
 * Bedanya dengan pendaftaran mandiri, semuanya keputusan operator:
 *   • paket & kuota BEBAS dipilih (tidak dipaku `SIGNUP_PLAN_KEY`);
 *   • lama uji coba bebas (bawaan `TRIAL_DAYS` = 30, K-3);
 *   • mode penagihan bawaan `none` — uji coba tidak pernah menagih siapa pun;
 *   • atribusi mitra (`referred_by_partner`) opsional;
 *   • tenant DEMO (`is_demo`) lahir `active` tanpa tanggal akhir: ia alat
 *     presentasi, bukan uji coba, dan tidak boleh beku di tengah demo.
 *
 * ══ OPERATOR TIDAK MEMEGANG KATA SANDI SIAPA PUN ═══════════════════════════
 * Pemiliknya lahir dengan kata sandi ACAK yang tidak diketahui siapa pun
 * (bukan hash bcrypt yang sah → tidak ada sandi yang cocok). Server action
 * pemanggil lalu mengirim TAUTAN untuk menentukan kata sandinya sendiri — pola
 * yang sama dengan "kirim tautan atur ulang" bantuan pengguna
 * (`lib/operator/user-support.ts`): kata sandi yang diketik operator adalah
 * kata sandi yang diketahui dua orang.
 *
 * ══ URUTAN TULIS ═══════════════════════════════════════════════════════════
 * KENDALI dulu (tenant + pemilik + keanggotaan, SATU transaksi), PLATFORM
 * belakangan — urutan yang sama dengan verifikasi pendaftaran mandiri
 * (`createInitialSubscription` sesudah `consumeVerificationToken`): id tenant
 * lahir di kendali. Langganan yang gagal ditulis TIDAK menggagalkan pembuatan;
 * putaran adopsi yatim penjadwal melahirkannya dari `tenants.plan_key` dengan
 * `trial_ends_at` kendali apa adanya (#152), dan `initial_for_tenant_id`
 * UNIQUE mencegah kelahiran kembar.
 */
export async function createTrialTenant(
  deps: OperatorWriteDeps,
  input: {
    tenantName: string;
    ownerName: string;
    ownerEmail: string;
    planKey: string;
    /** Lama uji coba (hari). Diabaikan untuk tenant demo. */
    trialDays: number;
    /** Kuota; `null` = salin dari paket. */
    maxCompanies: number | null;
    maxUsers: number | null;
    billingMode: Extract<BillingMode, "none" | "manual">;
    referredByPartner: string | null;
    isDemo: boolean;
    actor: OperatorActor;
  },
  now: Date = new Date()
): Promise<CreateTrialTenantResult> {
  const email = input.ownerEmail.trim().toLowerCase();
  const taken = await deps.control.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return { outcome: "email_taken" };

  const plan = await deps.platform.plan.findFirst({
    where: { key: input.planKey, isActive: true },
    select: {
      id: true,
      key: true,
      priceMonthly: true,
      currency: true,
      maxCompanies: true,
      maxUsers: true,
    },
  });
  if (!plan) return { outcome: "plan_not_found" };

  const maxCompanies = input.maxCompanies ?? plan.maxCompanies;
  const maxUsers = input.maxUsers ?? plan.maxUsers;
  const trialEndsAt = input.isDemo
    ? null
    : new Date(now.getTime() + Math.max(1, Math.trunc(input.trialDays)) * 24 * 60 * 60 * 1000);
  const status: SubscriptionStatus = input.isDemo ? "active" : "trialing";
  const partner = input.referredByPartner?.trim() || null;

  const kandidat = tenantSlugCandidates(input.tenantName);

  let created: { tenantId: number; slug: string; userId: number };
  try {
    created = await deps.control.$transaction(async (tx) => {
      const existing = await tx.tenant.findMany({
        where: { slug: { in: kandidat } },
        select: { slug: true },
      });
      const takenSlugs = new Set(existing.map((t) => t.slug));
      const slug = kandidat.find((c) => !takenSlugs.has(c)) ?? slugAcak();
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: input.tenantName.trim(),
          status: tenantStatusForSubscription(status),
          planKey: plan.key,
          trialEndsAt,
          maxCompanies,
          maxUsers,
          referredByPartner: partner,
          isDemo: input.isDemo,
        },
        select: { id: true, slug: true },
      });
      const user = await tx.user.create({
        data: {
          username: usernameFromEmail(email),
          email,
          name: input.ownerName.trim(),
          /* Bukan hash bcrypt yang sah → tidak ada kata sandi yang cocok sampai
             pemiliknya menentukan sendiri lewat tautan. */
          password: randomBytes(32).toString("hex"),
          mustChangePassword: true,
          tenantId: tenant.id,
        },
        select: { id: true },
      });
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: TENANT_ROLES.OWNER },
      });
      return { tenantId: tenant.id, slug: tenant.slug, userId: user.id };
    });
  } catch (error) {
    /* Dua operator membuat akun untuk surel yang sama pada detik yang sama:
       indeks unik `users.email` yang memutuskan, bukan periksa-lalu-tulis. */
    if ((error as { code?: string }).code === "P2002") return { outcome: "email_taken" };
    throw error;
  }

  let subscriptionCreated = false;
  try {
    const period = nextPeriod("monthly", now);
    const subscription = await deps.platform.subscription.create({
      data: {
        tenantId: created.tenantId,
        planId: plan.id,
        status,
        billingCycle: "monthly",
        billingMode: input.billingMode,
        /* SNAPSHOT harga (§5) — bukan rujukan ke `plans`. Tidak ditagih selama
           mode `none`; MRR pun tidak menghitungnya (`platform-revenue.ts`). */
        price: plan.priceMonthly,
        currency: plan.currency,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        trialEndsAt,
        initialForTenantId: created.tenantId,
      },
      select: { id: true },
    });
    await recordSubscriptionEvent(
      deps.platform,
      {
        subscriptionId: subscription.id,
        tenantId: created.tenantId,
        kind: "created",
        actor: auditActor(input.actor).username,
        toStatus: status,
        toPlanId: plan.id,
        toPrice: plan.priceMonthly,
        currency: plan.currency,
        details: {
          via: "operator_trial",
          reason: input.actor.reason,
          billingMode: input.billingMode,
          isDemo: input.isDemo,
        },
      },
      now
    );
    subscriptionCreated = true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      subscriptionCreated = true; // sudah lahir di tangan lain (adopsi yatim)
    } else {
      console.error(
        `[operator-writes] langganan tenant #${created.tenantId} gagal ditulis — adopsi yatim penjadwal yang melahirkannya:`,
        error
      );
    }
  }

  await writeTenantAuditLog({
    tenantId: created.tenantId,
    tenantSlug: created.slug,
    ...auditActor(input.actor),
    action: "tenant.trial.create",
    details: {
      reason: input.actor.reason,
      planKey: plan.key,
      maxCompanies,
      maxUsers,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      billingMode: input.billingMode,
      referredByPartner: partner,
      isDemo: input.isDemo,
      ownerEmail: email,
      subscriptionCreated,
    },
  });

  return {
    outcome: "created",
    tenantId: created.tenantId,
    tenantSlug: created.slug,
    ownerUserId: created.userId,
    ownerEmail: email,
    trialEndsAt,
    subscriptionCreated,
  };
}

/* ═══════════════ 9. Perpanjang UJI COBA (termasuk dari beku) ═══════════════ */

export type ExtendTrialResult =
  | { outcome: "extended"; from: string; trialEndsAt: Date }
  | { outcome: "tenant_not_found" }
  | { outcome: "no_subscription" }
  /** Hanya `trialing` dan `trial_ended` yang punya uji coba untuk diperpanjang. */
  | { outcome: "not_applicable"; status: string };

/**
 * Beri prospek tanggal akhir uji coba BARU — `trialing` tetap `trialing`,
 * `trial_ended` (beku) dicairkan kembali menjadi `trialing`.
 *
 * Tanggal baru dihitung dari SEKARANG (bukan dari tanggal lama): perpanjangan
 * atas uji coba yang sudah beku sebulan tidak boleh berakhir di masa lalu.
 * Pemberitahuan beku lama tidak berlaku untuk tanggal baru — kuncinya memuat
 * tanggal akhir (`trialNoticeSuffix`), jadi penjadwal memberi tahu ulang.
 */
export async function extendTrial(
  deps: OperatorWriteDeps,
  input: { tenantId: number; days: number; actor: OperatorActor },
  now: Date = new Date()
): Promise<ExtendTrialResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };

  const subscription = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
    select: { id: true, status: true, trialEndsAt: true },
  });
  if (!subscription) return { outcome: "no_subscription" };

  const next = transition(subscription.status as SubscriptionStatus, "operator_extend_trial");
  if (next === null) return { outcome: "not_applicable", status: subscription.status };

  const trialEndsAt = new Date(now.getTime() + Math.max(1, Math.trunc(input.days)) * 24 * 60 * 60 * 1000);

  /* ── 1. PLATFORM dulu ──────────────────────────────────────────────────── */
  await deps.platform.subscription.update({
    where: { id: subscription.id },
    data: { status: next, trialEndsAt, trialEndedAt: null },
  });
  await recordSubscriptionEvent(
    deps.platform,
    {
      subscriptionId: subscription.id,
      tenantId: tenant.id,
      kind: subscription.status === next ? "period" : "status",
      actor: auditActor(input.actor).username,
      fromStatus: subscription.status,
      toStatus: next,
      details: {
        event: "operator_extend_trial",
        reason: input.actor.reason,
        trialEndsAtFrom: subscription.trialEndsAt?.toISOString() ?? null,
        trialEndsAtTo: trialEndsAt.toISOString(),
      },
    },
    now
  );

  /* ── 2. KENDALI belakangan ─────────────────────────────────────────────── */
  await deps.control.tenant.update({
    where: { id: tenant.id },
    data: { status: tenantStatusForSubscription(next), trialEndsAt },
  });

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.trial.extend",
    details: {
      reason: input.actor.reason,
      from: subscription.status,
      to: next,
      days: input.days,
      trialEndsAt: trialEndsAt.toISOString(),
    },
  });

  return { outcome: "extended", from: subscription.status, trialEndsAt };
}

/* ═════════════════════ 10. Atribusi mitra (komisi manual) ═══════════════════ */

export type SetPartnerResult =
  | { outcome: "changed"; from: string | null; to: string | null }
  | { outcome: "not_applicable" }
  | { outcome: "tenant_not_found" };

/**
 * Setel / hapus `tenants.referred_by_partner`. Teks bebas (migration kendali
 * 0013) — gunanya satu: komisi mitra dihitung MANUAL dari daftar tenant.
 * Kosong = hapus atribusinya. Hanya KENDALI; tidak ada salinan di platform.
 */
export async function setTenantPartner(
  deps: Pick<OperatorWriteDeps, "control">,
  input: { tenantId: number; partner: string | null; actor: OperatorActor }
): Promise<SetPartnerResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, slug: true, referredByPartner: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };
  const to = input.partner?.trim() || null;
  if ((tenant.referredByPartner ?? null) === to) return { outcome: "not_applicable" };

  await deps.control.tenant.update({ where: { id: tenant.id }, data: { referredByPartner: to } });
  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.partner",
    details: { reason: input.actor.reason, from: tenant.referredByPartner ?? null, to },
  });
  return { outcome: "changed", from: tenant.referredByPartner ?? null, to };
}

/* ═════════════════ 11. Permintaan aktivasi — tandai ditangani ══════════════ */

export type HandleActivationResult =
  | { outcome: "handled"; tenantId: number }
  | { outcome: "not_found" }
  | { outcome: "already_handled" };

/**
 * Tandai satu permintaan aktivasi (`activation_requests`, migration platform
 * 0011) sudah DITANGANI — operator sudah menghubungi prospeknya. Tidak
 * mengubah langganan apa pun: aktivasinya sendiri tetap lewat "Aktifkan dari
 * penawaran" atau "Perpanjang uji coba", masing-masing berjejak sendiri.
 */
export async function markActivationRequestHandled(
  deps: OperatorWriteDeps,
  input: { requestId: number; actor: OperatorActor },
  now: Date = new Date()
): Promise<HandleActivationResult> {
  const row = await deps.platform.activationRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!row) return { outcome: "not_found" };
  if (row.status !== "open") return { outcome: "already_handled" };

  /* Bersyarat pada `status = open` — dua operator yang menekan bersamaan:
     yang kedua mendapat "sudah ditangani", bukan jejak ganda. */
  const updated = await deps.platform.activationRequest.updateMany({
    where: { id: row.id, status: "open" },
    data: { status: "handled", handledBy: auditActor(input.actor).username, handledAt: now },
  });
  if (updated.count === 0) return { outcome: "already_handled" };

  const tenant = await deps.control.tenant.findUnique({
    where: { id: row.tenantId },
    select: { id: true, slug: true },
  });
  if (tenant) {
    await writeTenantAuditLog({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      ...auditActor(input.actor),
      action: "tenant.activation_request.handled",
      details: { reason: input.actor.reason, requestId: row.id },
    });
  }
  return { outcome: "handled", tenantId: row.tenantId };
}
