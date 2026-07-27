import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journalSchema } from "@/lib/validations/journal";
import { postJournal, UnbalancedJournalError } from "@/lib/ledger";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET() {
  const result = await requireApiPermission("journal.read");
  if (!result.authorized) return result.response;

  const journals = await prisma.journal.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { lines: true },
    take: 100,
  });
  return NextResponse.json(journals);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("journal.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = journalSchema.safeParse(body);

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

  try {
    const journal = await postJournal({
      date: parsed.data.date,
      type: "general",
      note: parsed.data.note ?? null,
      // issue #91 — pusat biaya bawaan kepala jurnal; `prepareLines` yang
      // menurunkannya ke baris yang tidak memilih sendiri.
      costCenterId: parsed.data.costCenterId ?? null,
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
