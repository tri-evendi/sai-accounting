"use server";

/**
 * Server action AKSI TULIS konsol operator (issue #155) — SENGAJA server
 * action, bukan route API (keputusan #154, ditegakkan `tests/authz-coverage`):
 * route baru di `src/app/api` adalah permukaan pelanggan; ini bukan.
 *
 * Lapisan ini TIPIS dengan sengaja — empat kewajiban, nol logika bisnis:
 *   1. penjaga bidang (`requireOperatorActionSession`: host + IP + cookie +
 *      MFA — action tidak boleh terpanggil dari host pelanggan sekalipun
 *      proxy berubah);
 *   2. validasi ulang skema yang SAMA dengan form client (satu skema, dua
 *      sisi — Konvensi Form);
 *   3. panggil inti `lib/operator/writes.ts` (audit + urutan tulis #137
 *      hidup DI SANA, supaya skrip CLI pemulihan memakainya juga);
 *   4. jatuhkan cache status tenant (`invalidateTenantState()`) — suspensi/
 *      pemulihan terasa SEKETIKA, bukan setelah TTL 60 detik — lalu
 *      revalidasi halaman rincian.
 *
 * Logika keputusan TIDAK boleh ada di sini — `tests/operator-writes.test.ts`
 * menyapu sumber berkas ini dan menolak pemutakhiran status langganan/tenant
 * yang ditulis langsung dari lapisan action.
 */

import { revalidatePath } from "next/cache";

import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";
import { requireOperatorActionSession } from "@/lib/operator/guard";
import {
  changeTenantPlan,
  executeTenantDeletion,
  makeLatestJournalDateReader,
  recordManualPayment,
  setTenantSuspension,
  extendSubscription,
  type OperatorActor,
  type QuotaWarning,
} from "@/lib/operator/writes";
import {
  changePlanSchema,
  deletionExecuteSchema,
  manualPaymentSchema,
  suspensionSchema,
  extendSubscriptionSchema,
} from "@/lib/validations/operator";
import { invalidateTenantState } from "@/lib/tenant-state";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export interface OperatorActionResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa pengguna — untuk `root` form. */
  message: string;
  /** Peringatan yang TIDAK menggagalkan (mis. kuota di bawah pemakaian). */
  warning?: string | null;
}

type T = Awaited<ReturnType<typeof getT>>;

async function guardAndTranslate(): Promise<
  | { ok: true; t: T; actorName: string }
  | { ok: false; result: OperatorActionResult }
> {
  const t = await getT();
  const session = await requireOperatorActionSession();
  if (!session) {
    /* Jawaban seragam — tidak membedakan "host salah" dari "sesi habis". */
    return { ok: false, result: { ok: false, message: t("operator.actions.denied") } };
  }
  return { ok: true, t, actorName: session.operator.name };
}

function deps() {
  return { platform: platformDb, control: controlDb };
}

/** Kewajiban 4 dalam satu tempat: cache jatuh + halaman rincian segar. */
function felt(tenantId: number): void {
  invalidateTenantState();
  revalidatePath(`/operator/tenants/${tenantId}`);
}

/* ── 1. Tandai tagihan lunas (transfer manual) ─────────────────────────────── */

export async function operatorMarkInvoicePaid(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const transferDate = new Date(`${parsed.data.transferDate}T00:00:00.000Z`);
  if (Number.isNaN(transferDate.getTime())) {
    return { ok: false, message: t("validation.invalidInput") };
  }

  const actor: OperatorActor = { operator: actorName, reason: parsed.data.reason };
  const result = await recordManualPayment(deps(), {
    invoiceNumber: parsed.data.invoiceNumber,
    amount: parsed.data.amount.toFixed(2),
    bankRef: parsed.data.bankRef,
    transferDate,
    actor,
  });

  switch (result.outcome) {
    case "paid": {
      felt(parsed.data.tenantId);
      const statusLine = result.subscriptionStatus
        ? ` ${t("operator.actions.markPaid.successStatus", {
            status: t(`tenantSettings.status.${result.subscriptionStatus}` as DictionaryKey),
          })}`
        : "";
      return {
        ok: true,
        message:
          t("operator.actions.markPaid.success", { number: result.invoiceNumber }) + statusLine,
      };
    }
    case "duplicate":
      return { ok: false, message: t("operator.actions.markPaid.errDuplicate") };
    case "not_issued":
      return { ok: false, message: t("operator.actions.markPaid.errNotIssued") };
    default:
      return { ok: false, message: t("operator.actions.markPaid.errNotFound") };
  }
}

/* ── 2. Ganti paket ────────────────────────────────────────────────────────── */

