"use server";

/**
 * Server action "Buat tenant uji coba" — alur demo-first (keputusan pemilik
 * 24 Okt 2026, `docs/KOMERSIALISASI.md` §1.2).
 *
 * Lapisannya TIPIS, sama dengan aksi tulis #155 lain: penjaga bidang + izin
 * (`tenant.billing` — memberi hak pakai adalah keputusan komersial), validasi
 * ulang dengan skema yang SAMA dengan formulir, panggil inti
 * `createTrialTenant` (audit + urutan tulis hidup di sana), lalu kirim TAUTAN
 * atur-kata-sandi ke pemilik. Operator tidak pernah mengetik atau melihat
 * kata sandi siapa pun (pola bantuan pengguna, `user-actions.ts`).
 *
 * Surel yang gagal terkirim TIDAK membatalkan tenantnya: akunnya sudah lahir
 * dan berjejak; tautannya bisa dikirim ulang dari rincian tenant ("Kirim
 * tautan atur ulang"). Kalimat hasilnya menyatakan keadaan itu apa adanya.
 */

import { revalidatePath } from "next/cache";

import { trialWelcomeMail } from "@sai/core/account-mail";
import { businessISODate } from "@sai/core/business-date";
import { controlDb } from "@sai/core/control-db";
import { getT } from "@sai/platform/i18n/server";
import { sendMail } from "@sai/platform/mailer";
import { issueResetTokenForEmail } from "@sai/platform/password-reset-store";
import { platformDb } from "@sai/platform/platform-db";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { createTrialTenant } from "@op/lib/operator/trial-writes";
import { createTrialSchema } from "@op/lib/validations/operator";

export interface CreateTrialActionResult {
  ok: boolean;
  message: string;
  warning?: string | null;
  tenantId?: number;
}

/** Asal host PELANGGAN untuk tautan surel — sama dengan `user-actions.ts`:
 *  action ini berjalan di host operator, dan tautan ke sana 404 bagi
 *  penerimanya. Kosong → tautan tidak dikirim (bukan `localhost`). */
function customerOrigin(): string | null {
  const raw = process.env.AUTH_URL?.trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export async function operatorCreateTrialTenant(input: unknown): Promise<CreateTrialActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.billing");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = createTrialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const data = parsed.data;

  const result = await createTrialTenant(
    { platform: platformDb, control: controlDb },
    {
      tenantName: data.tenantName,
      ownerName: data.ownerName,
      ownerEmail: data.ownerEmail,
      planKey: data.planKey,
      trialDays: data.trialDays,
      maxCompanies: data.maxCompanies > 0 ? data.maxCompanies : null,
      maxUsers: data.maxUsers > 0 ? data.maxUsers : null,
      billingMode: data.billingMode,
      referredByPartner: data.referredByPartner || null,
      isDemo: data.isDemo,
      actor: { operator: session.operator.name, reason: data.reason },
    }
  );

  if (result.outcome === "email_taken") {
    return { ok: false, message: t("operator.trial.errEmailTaken") };
  }
  if (result.outcome === "plan_not_found") {
    return { ok: false, message: t("operator.actions.plan.errPlan") };
  }

  revalidatePath("/tenants");

  /* Tautan atur-kata-sandi — kegagalannya PERINGATAN, bukan galat. */
  let warning: string | null = null;
  const origin = customerOrigin();
  if (!origin) {
    warning = t("operator.trial.warnNoOrigin");
  } else {
    const issued = await issueResetTokenForEmail(result.ownerEmail);
    if (!issued) {
      warning = t("operator.trial.warnMail");
    } else {
      try {
        await sendMail({
          to: result.ownerEmail,
          sensitive: true,
          ...trialWelcomeMail({
            name: data.ownerName,
            accountName: data.tenantName,
            link: `${origin}/reset-password?token=${issued.token}`,
            loginUrl: `${origin}/login`,
            trialEndsAt: result.trialEndsAt ? businessISODate(result.trialEndsAt) : null,
          }),
        });
      } catch (error) {
        console.error("[operator-trial] surel sambutan gagal dikirim:", error);
        warning = t("operator.trial.warnMail");
      }
    }
  }
  if (!result.subscriptionCreated) {
    warning = [warning, t("operator.trial.warnSubscription")].filter(Boolean).join(" ");
  }

  return {
    ok: true,
    message: t("operator.trial.created", { slug: result.tenantSlug, email: result.ownerEmail }),
    warning,
    tenantId: result.tenantId,
  };
}
