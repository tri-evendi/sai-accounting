import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { closePeriod, getPeriodSummary, listPeriods } from "@/lib/period-close";
import { periodCloseSchema } from "@/lib/validations/period";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/** Months the Manager can act on, newest first. */
export async function GET() {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  return NextResponse.json(await listPeriods());
}

/** Close a month. Refuses if a fresh summary still reports a blocker. */
export async function POST(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = periodCloseSchema.safeParse(body);
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

  const { year, month, note } = parsed.data;

  // Re-run the checks server-side rather than trusting the page: the summary the
  // Manager read may be minutes old, and a new unbalanced journal could have
  // landed since.
  const summary = await getPeriodSummary(year, month);

  if (summary.status === "closed") {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("errors.periodAlreadyClosed", { period: summary.label }),
        code: "period_already_closed",
      },
      { status: 409 }
    );
  }

  if (!summary.canClose) {
    return NextResponse.json(
      {
        error:
          `Periode ${summary.label} belum bisa ditutup karena masih ada ` +
          `${summary.blockerCount} masalah yang harus diperbaiki lebih dulu.`,
        code: "period_close_blocked",
        checks: summary.checks.filter((c) => c.status === "blocker"),
      },
      { status: 422 }
    );
  }

  const period = await closePeriod({
    year,
    month,
    userId: parseInt(result.session.user.id),
    note: note ?? null,
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "period.close",
    entity: "period",
    entityId: period.id,
    details: {
      year,
      month,
      label: summary.label,
      note: note ?? null,
      journalCount: summary.journalCount,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      // Warnings were visible and accepted — worth keeping with the decision.
      warnings: summary.checks.filter((c) => c.status === "warning").map((c) => c.detail),
    },
    request,
  });

  return NextResponse.json(period, { status: 201 });
}