function quotaWarningText(t: T, warning: QuotaWarning | null): string | null {
  if (!warning) return null;
  const parts: string[] = [];
  if (warning.companies) {
    parts.push(t("operator.actions.plan.quotaWarningCompanies", warning.companies));
  }
  if (warning.users) parts.push(t("operator.actions.plan.quotaWarningUsers", warning.users));
  return `${parts.join("; ")} — ${t("operator.actions.plan.quotaWarningNote")}`;
}

export async function operatorChangePlan(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const result = await changeTenantPlan(deps(), {
    tenantRef: { id: parsed.data.tenantId },
    planKey: parsed.data.planKey,
    actor: { operator: actorName, reason: parsed.data.reason },
  });

  switch (result.outcome) {
    case "changed":
      felt(parsed.data.tenantId);
      return {
        ok: true,
        message: t("operator.actions.plan.success", {
          from: result.fromPlanKey,
          to: result.toPlanKey,
        }),
        warning: quotaWarningText(t, result.quotaWarning),
      };
    case "plan_not_found":
      return { ok: false, message: t("operator.actions.plan.errPlan") };
    case "race_lost":
      return { ok: false, message: t("operator.actions.plan.errRace") };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}

/* ── 3. Suspensi / pemulihan manual ────────────────────────────────────────── */

export async function operatorSetSuspension(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = suspensionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const result = await setTenantSuspension(deps(), {
    tenantRef: { id: parsed.data.tenantId },
    mode: parsed.data.mode,
    actor: { operator: actorName, reason: parsed.data.reason },
  });

  switch (result.outcome) {
    case "done":
      felt(parsed.data.tenantId);
      return {
        ok: true,
        message: t("operator.actions.suspension.success", {
          from: t(`tenantSettings.status.${result.from}` as DictionaryKey),
          to: t(`tenantSettings.status.${result.to}` as DictionaryKey),
        }),
      };
    case "no_subscription":
      return { ok: false, message: t("operator.actions.suspension.errNoSubscription") };
    case "not_applicable":
      return {
        ok: false,
        message: t("operator.actions.suspension.errNotApplicable", {
          status: t(`tenantSettings.status.${result.status}` as DictionaryKey),
        }),
      };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}

/* ── 3b. Perpanjangan kompensasi ───────────────────────────────────────────── */

export async function operatorExtendSubscription(
  input: unknown
): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = extendSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const result = await extendSubscription(deps(), {
    tenantRef: { id: parsed.data.tenantId },
    cycle: parsed.data.cycle,
    periods: parsed.data.periods,
    actor: { operator: actorName, reason: parsed.data.reason },
  });

  switch (result.outcome) {
    case "extended":
      felt(parsed.data.tenantId);
      return {
        ok: true,
        message: t("operator.actions.extend.success", {
          to: result.to.toISOString().slice(0, 10),
          invoice: result.invoiceNumber,
        }),
      };
    case "duplicate":
      return {
        ok: false,
        message: t("operator.actions.extend.errDuplicate", { invoice: result.invoiceNumber }),
      };
    case "no_subscription":
      return { ok: false, message: t("operator.actions.suspension.errNoSubscription") };
    case "cancelled":
      return { ok: false, message: t("operator.actions.extend.errCancelled") };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}

/* ── 4. Eksekusi penghapusan (lewat masa tenggang) ─────────────────────────── */

export async function operatorExecuteDeletion(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate();
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = deletionExecuteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  /* Slug tenantnya dibaca inti dari basis data — action hanya menyalurkan
   * ketikan operator; pencocokan bukti terjadi terhadap slug SESUNGGUHNYA. */
  const tenant = await controlDb.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { slug: true },
  });
  if (!tenant) return { ok: false, message: t("operator.tenant.notFound") };

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) return { ok: false, message: t("operator.actions.denied") };

  const result = await executeTenantDeletion(
    { control: controlDb, latestJournalDate: makeLatestJournalDateReader(controlUrl) },
    {
      tenantSlug: tenant.slug,
      confirmSlug: parsed.data.confirmSlug,
      actor: { operator: actorName, reason: parsed.data.reason },
    }
  );

  switch (result.outcome) {
    case "executed":
      felt(parsed.data.tenantId);
      return {
        ok: true,
        message: t("operator.actions.deletion.success", {
          companies: result.companiesDeactivated,
          users: result.usersAnonymized,
          date: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
            result.retentionUntil
          ),
        }),
      };
    case "grace_active":
      return {
        ok: false,
        message: t("operator.actions.deletion.errGrace", {
          date: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
            result.graceEndsAt
          ),
        }),
      };
    case "no_pending_request":
      return { ok: false, message: t("operator.actions.deletion.errNoRequest") };
    case "confirm_mismatch":
      return { ok: false, message: t("operator.actions.deletion.errConfirm") };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}
