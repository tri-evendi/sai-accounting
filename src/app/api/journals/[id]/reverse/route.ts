import { NextResponse } from "next/server";
import { reverseJournal } from "@/lib/ledger";
import { requireApiPermission } from "@/lib/auth-guard";
import { postingErrorResponse } from "@/lib/api-errors";
import { getRequestI18n } from "@/lib/i18n/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("journal.write");
  if (!result.authorized) return result.response;

  const { id } = await params;

  try {
    const reversal = await reverseJournal(parseInt(id));
    return NextResponse.json(reversal, { status: 201 });
  } catch (e) {
    // Reversing a journal that sits in a closed month is a period violation, not
    // a bad request — give it the shared 422 body so the client sees the code.
    const posting = postingErrorResponse(e);
    if (posting) return posting;

    // `e.message` adalah prosa dari `lib/ledger` (fase C); yang diterjemahkan di
    // sini adalah cadangan untuk lemparan yang bukan `Error`.
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : t("errors.journalReverseFailed") },
      { status: 400 }
    );
  }
}
