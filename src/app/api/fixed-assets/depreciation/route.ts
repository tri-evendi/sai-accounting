/**
 * Penyusutan periodik — run depreciation for one month (issue #28).
 *
 * Posts D: Beban Penyusutan / K: Akumulasi Penyusutan for every active asset that
 * has not yet been depreciated that period. Idempotent: re-running a period that
 * is already posted adds nothing (the (asset, year, month) unique row + the
 * live-journal guard both prevent it). A CLOSED period is refused via the period
 * lock, surfaced here as a 422 with the not-saved notice.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { depreciationRunSchema } from "@/lib/validations/fixed-asset";
import { runDepreciation } from "@/lib/fixed-assets";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const parsed = depreciationRunSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const summary = await runDepreciation(parsed.data.year, parsed.data.month);

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "fixed_asset.depreciate",
      entity: "fixed_asset",
      details: {
        year: summary.year,
        month: summary.month,
        postedCount: summary.postedCount,
        totalAmount: summary.totalAmount,
      },
      request,
    });

    return NextResponse.json(summary);
  } catch (e) {
    return handlePostingError(e);
  }
}
