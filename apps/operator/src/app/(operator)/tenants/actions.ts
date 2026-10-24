"use server";

/**
 * Server action daftar kerja PERMINTAAN AKTIVASI (alur demo-first, 24 Okt
 * 2026). Satu tindakan: tandai sudah ditangani — operator sudah menghubungi
 * prospeknya. Aktivasinya sendiri tetap lewat "Aktifkan dari penawaran" atau
 * "Perpanjang uji coba" di rincian tenant, masing-masing berjejak sendiri.
 *
 * Lapisannya tipis (pola aksi tulis #155): penjaga bidang + izin
 * `tenant.billing`, skema yang sama dengan formulir, inti di
 * `lib/operator/writes.ts`.
 */

import { revalidatePath } from "next/cache";

import { controlDb } from "@sai/core/control-db";
import { getT } from "@sai/platform/i18n/server";
import { platformDb } from "@sai/platform/platform-db";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { markActivationRequestHandled } from "@op/lib/operator/trial-writes";
import { activationHandledSchema } from "@op/lib/validations/operator";

import type { OperatorActionResult } from "./[id]/actions";

export async function operatorMarkActivationHandled(input: unknown): Promise<OperatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.billing");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = activationHandledSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.users.errReason") };

  const result = await markActivationRequestHandled(
    { platform: platformDb, control: controlDb },
    {
      requestId: parsed.data.requestId,
      actor: { operator: session.operator.name, reason: parsed.data.reason },
    }
  );
  switch (result.outcome) {
    case "handled":
      revalidatePath("/tenants");
      revalidatePath(`/tenants/${result.tenantId}`);
      revalidatePath("/");
      return { ok: true, message: t("operator.activation.handledDone") };
    case "already_handled":
      return { ok: false, message: t("operator.activation.errAlreadyHandled") };
    default:
      return { ok: false, message: t("operator.activation.errNotFound") };
  }
}
