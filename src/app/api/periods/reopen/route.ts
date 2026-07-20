import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { periodLabel } from "@/lib/period";
import { reopenPeriod } from "@/lib/period-close";
import { periodReopenSchema } from "@/lib/validations/period";

/**
 * Unlock a closed month.
 *
 * This is the one action in the app that can change already-reported figures,
 * so it is Manager-only, demands a written reason, and is recorded in the audit
 * log together with who had closed the period and when.
 */
export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = periodReopenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
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
    return NextResponse.json(
      { error: `Periode ${label} tidak sedang ditutup.`, code: "period_not_closed" },
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
