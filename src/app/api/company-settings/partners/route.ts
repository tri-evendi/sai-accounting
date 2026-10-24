/**
 * PEMILIK / SEKUTU (24 Okt 2026) — simpan seluruh daftar sekaligus.
 *
 * PUT — nama, peran, porsi, aktif untuk setiap pemilik/sekutu; baris tanpa
 *       `id` adalah sekutu BARU dan lahir bersama akun Modal & Prive-nya
 *       (`lib/partners-service.ts`). Porsi sekutu aktif wajib tepat 100%.
 *       Tidak menyentuh jurnal: porsi baru berlaku untuk tutup buku berikutnya.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import { getCompanyLegalForm } from "@/lib/legal-form-server";
import { listPartners, PartnerSaveError, savePartners } from "@/lib/partners-service";
import { partnersUpdateSchema } from "@/lib/validations/legal-form";
import { LEGAL_FORM_ERROR_KEYS } from "@/lib/legal-form-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;
  const { dictionary, t } = await getRequestI18n();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }
  const parsed = partnersUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const legalForm = await getCompanyLegalForm();
  try {
    const saved = await savePartners(legalForm, parsed.data.partners);
    const actor = {
      userId: result.session.user.id,
      username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
      role: result.session.user.role,
    };
    for (const c of saved.created) {
      await writeAuditLog({
        ...actor,
        action: "company_partner.create",
        entity: "company_partner",
        entityId: c.id,
        details: { name: c.name, capitalAccount: c.capitalCode, drawingAccount: c.drawingCode, legalForm },
        request,
      });
    }
    for (const u of saved.updated) {
      await writeAuditLog({
        ...actor,
        action: "company_partner.update",
        entity: "company_partner",
        entityId: u.id,
        details: { before: u.before, after: u.after, legalForm },
        request,
      });
    }
    return NextResponse.json({ legalForm, partners: await listPartners() });
  } catch (e) {
    if (e instanceof PartnerSaveError) {
      return NextResponse.json(
        { error: e.issues.map((k) => t(LEGAL_FORM_ERROR_KEYS[k])).join(" "), errors: e.issues },
        { status: 400 }
      );
    }
    throw e;
  }
}
