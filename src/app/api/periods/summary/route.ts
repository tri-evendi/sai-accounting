import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getPeriodSummary } from "@/lib/period-close";
import { periodQuerySchema } from "@/lib/validations/period";

/** Pre-close inspection for one month: GET /api/periods/summary?year=2026&month=3 */
export async function GET(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const parsed = periodQuerySchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  return NextResponse.json(await getPeriodSummary(parsed.data.year, parsed.data.month));
}
