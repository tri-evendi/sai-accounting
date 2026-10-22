/**
 * PINDAH KE ON-PREMISE — bekukan, cairkan, nyatakan pindah.
 * Runbook: docs/ONPREM-PINDAH-DARI-SAAS.md.
 *
 * Tiga keadaan, tiga fungsi, satu arah yang sah:
 *
 *   (aktif) ──freezeTenant──▶ DIBEKUKAN ──markTenantMigratedOut──▶ migrated_out
 *                 ▲                │
 *                 └─unfreezeTenant─┘   (jalan balik selama customer belum
 *                                       menyatakan on-premise-nya berjalan)
 *
 * Pembekuan = `tenants.frozen_at`, kolom yang TIDAK disentuh mesin penagihan
 * (alasannya di `@sai/core/tenant-migration`). Ketiganya beralasan wajib dan
 * berjejak di `tenant_audit_logs` — aturan #155 yang sama dengan setiap aksi
 * tulis operator di `writes.ts`, dan memakai fungsi di sana (mode penagihan,
 * suspensi) alih-alih menyalinnya.
 *
 * Dipakai skrip (`tenant:export-onprem`, `tenant:unfreeze`,
 * `tenant:mark-migrated-out`); tombol konsol belum ada — keputusan di runbook.
 */

import type { PrismaClient as ControlClient } from "@sai/db/client/control";
import { transition } from "@sai/billing/subscription-lifecycle";
import type { SubscriptionStatus } from "@sai/billing/platform-constants";
import { TENANT_STATUS_MIGRATED_OUT, isMigratedOut } from "@sai/core/tenant-migration";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { recordSubscriptionEvent } from "@sai/platform/subscription-events";
import { auditActor } from "@sai/platform/billing/change-tenant-plan";

import {
  setBillingMode,
  setTenantSuspension,
  type OperatorActor,
  type OperatorWriteDeps,
  type SetBillingModeResult,
} from "./writes";

type TenantRef = { id: number } | { slug: string };

/* ═══════════════════════════ 1. Bekukan ════════════════════════════════════ */

export type FreezeResult =
  | { outcome: "frozen"; frozenAt: Date }
  /** Sudah beku — idempoten; `frozenAt` adalah saat pembekuan PERTAMA, dan
   *  jam tunggu ekspor dihitung dari sana. */
  | { outcome: "already_frozen"; frozenAt: Date }
  | { outcome: "tenant_not_found" }
  | { outcome: "migrated_out" };

export async function freezeTenant(
  deps: { control: ControlClient },
  input: { tenantRef: TenantRef; actor: OperatorActor },
  now: Date = new Date()
): Promise<FreezeResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true, status: true, frozenAt: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };
  if (isMigratedOut(tenant.status)) return { outcome: "migrated_out" };
  if (tenant.frozenAt) return { outcome: "already_frozen", frozenAt: tenant.frozenAt };

  /* Bersyarat `frozen_at IS NULL`: dua ekspor bersamaan tidak saling
     memajukan jam tunggu. */
  const changed = await deps.control.tenant.updateMany({
    where: { id: tenant.id, frozenAt: null },
    data: { frozenAt: now },
  });
  if (changed.count !== 1) {
    const again = await deps.control.tenant.findUnique({
      where: { id: tenant.id },
      select: { frozenAt: true },
    });
    return { outcome: "already_frozen", frozenAt: again?.frozenAt ?? now };
  }
  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.onprem.freeze",
    details: { reason: input.actor.reason, status: tenant.status },
  });
  return { outcome: "frozen", frozenAt: now };
}

/* ═══════════════════════════ 2. Cairkan ════════════════════════════════════ */

export type UnfreezeResult =
  | { outcome: "unfrozen"; frozenAt: Date }
  | { outcome: "not_frozen" }
  | { outcome: "tenant_not_found" }
  /** Sudah dinyatakan pindah: bukunya nonaktif & langganannya berhenti.
   *  Mencairkan saja tidak mengembalikannya — itu keputusan manusia
   *  (runbook §Jalan balik). */
  | { outcome: "migrated_out" };

export async function unfreezeTenant(
  deps: { control: ControlClient },
  input: { tenantRef: TenantRef; actor: OperatorActor }
): Promise<UnfreezeResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true, status: true, frozenAt: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };
  if (isMigratedOut(tenant.status)) return { outcome: "migrated_out" };
  if (!tenant.frozenAt) return { outcome: "not_frozen" };

  await deps.control.tenant.update({ where: { id: tenant.id }, data: { frozenAt: null } });
  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ...auditActor(input.actor),
    action: "tenant.onprem.unfreeze",
    details: { reason: input.actor.reason, frozenSince: tenant.frozenAt.toISOString() },
  });
  return { outcome: "unfrozen", frozenAt: tenant.frozenAt };
}

/* ═══════════════════════ 3. Nyatakan pindah ════════════════════════════════ */

export interface OpenPlatformInvoice {
  number: string;
  status: string;
  total: string;
  dueDate: Date;
}

export type MigratedOutResult =
  | {
      outcome: "migrated_out";
      companiesDeactivated: number;
      sessionsRevoked: number;
      /** `null` = tenant tanpa langganan (mis. tenant internal). */
      subscription: { id: number; from: string; to: string } | null;
      billingMode: SetBillingModeResult["outcome"] | null;
      /** Tagihan `draft`/`issued` yang TIDAK disentuh — keputusan uang milik
       *  manusia (void, atau tagih sampai akhir periode), bukan efek samping. */
      openInvoices: OpenPlatformInvoice[];
    }
  | { outcome: "tenant_not_found" }
  /** Belum pernah dibekukan = tidak ada ekspor yang diambil di bawah
   *  pembekuan; menyatakan pindah sekarang menutup buku yang isinya belum
   *  pernah sampai ke mana pun. */
  | { outcome: "not_frozen" }
  | { outcome: "already_migrated_out"; migratedOutAt: Date | null };

