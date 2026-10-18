"use server";

/**
 * Server action AKUN OPERATOR (migration kendali 0004). Tiga pagar, urutan
 * yang sama dengan aksi konsol lainnya:
 *   1. penjaga bidang + izin `operator.accounts` (owner saja);
 *   2. zod pada masukan;
 *   3. aturan anti-terkunci di `operator-accounts.ts` (diri sendiri, owner
 *      terakhir) — ditegakkan di inti, bukan di layar.
 *
 * Kredensial yang diterbitkan (kata sandi + rahasia TOTP) DIKEMBALIKAN SEKALI
 * ke layar pembuatnya dan TIDAK masuk jejak audit, log, maupun cache.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { controlDb } from "@sai/core/control-db";
import { getT } from "@/lib/i18n/server";
import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { parseOperatorAccounts } from "@/lib/operator/credentials";
import { requireOperatorActionSession } from "@/lib/operator/guard";
import {
  createOperatorAccount,
  updateOperatorAccount,
  type IssuedCredential,
} from "@/lib/operator/operator-accounts";
import { clientIpFrom } from "@/lib/operator/plane";
import { OPERATOR_ROLES } from "@/lib/operator/roles";

export interface OperatorAccountActionResult {
  ok: boolean;
  message: string;
  /** Hanya saat akun DIBUAT atau kredensialnya DIATUR ULANG — tampil sekali. */
  credential?: IssuedCredential;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(50),
  role: z.enum(OPERATOR_ROLES),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("role"), role: z.enum(OPERATOR_ROLES) }),
    z.object({ kind: z.literal("deactivate") }),
    z.object({ kind: z.literal("activate") }),
    z.object({ kind: z.literal("revoke") }),
    z.object({ kind: z.literal("reset") }),
  ]),
});

function envAccounts() {
  return parseOperatorAccounts(process.env.OPERATOR_USERS);
}

export async function operatorCreateAccount(input: unknown): Promise<OperatorAccountActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("operator.accounts");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.accounts.errName") };

  const result = await createOperatorAccount(
    { control: controlDb },
    {
      name: parsed.data.name,
      role: parsed.data.role,
      actor: session.operator.name,
      envNames: envAccounts().map((a) => a.name),
    }
  );

  switch (result.outcome) {
    case "created":
      await writeOperatorAuditLog({
        operator: session.operator.name,
        action: "operator.account.create",
        ipAddress: clientIpFrom(await headers()),
        details: { account: result.credential.name, role: parsed.data.role },
      });
      revalidatePath("/operator/accounts");
      return {
        ok: true,
        message: t("operator.accounts.created", { name: result.credential.name }),
        credential: result.credential,
      };
    case "name_invalid":
      return { ok: false, message: t("operator.accounts.errName") };
    case "role_invalid":
      return { ok: false, message: t("operator.accounts.errRole") };
    case "env_name":
      return { ok: false, message: t("operator.accounts.errEnvName") };
    case "name_taken":
      return { ok: false, message: t("operator.accounts.errTaken") };
    case "key_missing":
      return { ok: false, message: t("operator.accounts.errKey") };
  }
}

const AUDIT_ACTION = {
  role: "operator.account.role",
  deactivate: "operator.account.deactivate",
  activate: "operator.account.activate",
  revoke: "operator.account.revoke",
  reset: "operator.account.reset",
} as const;

export async function operatorUpdateAccount(input: unknown): Promise<OperatorAccountActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("operator.accounts");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.actions.denied") };
  const { id, change } = parsed.data;

  const result = await updateOperatorAccount(
    { control: controlDb },
    { id, change, actor: session.operator.name, envOwnerCount: envAccounts().length }
  );

  switch (result.outcome) {
    case "updated":
      await writeOperatorAuditLog({
        operator: session.operator.name,
        action: AUDIT_ACTION[change.kind],
        ipAddress: clientIpFrom(await headers()),
        details: {
          account: result.name,
          roleFrom: result.before.role,
          roleTo: change.kind === "role" ? change.role : result.before.role,
          activeFrom: result.before.isActive,
          activeTo:
            change.kind === "deactivate" ? false : change.kind === "activate" ? true : result.before.isActive,
          /* Ditandai, bukan disalin: kredensialnya sendiri tidak pernah masuk jejak. */
          sessionsRevoked: change.kind === "revoke" || change.kind === "reset" || change.kind === "deactivate",
        },
      });
      revalidatePath("/operator/accounts");
      return {
        ok: true,
        message: t("operator.accounts.updated", { name: result.name }),
        credential: result.credential,
      };
    case "not_found":
      return { ok: false, message: t("operator.accounts.errNotFound") };
    case "self_lockout":
      return { ok: false, message: t("operator.accounts.errSelf") };
    case "last_owner":
      return { ok: false, message: t("operator.accounts.errLastOwner") };
    case "key_missing":
      return { ok: false, message: t("operator.accounts.errKey") };
    case "unchanged":
      return { ok: true, message: t("operator.accounts.unchanged") };
  }
}
