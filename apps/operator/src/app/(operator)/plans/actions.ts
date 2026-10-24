"use server";

/**
 * Server action KATALOG PAKET — satu-satunya: paket tampil / tersembunyi di
 * katalog publik (`plans.is_public`).
 *
 * Izinnya `site.settings` (owner SAJA), izin yang sama dengan sakelar "harga
 * di situs publik" di `/settings`: keduanya keputusan yang sama — apa yang
 * DITAWARKAN kepada orang luar — dan memecahnya ke dua izin berarti dua orang
 * bisa saling membatalkan keputusan penjualan. `is_public` juga menutup/membuka
 * jalan swalayan tenant pindah paket (`plan-change`), jadi alasan DIMINTA
 * (`operatorReasonField`) seperti aksi lain yang menyentuh penagihan tenant,
 * dan jejaknya memuat nilai lama, baru, dan alasannya.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getT } from "@sai/platform/i18n/server";
import { platformDb } from "@sai/platform/platform-db";
import { clientIpFrom } from "@sai/core/operator-plane";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { setPlanPublic, type PlanVisibilityDb } from "@op/lib/operator/plan-visibility";
import { planVisibilitySchema } from "@op/lib/validations/operator";

export interface PlanVisibilityActionResult {
  ok: boolean;
  message: string;
}

export async function operatorSetPlanPublic(input: unknown): Promise<PlanVisibilityActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.settings");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = planVisibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const { planId, isPublic, reason } = parsed.data;

  let result;
  try {
    result = await setPlanPublic(platformDb as unknown as PlanVisibilityDb, { planId, isPublic });
  } catch (error) {
    console.error("[operator-plans] visibilitas paket gagal disimpan:", error);
    return { ok: false, message: t("operator.plans.unavailable") };
  }

  if (result.outcome === "not_found") return { ok: false, message: t("operator.plans.errNotFound") };
  if (result.outcome === "free_plan") return { ok: false, message: t("operator.plans.errFreePlan") };
  if (result.outcome === "unchanged") {
    revalidatePath("/plans");
    return { ok: true, message: t("operator.plans.visibilityUnchanged") };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.plans.visibility",
    ipAddress: clientIpFrom(await headers()),
    details: { planId, planKey: result.key, isPublicFrom: result.from, isPublicTo: result.to, reason },
  });

  revalidatePath("/plans");
  return {
    ok: true,
    message: t(result.to ? "operator.plans.madePublic" : "operator.plans.madeHidden", {
      name: result.key,
    }),
  };
}
