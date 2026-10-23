"use server";

/**
 * Server action PASANG AUTHENTICATOR — akun SENDIRI saja.
 *
 * Pagar yang sama dengan aksi konsol lainnya, ditambah dua:
 *   1. penjaga bidang + izin `operator.self` (semua peran);
 *   2. zod pada masukan;
 *   3. PEMBATAS LAJU per akun — bukan per IP: sesi yang dicuri tidak boleh
 *      mendapat percobaan kata sandi tanpa batas hanya karena ia berganti IP;
 *   4. BUKTI ULANG (kata sandi + kode bila MFA hidup) sebelum rahasia apa pun
 *      dikirim ke layar — di `lib/operator/authenticator.ts`.
 *
 * Rahasia dan QR-nya DIKEMBALIKAN ke layar pemintanya saja dan tidak pernah
 * masuk jejak, log, maupun cache. Jejak mencatat SIDIK-nya.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { controlDb } from "@sai/core/control-db";
import { clientIpFrom } from "@sai/core/operator-plane";
import { checkSharedRateLimit } from "@sai/platform/rate-limit-shared";
import { getT } from "@sai/platform/i18n/server";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import {
  AUTHENTICATOR_CONFIRM_MAX,
  AUTHENTICATOR_RATE_WINDOW_MS,
  AUTHENTICATOR_REAUTH_MAX,
  authenticatorConfirmBucket,
  confirmAuthenticator,
  finishRotation,
  revealAuthenticator,
  startRotation,
  type AuthenticatorEnrolment,
} from "@op/lib/operator/authenticator";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { findDbOperatorCredential } from "@op/lib/operator/operator-accounts";

export interface AuthenticatorActionResult {
  ok: boolean;
  message: string;
  /** Hanya sesudah bukti ulang berhasil. */
  enrolment?: AuthenticatorEnrolment;
  /** Hanya pada putaran: tiket tersegel yang dibawa ke langkah konfirmasi. */
  ticket?: string;
}


const revealSchema = z.object({
  password: z.string().min(1).max(200),
  code: z.string().trim().max(6).default(""),
  mode: z.enum(["current", "rotate"]),
});

const confirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  /** Ada = konfirmasi PUTARAN; tidak ada = konfirmasi rahasia yang berlaku. */
  ticket: z.string().min(1).max(4000).optional(),
});

function deps() {
  return { findDbAccount: (name: string) => findDbOperatorCredential({ control: controlDb }, name) };
}

export async function authenticatorReveal(input: unknown): Promise<AuthenticatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("operator.self");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const { operator } = session;
  const ipAddress = clientIpFrom(await headers());

  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.authenticator.errReauth") };

  const limit = await checkSharedRateLimit(`operator-authenticator-reauth:${operator.name.toLowerCase()}`, {
    windowMs: AUTHENTICATOR_RATE_WINDOW_MS,
    maxAttempts: AUTHENTICATOR_REAUTH_MAX,
  });
  if (!limit.allowed) return { ok: false, message: t("operator.login.rateLimited") };

  const credentials = { password: parsed.data.password, code: parsed.data.code };

  if (parsed.data.mode === "rotate") {
    const result = await startRotation(deps(), operator, credentials);
    switch (result.outcome) {
      case "started":
        /* Belum ada yang berubah — yang dicatat hanya bahwa QR baru dilihat. */
        await writeOperatorAuditLog({
          operator: operator.name,
          action: "operator.authenticator.reveal",
          ipAddress,
          details: { source: operator.source, rotation: true },
        });
        return {
          ok: true,
          message: t("operator.authenticator.rotationStarted"),
          enrolment: result.enrolment,
          ticket: result.ticket,
        };
      case "env_account":
        return { ok: false, message: t("operator.authenticator.envRotate") };
      case "key_missing":
        return { ok: false, message: t("operator.accounts.errKey") };
      case "denied":
        await writeOperatorAuditLog({
          operator: operator.name,
          action: "operator.authenticator.reveal.failed",
          ipAddress,
          details: { source: operator.source, rotation: true },
        });
        return { ok: false, message: t("operator.authenticator.errReauth") };
    }
  }

  const result = await revealAuthenticator(deps(), operator, credentials);
  switch (result.outcome) {
    case "revealed":
      await writeOperatorAuditLog({
        operator: operator.name,
        action: "operator.authenticator.reveal",
        ipAddress,
        details: { source: operator.source, fingerprint: result.fingerprint },
      });
      return { ok: true, message: t("operator.authenticator.revealed"), enrolment: result.enrolment };
    case "unavailable":
      return { ok: false, message: t("operator.authenticator.errUnavailable") };
    case "denied":
      await writeOperatorAuditLog({
        operator: operator.name,
        action: "operator.authenticator.reveal.failed",
        ipAddress,
        details: { source: operator.source },
      });
      return { ok: false, message: t("operator.authenticator.errReauth") };
  }
}

export async function authenticatorConfirm(input: unknown): Promise<AuthenticatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("operator.self");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const { operator } = session;
  const ipAddress = clientIpFrom(await headers());

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.authenticator.errCode") };

  const limit = await checkSharedRateLimit(authenticatorConfirmBucket(operator.name), {
    windowMs: AUTHENTICATOR_RATE_WINDOW_MS,
    maxAttempts: AUTHENTICATOR_CONFIRM_MAX,
  });
  if (!limit.allowed) return { ok: false, message: t("operator.login.rateLimited") };

  const rotation = parsed.data.ticket !== undefined;
  const failed = async (reason: string) => {
    await writeOperatorAuditLog({
      operator: operator.name,
      action: "operator.authenticator.confirm.failed",
      ipAddress,
      details: { source: operator.source, reason, rotation },
    });
  };

  if (parsed.data.ticket !== undefined) {
    const result = await finishRotation({ control: controlDb }, operator, {
      ticket: parsed.data.ticket,
      code: parsed.data.code,
    });
    switch (result.outcome) {
      case "rotated":
        await writeOperatorAuditLog({
          operator: operator.name,
          action: "operator.authenticator.rotate",
          ipAddress,
          details: { source: operator.source, fingerprint: result.fingerprint },
        });
        revalidatePath("/accounts");
        revalidatePath("/accounts/authenticator");
        return { ok: true, message: t("operator.authenticator.rotated") };
      case "wrong_code":
        await failed("wrong_code");
        return { ok: false, message: t("operator.authenticator.errCode") };
      case "ticket_invalid":
        await failed("ticket_invalid");
        return { ok: false, message: t("operator.authenticator.errTicket") };
      case "env_account":
        return { ok: false, message: t("operator.authenticator.envRotate") };
      case "key_missing":
        return { ok: false, message: t("operator.accounts.errKey") };
    }
  }

  const result = await confirmAuthenticator(deps(), operator, parsed.data.code);
  switch (result.outcome) {
    case "confirmed":
      await writeOperatorAuditLog({
        operator: operator.name,
        action: "operator.authenticator.confirm",
        ipAddress,
        details: { source: operator.source, fingerprint: result.fingerprint },
      });
      revalidatePath("/accounts");
      revalidatePath("/accounts/authenticator");
      return { ok: true, message: t("operator.authenticator.confirmed") };
    case "wrong_code":
      await failed("wrong_code");
      return { ok: false, message: t("operator.authenticator.errCode") };
    case "unavailable":
      return { ok: false, message: t("operator.authenticator.errUnavailable") };
  }
}
