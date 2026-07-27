import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { periodLabel } from "@/lib/period";
import { reopenPeriod } from "@/lib/period-close";
import { periodReopenSchema } from "@/lib/validations/period";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * Unlock a closed month.
 *
 * This is the one action in the app that can change already-reported figures,
 * so it is Manager-only, demands a written reason, and is recorded in the audit
 * log together with who had closed the period and when.
 */
export async function POST(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = periodReopenSchema.safeParse(body);
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

  const { year, month, reason } = parsed.data;
  const label = periodLabel(year, month);

  const existing = await prisma.period.findUnique({
    where: { year_month: { year, month } },
    include: { closedBy: { select: { name: true, username: true } } },
  });

  if (!existing || existing.status !== "closed") {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.periodNotClosed", { period: label }), code: "period_not_closed" },
      { status: 409 }
    );
  }

  const period = await reopenPeriod({ year, month, reason });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "period.reopen",
    entity: "period",
    entityId: period.id,
    details: {
      year,
      month,
      label,
      reason,
      // Preserve the lock we just removed — after the update these are cleared.
      previouslyClosedAt: existing.closedAt?.toISOString() ?? null,
      previouslyClosedBy: existing.closedBy?.name ?? existing.closedBy?.username ?? null,
    },
    request,
  });

  return NextResponse.json(period);
}
