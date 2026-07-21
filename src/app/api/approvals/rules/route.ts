/**
 * Aturan approval — daftar & buat (issue #25). bos-only, seperti permukaan
 * kebijakan lain (periode, anggaran, setup): siapa yang harus menandatangani apa
 * adalah keputusan manajemen, bukan pengaturan operasional.
 *
 * Membuat/mengubah aturan TIDAK memposting apa pun dan tidak menyentuh dokumen
 * yang sudah ada — aturan baru hanya berlaku untuk dokumen yang dibuat setelah
 * itu. Dokumen lama yang sudah terlanjur diposting tetap terposting.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { approvalRuleSchema } from "@/lib/validations/approval";
import { listApprovalRules } from "@/lib/approval-queue";

export async function GET(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  return NextResponse.json(await listApprovalRules({ includeInactive }));
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const parsed = approvalRuleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { documentType, minAmount, approverRole, note } = parsed.data;

  // Two active rules with the same jenis + ambang would be a coin flip for the
  // approver role (the matcher breaks the tie by id, deterministically, but the
  // Manager would not know which one won). Refuse it out loud instead.
  const duplicate = await prisma.approvalRule.findFirst({
    where: { documentType, minAmount, isActive: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Sudah ada aturan aktif dengan jenis dokumen dan ambang yang sama." },
      { status: 400 }
    );
  }

  const rule = await prisma.approvalRule.create({
    data: { documentType, minAmount, approverRole, note: note ?? null },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "approval.rule.create",
    entity: "approval_rule",
    entityId: rule.id,
    details: {
      documentType,
      minAmount: Number(rule.minAmount),
      approverRole,
    },
    request,
  });

  return NextResponse.json(rule, { status: 201 });
}
