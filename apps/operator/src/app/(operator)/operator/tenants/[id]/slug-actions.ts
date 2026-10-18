"use server";

/**
 * GANTI SLUG TENANT dari konsol — padanan layar dari
 * `scripts/rename-tenant-slug.ts` (#458 lingkup 4). Izin `tenant.lifecycle`.
 *
 * Pagarnya SAMA PERSIS dengan halaman pelanggan dan skrip, karena ketiganya
 * memanggil `renameTenantSlug()`: slug lama dipesan selamanya dan dipantulkan,
 * dan jeda 30 hari IKUT berlaku — memberi operator jalan pintas untuk
 * melewatinya berarti pagar itu berhenti berarti pada hari pertama seseorang
 * terburu-buru (kepala skrip).
 */
import { revalidatePath } from "next/cache";

import { auditActor } from "@sai/platform/billing/change-tenant-plan";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { renameTenantSlug } from "@sai/platform/tenant-slug";
import { slugRenameSchema as schema } from "@op/lib/validations/operator";
import { invalidateTenantState } from "@sai/platform/tenant-state";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";

import type { OperatorActionResult } from "./actions";


const PESAN_TOLAK: Record<string, DictionaryKey> = {
  bentuk: "operator.slug.errShape",
  terlarang: "operator.slug.errReserved",
  sama: "operator.slug.errSame",
  dipakai: "operator.slug.errTaken",
  "terlalu-sering": "operator.slug.errTooSoon",
  "tidak-ada": "operator.tenant.notFound",
};

export async function operatorRenameTenantSlug(input: unknown): Promise<OperatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.lifecycle");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("operator.users.errReason") };
  const { tenantId, slugBaru, reason } = parsed.data;

  const hasil = await renameTenantSlug({ tenantId, slugBaru });
  if (!hasil.ok) {
    return { ok: false, message: t(PESAN_TOLAK[hasil.reason] ?? "operator.actions.denied") };
  }

  await writeTenantAuditLog({
    tenantId,
    /* Slug BARU sebagai pegangan jejak — slug lama ikut di rincian, dan
       riwayatnya dipesan di `tenant_slug_history`. */
    tenantSlug: hasil.slugBaru,
    ...auditActor({ operator: session.operator.name, reason }),
    action: "tenant.slug.change",
    details: { from: hasil.slugLama, to: hasil.slugBaru, reason },
  });
  invalidateTenantState();
  revalidatePath(`/operator/tenants/${tenantId}`);
  return { ok: true, message: t("operator.slug.changed", { from: hasil.slugLama, to: hasil.slugBaru }) };
}
