"use server";

/**
 * Server action PENAWARAN MASUK (`lead_requests`, migration platform 0016):
 * ubah status (dihubungi / selesai / spam / pulihkan) dan tambah catatan.
 *
 * Izinnya `tenant.billing` — pekerjaan penjualan yang sama dengan menangani
 * permintaan aktivasi dan "Aktifkan dari penawaran" (peran `owner` &
 * `billing`). Membaca daftarnya terbuka bagi setiap operator, seperti seluruh
 * konsol (`roles.ts`: peran membagi TINDAKAN, bukan BACAAN).
 *
 * Lapisannya tipis (pola aksi tulis #155): penjaga bidang + izin, skema yang
 * sama dengan formulirnya, inti di `lib/operator/lead-writes.ts`.
 */

import { revalidatePath } from "next/cache";

import { getT } from "@sai/platform/i18n/server";
import { platformDb } from "@sai/platform/platform-db";
import { writeOperatorAuditLog } from "@op/lib/operator/audit";
import { requireOperatorActionSession } from "@op/lib/operator/guard";
import { addLeadNote, changeLeadStatus, type LeadWriteDeps } from "@op/lib/operator/lead-writes";
import { leadNoteSchema, leadStatusSchema } from "@op/lib/validations/operator";

import type { OperatorActionResult } from "../tenants/[id]/actions";

function deps(): LeadWriteDeps {
  return { platform: platformDb, audit: writeOperatorAuditLog };
}

function segarkan(leadId: number) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

export async function operatorChangeLeadStatus(input: unknown): Promise<OperatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.billing");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = leadStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };

  try {
    const result = await changeLeadStatus(deps(), { ...parsed.data, operator: session.operator.name });
    switch (result.outcome) {
      case "changed":
        segarkan(parsed.data.leadId);
        return { ok: true, message: t("operator.leads.statusDone", { reference: result.reference }) };
      case "invalid_transition":
        return { ok: false, message: t("operator.leads.errTransition") };
      case "conflict":
        return { ok: false, message: t("operator.leads.errConflict") };
      default:
        return { ok: false, message: t("operator.leads.errNotFound") };
    }
  } catch (error) {
    console.error("[operator-leads] ubah status gagal:", error);
    return { ok: false, message: t("operator.leads.errUnavailable") };
  }
}

export async function operatorAddLeadNote(input: unknown): Promise<OperatorActionResult> {
  const t = await getT();
  const session = await requireOperatorActionSession("tenant.billing");
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  const parsed = leadNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.leadNoteRequired") };

  try {
    const result = await addLeadNote(deps(), { ...parsed.data, operator: session.operator.name });
    switch (result.outcome) {
      case "added":
        segarkan(parsed.data.leadId);
        return { ok: true, message: t("operator.leads.noteDone") };
      case "anonymized":
        return { ok: false, message: t("operator.leads.errAnonymized") };
      case "conflict":
        return { ok: false, message: t("operator.leads.errConflict") };
      default:
        return { ok: false, message: t("operator.leads.errNotFound") };
    }
  } catch (error) {
    console.error("[operator-leads] tambah catatan gagal:", error);
    return { ok: false, message: t("operator.leads.errUnavailable") };
  }
}
