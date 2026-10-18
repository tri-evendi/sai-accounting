"use server";

/**
 * Server action BANTUAN PENGGUNA (izin `tenant.users`: dukungan + owner).
 *
 * Tiga tindakan, semuanya membuka kembali jalan masuk TANPA operator memegang
 * rahasia siapa pun (lihat kepala `lib/operator/user-support.ts`):
 *   - cabut semua sesi seorang pengguna;
 *   - kirim tautan atur-ulang kata sandi ke alamat PEMILIK akunnya;
 *   - terbitkan ulang undangan yang masih terbuka (token baru, yang lama mati).
 *
 * Setiap tindakan menulis jejak TENANT (milik tenantnya, aktor
 * `operator:<nama>`, alasan WAJIB) — pelanggan yang bertanya "siapa mengeluarkan
 * saya?" harus bisa dijawab dari jejaknya sendiri.
 *
 * Tautan surel memakai `AUTH_URL` (host PELANGGAN), bukan host permintaan:
 * action ini berjalan di host OPERATOR, dan tautan ke sana akan 404 bagi
 * penerimanya. `AUTH_URL` kosong → DITOLAK, bukan tautan `localhost`.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invitationMail, passwordResetMail } from "@sai/core/account-mail";
import { auditActor } from "@sai/platform/billing/change-tenant-plan";
import { controlDb } from "@sai/core/control-db";
import { getT } from "@sai/platform/i18n/server";
import { issueInvitation } from "@sai/platform/invitation-store";
import { sendMail } from "@sai/platform/mailer";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import {
  invitationOfTenant,
  revokeUserSessions,
  userOfTenant,
} from "@op/lib/operator/user-support";
import { issueResetTokenForEmail } from "@sai/platform/password-reset-store";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";

import type { OperatorActionResult } from "./actions";

const schema = z.object({
  tenantId: z.number().int().positive(),
  targetId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

function customerOrigin(): string | null {
  const raw = process.env.AUTH_URL?.trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function tenantSlug(tenantId: number): Promise<string | null> {
  const t = await controlDb.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return t?.slug ?? null;
}

async function gate() {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.users");
  return { t, session };
}

export async function operatorRevokeUserSessions(input: unknown): Promise<OperatorActionResult> {
  const { t, session } = await gate();
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.users.errReason") };
  const { tenantId, targetId, reason } = parsed.data;

  const user = await userOfTenant({ control: controlDb }, tenantId, targetId);
  const slug = await tenantSlug(tenantId);
  if (!user || !slug) return { ok: false, message: t("operator.users.errNotFound") };

  await revokeUserSessions({ control: controlDb }, tenantId, targetId);
  await writeTenantAuditLog({
    tenantId,
    tenantSlug: slug,
    ...auditActor({ operator: session.operator.name, reason }),
    action: "tenant.user.sessions_revoke",
    details: { reason, userId: user.id, username: user.username },
  });
  revalidatePath(`/operator/tenants/${tenantId}`);
  return { ok: true, message: t("operator.users.revoked", { name: user.name ?? user.username }) };
}

export async function operatorSendPasswordReset(input: unknown): Promise<OperatorActionResult> {
  const { t, session } = await gate();
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.users.errReason") };
  const { tenantId, targetId, reason } = parsed.data;

  const origin = customerOrigin();
  if (!origin) return { ok: false, message: t("operator.users.errNoOrigin") };

  const user = await userOfTenant({ control: controlDb }, tenantId, targetId);
  const slug = await tenantSlug(tenantId);
  if (!user || !slug) return { ok: false, message: t("operator.users.errNotFound") };
  if (!user.email) return { ok: false, message: t("operator.users.errNoEmail") };

  const issued = await issueResetTokenForEmail(user.email);
  if (!issued || issued.userId !== user.id) {
    return { ok: false, message: t("operator.users.errNotFound") };
  }
  try {
    await sendMail({
      to: user.email,
      sensitive: true,
      ...passwordResetMail({ name: issued.name, link: `${origin}/reset-password?token=${issued.token}` }),
    });
  } catch (error) {
    console.error("[operator-users] tautan atur-ulang gagal dikirim:", error);
    return { ok: false, message: t("operator.users.errMail") };
  }

  await writeTenantAuditLog({
    tenantId,
    tenantSlug: slug,
    ...auditActor({ operator: session.operator.name, reason }),
    action: "tenant.user.password_reset_sent",
    /* Alamat tujuan dicatat — itulah yang menjawab "ke mana tautannya pergi"
       bila pemilik akun bilang tidak pernah menerimanya. Tokennya TIDAK. */
    details: { reason, userId: user.id, username: user.username, to: user.email },
  });
  return { ok: true, message: t("operator.users.resetSent", { email: user.email }) };
}

export async function operatorResendInvitation(input: unknown): Promise<OperatorActionResult> {
  const { t, session } = await gate();
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.users.errReason") };
  const { tenantId, targetId, reason } = parsed.data;

  const origin = customerOrigin();
  if (!origin) return { ok: false, message: t("operator.users.errNoOrigin") };

  const inv = await invitationOfTenant({ control: controlDb }, tenantId, targetId);
  const slug = await tenantSlug(tenantId);
  if (!inv || !slug) return { ok: false, message: t("operator.users.errInvitation") };

  /* Diperiksa SEBELUM `issueInvitation`: untuk alamat yang kini sudah punya
     akun setenant, fungsi itu langsung MENAMBAHKAN orangnya ke PT — efek
     samping yang tidak dimaksud oleh "kirim ulang surel". */
  const existing = await controlDb.user.findUnique({ where: { email: inv.email }, select: { id: true } });
  if (existing) return { ok: false, message: t("operator.users.errInvitationHasAccount") };

  const issued = await issueInvitation({
    tenantId,
    companyId: inv.companyId,
    email: inv.email,
    companyRole: inv.companyRole,
    invitedByUserId: inv.invitedByUserId,
  });
  if (issued.outcome !== "invite_new_user") {
    /* Sejak undangan pertama alamat itu sudah punya akun (setenant → sudah
       ditambahkan; lintas tenant → ditolak). Tidak ada tautan yang dikirim. */
    return { ok: false, message: t("operator.users.errInvitationOutcome", { outcome: issued.outcome }) };
  }
  try {
    await sendMail({
      to: inv.email,
      sensitive: true,
      ...invitationMail({
        companyName: inv.companyName,
        inviterName: inv.inviterName,
        link: `${origin}/accept-invitation?token=${issued.token}`,
      }),
    });
  } catch (error) {
    console.error("[operator-users] undangan gagal dikirim ulang:", error);
    return { ok: false, message: t("operator.users.errMail") };
  }

  await writeTenantAuditLog({
    tenantId,
    tenantSlug: slug,
    ...auditActor({ operator: session.operator.name, reason }),
    action: "tenant.invitation.resend",
    details: { reason, invitationId: inv.id, email: inv.email, role: inv.companyRole },
  });
  revalidatePath(`/operator/tenants/${tenantId}`);
  return { ok: true, message: t("operator.users.invitationResent", { email: inv.email }) };
}
