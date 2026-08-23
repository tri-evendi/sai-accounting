/**
 * Impor baris rekening koran (issue #24; pemetaan judulnya dibangun ulang di #468).
 *
 * Menerima `{ csv: string }`. Semua-atau-tidak-sama-sekali: satu baris rusak
 * membatalkan seluruh impor dengan daftar masalah bernomor baris, dan tidak
 * satu baris pun tertulis. Ditolak selama laporannya terkunci.
 *
 * ══ SERVER TETAP OTORITASNYA, MESKI LAYARNYA SUDAH MEM-PARSE DULU ═══════════
 * Sejak #468 layar pratinjau menjalankan parser yang SAMA di browser supaya
 * penggunanya bisa melihat hasil bacanya sebelum menekan impor. Route ini
 * TIDAK mempercayai hasil itu: ia mem-parse ulang berkas mentahnya sendiri.
 * Yang dikirim klien tetap CSV apa adanya, bukan baris yang sudah jadi —
 * kalau tidak, siapa pun bisa menulis mutasi karangan ke buku dengan satu
 * permintaan HTTP.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { assertStatementUnlocked, ReconciliationLockedError } from "@/lib/reconciliation";
import { parseStatementCsv } from "@/lib/import/bank-statement";
import { getRequestI18n } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionary";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("reconciliation.write");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const body = await request.json();
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.csvEmpty") }, { status: 400 });
  }

  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.reconciliationNotFound") }, { status: 404 });
  }
  try {
    assertStatementUnlocked(statement);
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const parsed = parseStatementCsv(csv);
  if (!parsed.ok) {
    const { t, dictionary } = await getRequestI18n();
    /* Masalahnya dipulangkan parser sebagai KUNCI + parameter, dan diterjemahkan
       di sini — bukan kalimat Indonesia yang dipaku di dalam parser dan tetap
       Indonesia bagi pembaca en/zh (keadaan sebelum #468). */
    const rowErrors = parsed.issues.map((issue) => {
      const message = translate(dictionary, issue.key, issue.params);
      return issue.row === undefined
        ? message
        : `${t("statementImport.rowPrefix", { row: issue.row })}: ${message}`;
    });
    return NextResponse.json({ error: t("errors.csvInvalidRows"), rowErrors }, { status: 400 });
  }

  await prisma.bankStatementLine.createMany({
    data: parsed.rows.map((r) => ({
      statementId: id,
      date: new Date(r.date),
      description: r.description,
      amount: r.amount,
    })),
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.import",
    entity: "bank_statement",
    entityId: id,
    details: { imported: parsed.rows.length },
    request,
  });

  return NextResponse.json({ imported: parsed.rows.length }, { status: 201 });
}
