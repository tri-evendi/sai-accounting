/**
 * Aturan approval — ubah & nonaktifkan (issue #25).
 *
 * DELETE menonaktifkan (`is_active = false`), TIDAK menghapus baris:
 * `approval_requests.rule_id` menunjuk ke sini dengan FK RESTRICT, jadi
 * menghapus aturan akan memutus jejak "pengajuan ini muncul karena aturan yang
 * mana" — persis larangan docs/DATABASE.md §1.3 untuk master data.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { approvalRuleSchema } from "@/lib/validations/approval";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

async function loadRule(id: string) {
  const ruleId = parseInt(id, 10);
  if (!Number.isInteger(ruleId)) return null;
  return prisma.approvalRule.findUnique({ where: { id: ruleId } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("approval_rule.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const existing = await loadRule(id);
  if (!existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.approvalRuleNotFound") }, { status: 404 });
  }

  const parsed = approvalRuleSchema.safeParse(await request.json());
  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }
  const { documentType, minAmount, approverRole, note, isActive } = parsed.data;

  const duplicate = await prisma.approvalRule.findFirst({
    where: { documentType, minAmount, isActive: true, id: { not: existing.id } },
  });
  if (duplicate) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.approvalRuleDuplicate") },
      { status: 400 }
    );
  }

  const rule = await prisma.approvalRule.update({
    where: { id: existing.id },
    data: {
      documentType,
      minAmount,
      approverRole,
      note: note ?? null,
      isActive: isActive ?? existing.isActive,
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "approval.rule.update",
    entity: "approval_rule",
    entityId: rule.id,
    details: {
      before: {
        documentType: existing.documentType,
        minAmount: Number(existing.minAmount),
        approverRole: existing.approverRole,
        isActive: existing.isActive,
      },
      after: {
        documentType: rule.documentType,
        minAmount: Number(rule.minAmount),
        approverRole: rule.approverRole,
        isActive: rule.isActive,
      },
    },
    request,
  });

  return NextResponse.json(rule);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("approval_rule.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const existing = await loadRule(id);
  if (!existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.approvalRuleNotFound") }, { status: 404 });
  }

  const rule = await prisma.approvalRule.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "approval.rule.deactivate",
    entity: "approval_rule",
    entityId: rule.id,
    details: {
      documentType: rule.documentType,
      minAmount: Number(rule.minAmount),
      approverRole: rule.approverRole,
    },
    request,
  });

  return NextResponse.json({
    id: rule.id,
    isActive: rule.isActive,
    message:
      "Aturan dinonaktifkan. Pengajuan yang sudah terbit tetap tercatat; dokumen baru " +
      "tidak lagi dicocokkan dengan aturan ini.",
  });
}
