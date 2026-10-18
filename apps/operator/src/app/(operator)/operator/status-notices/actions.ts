"use server";

/**
 * Server action PENGUMUMAN STATUS (izin `platform.status`: dukungan + owner).
 * Tanpa teks bebas — lihat `lib/status-notices.ts`.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getT } from "@sai/platform/i18n/server";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { clientIpFrom } from "@sai/core/operator-plane";
import { platformDb } from "@sai/platform/platform-db";
import { createStatusNotice, setStatusNoticePhase } from "@sai/platform/status-notices-store";
import { STATUS_NOTICE_COMPONENTS, STATUS_NOTICE_KINDS, STATUS_NOTICE_PHASES } from "@sai/core/status-notices";

export interface StatusNoticeActionResult {
  ok: boolean;
  message: string;
}

const createSchema = z.object({
  kind: z.enum(STATUS_NOTICE_KINDS),
  component: z.enum(STATUS_NOTICE_COMPONENTS),
  phase: z.enum(STATUS_NOTICE_PHASES),
  /* `datetime-local` dari peramban, tanpa zona — dibaca sebagai waktu SERVER
     (WIB di produksi). Diubah ke Date di sini, divalidasi urutannya di inti. */
  startsAt: z.string().min(16),
  endsAt: z.string().optional(),
  showInApp: z.boolean(),
});

const phaseSchema = z.object({
  id: z.number().int().positive(),
  phase: z.enum(STATUS_NOTICE_PHASES),
});

function revalidate() {
  revalidatePath("/operator/status-notices");
  revalidatePath("/status");
}

export async function operatorCreateStatusNotice(input: unknown): Promise<StatusNoticeActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("platform.status");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.statusNotices.errInvalid") };

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    return { ok: false, message: t("operator.statusNotices.errInvalid") };
  }
  const result = await createStatusNotice(
    { platform: platformDb },
    { ...parsed.data, startsAt, endsAt, actor: session.operator.name }
  );
  if (result.outcome !== "ok") return { ok: false, message: t("operator.statusNotices.errInvalid") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.status.create",
    ipAddress: clientIpFrom(await headers()),
    details: { id: result.id, ...parsed.data },
  });
  revalidate();
  return { ok: true, message: t("operator.statusNotices.created") };
}

export async function operatorSetStatusNoticePhase(input: unknown): Promise<StatusNoticeActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("platform.status");
  if (!session) return { ok: false, message: t("operator.actions.denied") };
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.statusNotices.errInvalid") };

  const result = await setStatusNoticePhase({ platform: platformDb }, parsed.data);
  if (result.outcome !== "ok") return { ok: false, message: t("operator.statusNotices.errInvalid") };

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.status.phase",
    ipAddress: clientIpFrom(await headers()),
    details: parsed.data,
  });
  revalidate();
  return { ok: true, message: t("operator.statusNotices.updated") };
}
