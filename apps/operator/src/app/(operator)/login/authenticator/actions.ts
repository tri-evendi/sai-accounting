"use server";

/**
 * Server action PEMASANGAN AUTHENTICATOR saat masuk — dipanggil dari
 * `/login/authenticator` dengan sesi PEMASANGAN, bukan sesi konsol.
 *
 * SENGAJA tanpa `requireOperatorActionSession`: pemanggilnya belum bersesi
 * konsol (pola action login). Penggantinya, semuanya gagal-tertutup:
 *   1. `operatorPlaneViolation` (host + IP);
 *   2. token pemasangan yang sah, belum kedaluwarsa, dan masih cocok dengan
 *      akun + rahasia yang berlaku (`resolveEnrolment`);
 *   3. pembatas laju per akun, ember yang sama dengan konfirmasi di
 *      `/accounts/authenticator`;
 *   4. CSRF: perlindungan Origin bawaan server action + cookie `SameSite=Strict`,
 *      sama seperti action konsol lainnya.
 *
 * Rahasianya tidak pernah masuk jejak maupun log; jejak mencatat SIDIK-nya.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { controlDb } from "@sai/core/control-db";
import { clientIpFrom } from "@sai/core/operator-plane";
import { checkSharedRateLimit } from "@sai/platform/rate-limit-shared";
import { getT } from "@sai/platform/i18n/server";
import {
  readAuthenticatorConfirmationsFor,
  writeOperatorAuditLog,
  writeOperatorAuditLogOrThrow,
} from "@op/lib/operator/audit";
import {
  AUTHENTICATOR_CONFIRM_MAX,
  AUTHENTICATOR_RATE_WINDOW_MS,
  authenticatorConfirmBucket,
} from "@op/lib/operator/authenticator";
import { confirmEnrolment } from "@op/lib/operator/enrolment";
import { operatorPlaneViolation } from "@op/lib/operator/guard";
import { findDbOperatorCredential, recordOperatorLogin } from "@op/lib/operator/operator-accounts";
import { issueOperatorToken, verifyEnrolmentToken } from "@op/lib/operator/session";
import {
  clearEnrolmentCookies,
  readEnrolmentCookie,
  setOperatorSessionCookie,
} from "@op/lib/operator/session-cookies";

export interface EnrolmentFormState {
  error: string | null;
  /** Sesi pemasangan tidak lagi berlaku — layar menawarkan kembali ke login. */
  expired?: boolean;
}

const codeSchema = z.string().trim().regex(/^\d{6}$/);

export async function enrolmentConfirm(
  _previous: EnrolmentFormState,
  formData: FormData
): Promise<EnrolmentFormState> {
  const t = await getT();
  if ((await operatorPlaneViolation()) !== null) return { error: t("operator.enrol.expired"), expired: true };

  const ip = clientIpFrom(await headers());
  const payload = verifyEnrolmentToken(await readEnrolmentCookie());
  if (!payload) {
    await clearEnrolmentCookies();
    return { error: t("operator.enrol.expired"), expired: true };
  }

  const limit = await checkSharedRateLimit(authenticatorConfirmBucket(payload.sub), {
    windowMs: AUTHENTICATOR_RATE_WINDOW_MS,
    maxAttempts: AUTHENTICATOR_CONFIRM_MAX,
  });
  if (!limit.allowed) return { error: t("operator.login.rateLimited") };

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: t("operator.authenticator.errCode") };

  const result = await confirmEnrolment(
    {
      findDbAccount: (name) => findDbOperatorCredential({ control: controlDb }, name),
      readConfirmations: readAuthenticatorConfirmationsFor,
    },
    payload,
    code.data
  );

  if (result.outcome === "invalid") {
    await writeOperatorAuditLog({
      operator: payload.sub,
      action: "operator.authenticator.enroll.failed",
      ipAddress: ip,
      details: { source: payload.src, reason: "session_invalid" },
    });
    await clearEnrolmentCookies();
    return { error: t("operator.enrol.expired"), expired: true };
  }

  const { account, fingerprint } = result.context;
  if (result.outcome === "wrong_code") {
    await writeOperatorAuditLog({
      operator: account.name,
      action: "operator.authenticator.enroll.failed",
      ipAddress: ip,
      details: { source: account.source, reason: "wrong_code" },
    });
    return { error: t("operator.authenticator.errCode") };
  }

  const token = issueOperatorToken(account.name, new Date(), process.env, {
    source: account.source,
    sessionVersion: account.sessionVersion,
  });
  if (!token) {
    console.error(
      "[operator] OPERATOR_SESSION_SECRET tidak diset / kurang dari 32 karakter — konsol menolak semua login."
    );
    return { error: t("operator.enrol.expired"), expired: true };
  }

  /* Konfirmasi DULU, baru sesi: baris inilah yang membuat login berikutnya
     menuntut kode. Bila jejaknya gagal ditulis, sesi tidak terbit — akun yang
     "masuk tanpa terkonfirmasi" akan dipasang ulang oleh siapa pun berikutnya. */
  try {
    await writeOperatorAuditLogOrThrow({
      operator: account.name,
      action: "operator.authenticator.enroll.confirm",
      ipAddress: ip,
      details: { source: account.source, fingerprint },
    });
  } catch (error) {
    console.error("[operator] konfirmasi pemasangan gagal dicatat:", error);
    return { error: t("operator.enrol.unavailable") };
  }

  await clearEnrolmentCookies();
  await setOperatorSessionCookie(token);
  if (account.id !== null) {
    await recordOperatorLogin({ control: controlDb }, account.id).catch((error) =>
      console.error("[operator] gagal mencatat masuk terakhir:", error)
    );
  }
  await writeOperatorAuditLog({
    operator: account.name,
    action: "operator.login",
    details: { source: account.source, role: account.role, enrolled: true },
    ipAddress: ip,
  });

  redirect("/");
}

/** Batal: buang sesi pemasangan, kembali ke login. */
export async function enrolmentCancel(): Promise<void> {
  await clearEnrolmentCookies();
  redirect("/login");
}
