"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { CACHE_SIGNAL_POLL_SECONDS } from "@sai/core/cache-signals";
import { getT } from "@sai/platform/i18n/server";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { clientIpFrom } from "@sai/core/operator-plane";
import { platformDb } from "@sai/platform/platform-db";
import { BRAND_MARK_MIN_SIDE, resetBrandMark, setBrandMark } from "@sai/platform/brand-assets";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { LogoRejection } from "@sai/core/image-file";

export interface BrandActionResult {
  ok: boolean;
  message: string;
}

/** Peta statis alasan → kunci kamus (penjaga kunci yatim membaca teks, bukan templat). */
const ALASAN: Record<LogoRejection, DictionaryKey> = {
  empty: "operator.brand.err.empty",
  too_large: "operator.brand.err.too_large",
  not_image: "operator.brand.err.not_image",
  too_small: "operator.brand.err.too_small",
  too_big_dimensions: "operator.brand.err.too_big_dimensions",
};

function revalidate() {
  // Layout akar ikut berganti: lambang di setiap halaman konsol membaca logo aktif.
  revalidatePath("/", "layout");
}

export async function operatorUploadBrandMark(formData: FormData): Promise<BrandActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.settings");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const file = formData.get("file");
  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
  const result = await setBrandMark({ platform: platformDb }, { bytes, actor: session.operator.name });
  if (result.outcome !== "ok") {
    return { ok: false, message: t(ALASAN[result.reason], { min: BRAND_MARK_MIN_SIDE }) };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.brand.update",
    ipAddress: clientIpFrom(await headers()),
    details: {
      sha256: result.meta.sha256,
      mimeType: result.meta.mimeType,
      width: result.meta.width,
      height: result.meta.height,
      bytes: bytes.length,
    },
  });
  revalidate();
  return { ok: true, message: t("operator.brand.saved", { seconds: CACHE_SIGNAL_POLL_SECONDS }) };
}

export async function operatorResetBrandMark(): Promise<BrandActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("site.settings");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const { deactivated } = await resetBrandMark({ platform: platformDb });
  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.brand.reset",
    ipAddress: clientIpFrom(await headers()),
    details: { deactivated },
  });
  revalidate();
  return { ok: true, message: t("operator.brand.resetDone") };
}
