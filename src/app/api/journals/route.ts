import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journalSchema } from "@/lib/validations/journal";
import { postJournal, UnbalancedJournalError } from "@/lib/ledger";
import { requireAuth } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";

export async function GET() {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const journals = await prisma.journal.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { lines: true },
    take: 100,
  });
  return NextResponse.json(journals);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = journalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const journal = await postJournal({
      date: parsed.data.date,
      type: "general",
      note: parsed.data.note ?? null,
      lines: parsed.data.lines,
    });
    return NextResponse.json(journal, { status: 201 });
  } catch (e) {
    // An imbalance in a hand-typed journal IS knowable from the payload, so it
    // stays a 400 here. A closed period is not — it is server state — so it
    // falls through to the shared 422 mapping.
    if (e instanceof UnbalancedJournalError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handlePostingError(e);
  }
}