/**
 * Nyatakan tenant SUDAH PINDAH — dijalankan SESUDAH customer menyatakan
 * pemasangan on-premise-nya berjalan. Urutan tulis #137: platform DULU.
 *
 *   1. `billing_mode` → `none` (`setBillingMode`): tidak ada tagih otomatis.
 *   2. Langganan → `cancelled` LEWAT MESIN siklus hidup: `cancel` hanya sah
 *      dari `suspended`, jadi yang belum ditangguhkan melewati
 *      `setTenantSuspension` lebih dulu. `cancelled` keadaan akhir — penjadwal
 *      tidak punya event apa pun lagi untuknya.
 *   3. KENDALI: `status = migrated_out` + `migrated_out_at`; seluruh PT tenant
 *      dinonaktifkan (penjaga menolak buku nonaktif, penerbit pekerjaan
 *      melewatinya); sesi pengguna RUMAH tenant ini dicabut
 *      (`session_version + 1`). Pengguna tamu dari tenant lain tidak disentuh.
 *
 * TIDAK menghapus apa pun: buku, dokumen, dan pengguna tetap ada. Retensi dan
 * penghapusan berjalan lewat alur yang sudah ada (#142).
 */
export async function markTenantMigratedOut(
  deps: OperatorWriteDeps,
  input: { tenantRef: TenantRef; actor: OperatorActor },
  now: Date = new Date()
): Promise<MigratedOutResult> {
  const tenant = await deps.control.tenant.findUnique({
    where: input.tenantRef as { id: number },
    select: { id: true, slug: true, status: true, frozenAt: true, migratedOutAt: true },
  });
  if (!tenant) return { outcome: "tenant_not_found" };
  if (isMigratedOut(tenant.status)) {
    return { outcome: "already_migrated_out", migratedOutAt: tenant.migratedOutAt };
  }
  if (!tenant.frozenAt) return { outcome: "not_frozen" };
  /* Nama lokal, bukan `tenant.slug` di dekat `company.updateMany`: penjaga
     #161 membaca properti `slug` di sekitar tulisan ke `companies`. */
  const auditSlug = tenant.slug;

  /* ── 1–2. PLATFORM dulu ────────────────────────────────────────────────── */
  const ref = { id: tenant.id };
  const mode = await setBillingMode(deps, { tenantRef: ref, mode: "none", actor: input.actor });
  const billingMode = mode.outcome === "no_subscription" ? null : mode.outcome;

  let subscription: { id: number; from: string; to: string } | null = null;
  const latest = await deps.platform.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "desc" },
    select: { id: true, status: true },
  });
  if (latest) {
    const from = latest.status;
    let current = latest.status as SubscriptionStatus;
    if (current !== "cancelled" && transition(current, "cancel") === null) {
      const suspended = await setTenantSuspension(deps, {
        tenantRef: ref,
        mode: "suspend",
        actor: input.actor,
      });
      if (suspended.outcome === "done") current = suspended.to as SubscriptionStatus;
    }
    if (current !== "cancelled") {
      const next = transition(current, "cancel");
      if (next === null) {
        throw new Error(
          `Langganan #${latest.id} berstatus ${current} — mesin siklus hidup tidak punya jalan ` +
            "ke `cancelled` dari sana. Kendali TIDAK ditulis; periksa langganannya."
        );
      }
      await deps.platform.subscription.update({ where: { id: latest.id }, data: { status: next } });
      await recordSubscriptionEvent(deps.platform, {
        subscriptionId: latest.id,
        tenantId: tenant.id,
        kind: "status",
        actor: auditActor(input.actor).username,
        fromStatus: current,
        toStatus: next,
        details: { event: "cancel", reason: input.actor.reason, cause: "migrated_out" },
      });
      current = next;
    }
    subscription = { id: latest.id, from, to: current };
  }

  const open = await deps.platform.platformInvoice.findMany({
    where: { tenantId: tenant.id, status: { in: ["draft", "issued"] } },
    select: { number: true, status: true, total: true, dueDate: true },
    orderBy: { id: "asc" },
  });

  /* ── 3. KENDALI belakangan, dalam satu transaksi ───────────────────────── */
  const [, companies, sessions] = await deps.control.$transaction([
    deps.control.tenant.update({
      where: { id: tenant.id },
      data: { status: TENANT_STATUS_MIGRATED_OUT, migratedOutAt: now },
    }),
    deps.control.company.updateMany({
      where: { tenantId: tenant.id, isActive: true },
      data: { isActive: false },
    }),
    deps.control.user.updateMany({
      where: { tenantId: tenant.id },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);

  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: auditSlug,
    ...auditActor(input.actor),
    action: "tenant.onprem.migrated_out",
    details: {
      reason: input.actor.reason,
      frozenSince: tenant.frozenAt.toISOString(),
      companiesDeactivated: companies.count,
      sessionsRevoked: sessions.count,
      subscription,
      openInvoices: open.map((i) => i.number),
    },
  });

  return {
    outcome: "migrated_out",
    companiesDeactivated: companies.count,
    sessionsRevoked: sessions.count,
    subscription,
    billingMode,
    openInvoices: open.map((i) => ({
      number: i.number,
      status: i.status,
      total: i.total.toString(),
      dueDate: i.dueDate,
    })),
  };
}
