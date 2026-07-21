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
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { approvalRuleSchema } from "@/lib/validations/approval";

async function loadRule(id: string) {
  const ruleId = parseInt(id, 10);
  if (!Number.isInteger(ruleId)) return null;
  return prisma.approvalRule.findUnique({ where: { id: ruleId } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const existing = await loadRule(id);
  if (!existing) {
    return NextResponse.json({ error: "Aturan tidak ditemukan." }, { status: 404 });
  }

  const parsed = approvalRuleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { documentType, minAmount, approverRole, note, isActive } = parsed.data;

  const duplicate = await prisma.approvalRule.findFirst({
    where: { documentType, minAmount, isActive: true, id: { not: existing.id } },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Sudah ada aturan aktif dengan jenis dokumen dan ambang yang sama." },
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
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const existing = await loadRule(id);
  if (!existing) {
    return NextResponse.json({ error: "Aturan tidak ditemukan." }, { status: 404 });
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
