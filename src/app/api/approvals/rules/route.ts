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
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { approvalRuleSchema } from "@/lib/validations/approval";
import { listApprovalRules } from "@/lib/approval-queue";
import { activeRoleKeys } from "@/lib/roles";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(request: Request) {
  const result = await requireApiPermission("approval_rule.manage");
  if (!result.authorized) return result.response;

  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  return NextResponse.json(await listApprovalRules({ includeInactive }));
}

export async function POST(request: Request) {
  const result = await requireApiPermission("approval_rule.manage");
  if (!result.authorized) return result.response;

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
  const { documentType, minAmount, approverRole, note } = parsed.data;

  // Peran harus ada & aktif (peran dinamis) — validasi ke DB, pola /api/users.
  if (!(await activeRoleKeys()).includes(approverRole)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.roleUnknownOrInactive") }, { status: 400 });
  }

  // Two active rules with the same jenis + ambang would be a coin flip for the
  // approver role (the matcher breaks the tie by id, deterministically, but the
  // Manager would not know which one won). Refuse it out loud instead.
  const duplicate = await prisma.approvalRule.findFirst({
    where: { documentType, minAmount, isActive: true },
  });
  if (duplicate) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.approvalRuleDuplicate") },
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
