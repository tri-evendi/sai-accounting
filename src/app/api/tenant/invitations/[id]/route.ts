/**
 * Mencabut undangan yang masih menunggu (issue #139).
 *
 * Penjaganya sama dengan penerbitnya (`tenant.member.invite`): yang boleh
 * mengundang, boleh menarik undangannya. Pencabutan menandai `used_at` —
 * barisnya tetap tinggal sebagai jejak, tautan di surelnya berhenti bekerja.
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { controlDb } from "@/lib/control-db";
import { companyScopeFromRequest } from "@/lib/company-request";
import { revokeInvitation } from "@/lib/invitation-store";
import { runWithCompany } from "@/lib/company-context";
import { writeAuditLog } from "@/lib/audit";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { getRequestI18n } from "@/lib/i18n/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenantApiPermission("tenant.member.invite");
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  /* PT yang sedang dibuka datang dari PERMINTAAN (issue #158), dan `tenantId`
   * ikut ke dalam WHERE — slug perusahaan hanya unik di dalam tenant (#153),
   * jadi baris pelanggan lain tidak boleh pernah terbaca. */
  const scope = await companyScopeFromRequest();
  const company = scope
    ? await controlDb.company.findFirst({
        where: {
          slug: scope.companySlug,
          tenantId: result.tenant.tenantId,
          tenant: { slug: scope.tenantSlug },
        },
        select: { id: true, slug: true, databaseName: true, isActive: true, tenantId: true },
      })
    : null;
  if (!company || !company.isActive) {
    return NextResponse.json(
      { error: t("errors.selectCompanyFirst"), code: "company_required" },
      { status: 409 }
    );
  }

  /* Dikunci ke PT yang sedang dibuka: undangan PT lain (walau setenant) tidak
   * bisa dicabut dari sini — layarnya per perusahaan, kewenangannya mengikuti. */
  const revoked = await revokeInvitation(id, company.id);
  if (!revoked) {
    return NextResponse.json({ error: t("invitations.notFound") }, { status: 404 });
  }

  // Dua tingkat (issue #142): peristiwa tenant + konteks PT — lihat POST-nya.
  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    tenantRole: result.tenant.role,
    action: "tenant.invitation.revoke",
    details: { invitationId: id, companySlug: company.slug },
    request,
  });
  await runWithCompany(
    { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
    () =>
      writeAuditLog({
        userId: result.session.user.id,
        username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
        role: result.tenant.role,
        action: "user.invite_revoked",
        entity: "invitation",
        entityId: id,
        request,
      })
  );

  return NextResponse.json({ ok: true });
}
