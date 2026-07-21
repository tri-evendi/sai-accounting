/**
 * Antrean persetujuan — list (issue #25).
 *
 * `?scope=inbox` (default) = what THIS user's role still has to decide.
 * `?scope=mine`            = what this user raised, decided or not.
 *
 * Any authenticated user may call it: an approver sees an inbox, a staff member
 * sees their own submissions (that list IS the in-app notification). Nobody can
 * see another person's queue, because both slices are derived from the session
 * rather than from a parameter.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { approvalListQuerySchema } from "@/lib/validations/approval";
import { listMyApprovalRequests, listPendingApprovals } from "@/lib/approval-queue";

export async function GET(request: Request) {
  const result = await requireAuth();
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const parsed = approvalListQuerySchema.safeParse({
    scope: searchParams.get("scope") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    documentType: searchParams.get("documentType") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { scope, status, documentType } = parsed.data;
  const rows =
    scope === "mine"
      ? await listMyApprovalRequests(parseInt(result.session.user.id, 10))
      : await listPendingApprovals(result.session.user.role);

  // Both filters are optional refinements over an already-narrow list; applying
  // them here keeps the two queue queries above indexed and identical.
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) && (!documentType || r.documentType === documentType)
  );

  return NextResponse.json(filtered);
}
