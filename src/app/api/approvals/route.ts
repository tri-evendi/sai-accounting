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
import { requireApiPermission } from "@/lib/auth-guard";
import { approvalListQuerySchema } from "@/lib/validations/approval";
import { listMyApprovalRequests, listPendingApprovals } from "@/lib/approval-queue";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET(request: Request) {
  const result = await requireApiPermission("approval.view");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const parsed = approvalListQuerySchema.safeParse({
    scope: searchParams.get("scope") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    documentType: searchParams.get("documentType") ?? undefined,
  });
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

  const { scope, status, documentType } = parsed.data;
  // `mine`-scope filters go INTO the query: the list is truncated to the
  // newest 50, and filtering a truncated list returns "matches within the
  // newest 50", not "the newest 50 matches". The inbox is the complete
  // pending set, so its `documentType` refinement here is exact — and a
  // `status` filter on it is meaningful only for the value it is pinned to.
  const rows =
    scope === "mine"
      ? await listMyApprovalRequests(parseInt(result.session.user.id, 10), 50, {
          status,
          documentType,
        })
      : await listPendingApprovals(result.session.user.role);

  const filtered =
    scope === "inbox"
      ? rows.filter(
          (r) =>
            (!status || r.status === status) &&
            (!documentType || r.documentType === documentType)
        )
      : rows;

  return NextResponse.json(filtered);
}
