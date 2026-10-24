/**
 * BENTUK USAHA perusahaan (24 Okt 2026) — Pengaturan → Bentuk usaha.
 *
 * GET — bentuk usaha + daftar pemilik/sekutu beserta akunnya.
 * PUT — ganti bentuk usaha. TIDAK menulis ulang jurnal apa pun: yang berubah
 *       hanya perlakuan KE DEPAN (tutup buku tahunan, rincian laporan). Karena
 *       itu permintaannya wajib membawa `acknowledged: true` — layar menampilkan
 *       peringatannya lebih dulu, dan API tidak menerima perubahan yang tidak
 *       didahului pembacaan itu.
 *
 * Izin `company_setting.manage`, sama dengan kartu profil perusahaan lain.
 * Jejaknya `company.legal_form.update` (dari/ke) di jejak audit buku ini.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import { currentCompanyId } from "@/lib/current-company";
import { getCompanyLegalForm, setCompanyLegalForm } from "@/lib/legal-form-server";
import { listPartners } from "@/lib/partners-service";
import { legalFormUpdateSchema } from "@/lib/validations/legal-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;
  const [legalForm, partners] = await Promise.all([getCompanyLegalForm(), listPartners()]);
  return NextResponse.json({ legalForm, partners });
}

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
  const parsed = legalFormUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("legalForm.errors.ackRequired"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const companyId = await currentCompanyId();
  const before = await getCompanyLegalForm(companyId);
  const after = parsed.data.legalForm;
  if (before !== after) {
    await setCompanyLegalForm(companyId, after);
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
      role: result.session.user.role,
      action: "company.legal_form.update",
      entity: "company",
      entityId: companyId,
      /* `journalsRewritten: false` ditulis TERANG: pertanyaan pertama auditor
         atas jejak ini adalah apakah angka lama ikut berubah. */
      details: { from: before, to: after, journalsRewritten: false },
      request,
    });
  }
  return NextResponse.json({ legalForm: after, partners: await listPartners() });
}
