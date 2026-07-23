/**
 * Excel (.xlsx) export for the financial statements (issue #19).
 *
 * READ-ONLY. This route posts nothing to the ledger — it receives the already-
 * computed `StatementPayload` the report page rendered (the same object its PDF
 * button uses), validates it, maps it to a sheet model with the pure
 * `@/lib/report-export`, and streams the workbook back. Because the figures come
 * from the page's payload — not a fresh query — the spreadsheet can never
 * disagree with what the user was looking at. bos-only, like the reports.
 *
 * The workbook is built server-side (ExcelJS is a Node library); the browser only
 * downloads the resulting bytes.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { STATEMENT_TITLES, type StatementPayload } from "@/lib/pdf/statement-pdf";

export async function POST(request: Request) {
  const authz = await requireApiPermission("report.export");
  if (!authz.authorized) return authz.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON yang valid." }, { status: 400 });
  }

  const parsed = statementPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload laporan tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Lock-step with the PDF payload: if the two shapes ever diverge this fails to
  // compile, rather than silently exporting a different structure.
  const payload: StatementPayload = parsed.data;

  const sheet = buildReportSheet(payload);
  const buffer = await buildWorkbookBuffer([sheet]);

  const slug = STATEMENT_TITLES[payload.kind].replace(/[^A-Za-z0-9]+/g, "_");
  const filename = `${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
