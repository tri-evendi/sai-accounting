/**
 * PAKET LAPORAN — `POST /api/reports/package` (09 §5, keputusan pemilik
 * 24 Okt 2026). Menerbitkan pekerjaan, TIDAK merakit apa pun di permintaan ini.
 *
 * Badan: `{ period: { kind, year?, month?, quarter?, from?, to? }, reports: [id…],
 * formats: ["pdf" | "xlsx"…] }` (`reportPackageRequestSchema`, `.strict()`).
 *
 * Jawaban:
 *   • 202 `{ queued, jobId, kind: "report.package", reused, included, excluded }` —
 *     layar menunggu di rute hasil bertenant (409 `job_not_done` + `progress`
 *     sampai berkasnya ada), pintu yang sama dengan ekspor lain;
 *   • 400 badan/periode/laporan tidak sah; 403 bila TIDAK ADA satu laporan pun
 *     yang boleh disertakan (berkas berisi ringkasan saja bukan paket).
 *
 * Gerbang pertama `report.read` — izin Pusat Laporan, tempat paket diminta.
 * Izin tiap laporan (dan modulnya) diputuskan `planReportPackage` di PT aktif
 * penjaga; laporan yang tidak lolos dikecualikan dan disebut di ringkasan.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { readBoundedText } from "@/lib/request-body";
import { reportPackageRequestSchema, resolvePackagePeriod } from "@/lib/report-package";
import { planReportPackage, publishReportPackage } from "@/lib/report-package-job";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";

/** Badan paket hanya beberapa id + periode — 16 KB jauh di atasnya. */
const MAX_BODY_BYTES = 16 * 1024;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authz = await requireApiPermission("report.read");
  if (!authz.authorized) return authz.response;

  const { t, dictionary } = await getRequestI18n();
  const mentah = await readBoundedText(request, MAX_BODY_BYTES);
  if (!mentah.ok) return NextResponse.json({ error: t("validation.invalidInput") }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(mentah.text);
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }
  const parsed = reportPackageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const period = resolvePackagePeriod(parsed.data.period);
  if (!period) {
    return NextResponse.json({ error: t("reports.package.invalidPeriod"), code: "invalid_period" }, { status: 400 });
  }

  const user = authz.session.user;
  const peminta = { id: String(user.id), role: String(user.role), email: user.email ?? null, name: user.name ?? null };
  const { plan, unknown } = await planReportPackage(peminta, parsed.data.reports);
  if (unknown.length > 0) {
    return NextResponse.json({ error: t("reports.package.unknownReport"), code: "unknown_report", reports: unknown }, { status: 400 });
  }

  const hasil = await publishReportPackage({
    companyId: authz.companyId,
    user: peminta,
    period,
    formats: parsed.data.formats,
    plan,
    request,
  });
  if (!hasil.ok) {
    if (hasil.reason === "nothing_permitted") {
      return NextResponse.json({ error: t("reports.package.nothingPermitted"), code: "nothing_permitted" }, { status: 403 });
    }
    return NextResponse.json({ error: t("reports.package.failed") }, { status: 503 });
  }

  return NextResponse.json(
    {
      queued: true,
      jobId: hasil.jobId,
      kind: "report.package",
      reused: hasil.reused,
      included: hasil.included,
      excluded: hasil.excluded,
      from: period.fromISO,
      to: period.toISO,
    },
    { status: 202 }
  );
}
