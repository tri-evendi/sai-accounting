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

import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@sai/platform/platform-db";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import type { OperatorPermission } from "@op/lib/operator/roles";
import { changeTenantPlan, type QuotaWarning } from "@sai/platform/billing/change-tenant-plan";
import {
  executeTenantDeletion,
  makeLatestJournalDateReader,
  recordManualPayment,
  setBillingMode,
  setTenantSuspension,
  extendSubscription,
  type OperatorActor,
  activateQuoteEntitlement,
} from "@op/lib/operator/writes";
import {
  changePlanSchema,
  deletionExecuteSchema,
  manualPaymentSchema,
  suspensionSchema,
  extendSubscriptionSchema,
  billingModeActionSchema,
  quoteActivationSchema,
} from "@op/lib/validations/operator";
import { BILLING_MODE_LABEL_KEYS, type BillingMode } from "@sai/billing/platform-constants";
import { invalidateTenantState } from "@sai/platform/tenant-state";
import { getT } from "@sai/platform/i18n/server";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { formatDateMedium } from "@sai/core/utils";

export interface OperatorActionResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa pengguna — untuk `root` form. */
  message: string;
  /** Peringatan yang TIDAK menggagalkan (mis. kuota di bawah pemakaian). */
  warning?: string | null;
}

type T = Awaited<ReturnType<typeof getT>>;

async function guardAndTranslate(permission: OperatorPermission): Promise<
  | { ok: true; t: T; actorName: string }
  | { ok: false; result: OperatorActionResult }
> {
  const t = await getT();
  const session = await requireOperatorActionSession(permission);
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
  const gate = await guardAndTranslate("tenant.billing");
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
  const gate = await guardAndTranslate("tenant.billing");
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
  const gate = await guardAndTranslate("tenant.lifecycle");
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
  const gate = await guardAndTranslate("tenant.billing");
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
    /* Siklus yang diminta tidak punya harga di katalog paket ini. Ditolak di
       inti (`extendSubscription`) supaya tidak ada langganan tahunan yang
       membawa harga bulanan — kurang tagih 10× yang baru bersuara setahun
       kemudian. Kalimatnya menyebut SEBABNYA; `default` di bawah akan
       menjawabnya dengan "tenant tidak ditemukan", yang tidak benar. */
    case "cycle_unpriced":
      return {
        ok: false,
        message: t("operator.actions.extend.errUnpriced", { cycle: result.cycle }),
      };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}

/* ── 3c. Mode penagihan ───────────────────────────────────────────────────── */

/**
 * Satu-satunya pintu di LAYAR menuju penagihan otomatis.
 *
 * Sebelum aksi ini, `billing_mode` hanya bisa disetel `bun run billing:pause`
 * (yang justru hanya menyetel `none`) atau SQL langsung — artinya pada hari
 * pelanggan berbayar pertama masuk, tidak ada tombol untuk menyalakan
 * penagihannya. Alasan penolakan `price_zero` ada di kepala `setBillingMode`:
 * nol rupiah yang ditagih otomatis mengunci buku pelanggan karena tidak
 * membayar nol.
 */
export async function operatorSetBillingMode(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate("tenant.billing");
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = billingModeActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  const result = await setBillingMode(deps(), {
    tenantRef: { id: parsed.data.tenantId },
    mode: parsed.data.mode,
    actor: { operator: actorName, reason: parsed.data.reason },
  });

  /* Nama mode datang dari peta bertipe di `platform-constants.ts` — bukan
     dirakit dari nilainya, yang akan membuat kuncinya tak terlihat penjaga
     kunci yatim. */
  const label = (mode: BillingMode) => t(BILLING_MODE_LABEL_KEYS[mode]);

  switch (result.outcome) {
    case "changed":
      felt(parsed.data.tenantId);
      return {
        ok: true,
        message: t("operator.actions.billingMode.success", {
          from: label(result.from),
          to: label(result.to),
        }),
        /* Peringatan yang TIDAK menggagalkan: `auto` menyalakan dunning &
           penangguhan, tetapi TIDAK memulai penagihan perpanjangan — yang
           terakhir belum ada di kode mana pun. Operator yang menandai `auto`
           lalu menunggu tagihan bulan depan akan menunggu selamanya, dan
           kalimat ini yang menahannya. */
        warning:
          result.to === "auto" ? t("operator.actions.billingMode.autoNoRenewal") : null,
      };
    case "not_applicable":
      return {
        ok: false,
        message: t("operator.actions.billingMode.errSame", { mode: label(result.mode) }),
      };
    case "price_zero":
      return { ok: false, message: t("operator.actions.billingMode.errPriceZero") };
    case "cancelled":
      return { ok: false, message: t("operator.actions.extend.errCancelled") };
    case "no_subscription":
      return { ok: false, message: t("operator.actions.suspension.errNoSubscription") };
    default:
      return { ok: false, message: t("operator.tenant.notFound") };
  }
}

/* ── 4. Eksekusi penghapusan (lewat masa tenggang) ─────────────────────────── */

export async function operatorExecuteDeletion(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate("tenant.delete");
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
          date: formatDateMedium(
            result.retentionUntil
          ),
        }),
        warning:
          result.unreadableBooks.length > 0
            ? t("operator.actions.deletion.unreadableBooks", {
                books: result.unreadableBooks.join(", "),
              })
            : null,
      };
    case "grace_active":
      return {
        ok: false,
        message: t("operator.actions.deletion.errGrace", {
          date: formatDateMedium(
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

/* ── 7. Penawaran disetujui → hak pakai ───────────────────────────────────── */

export async function operatorActivateQuote(input: unknown): Promise<OperatorActionResult> {
  const gate = await guardAndTranslate("tenant.billing");
  if (!gate.ok) return gate.result;
  const { t, actorName } = gate;

  const parsed = quoteActivationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.quote.errInput") };
  const { tenantId, planKey, cycle, periods, quoteRef, reason } = parsed.data;

  const result = await activateQuoteEntitlement(deps(), {
    tenantId,
    planKey,
    cycle,
    periods,
    quoteRef,
    actor: { operator: actorName, reason },
  });
  felt(tenantId);

  const ringkas = result.steps.map((s) => `${s.step}: ${s.outcome}`).join(" · ");
  return result.ok
    ? { ok: true, message: t("operator.quote.done", { quote: quoteRef }), warning: null }
    : { ok: false, message: t("operator.quote.partial", { steps: ringkas }) };
}
