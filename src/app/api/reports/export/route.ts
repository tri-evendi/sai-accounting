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
 *
 * ── DUA BATAS, dan keduanya di jalur masuk (rancangan §9, tahap 1a) ──────────
 *
 * Rute ini satu-satunya tempat di aplikasi yang merakit lembar sebar dari
 * muatan yang datang dari LUAR. Sampai tahap 1c memindahkannya ke antrean (§5),
 * batasnya harus berdiri di sini:
 *
 * 1. BYTE, sebelum diurai. `await request.json()` sudah mematerialkan dan
 *    mengurai seluruh badan, jadi skema zod paling ketat pun tidak melindungi
 *    apa pun dari badan 500 MB — lihat `@/lib/request-body`.
 * 2. BARIS, dihitung pada `SheetModel` yang SUDAH dipetakan, bukan pada
 *    muatannya. Muatan tiap laporan berbeda bentuk (`rows`, seksi bersarang,
 *    grup arus kas), jadi penghitung per-jenis adalah penghitung yang akan
 *    melewatkan laporan berikutnya; `sheet.rows` dilewati semuanya, hari ini
 *    dan sesudah laporan kedua belas ditambahkan.
 *
 * Keduanya menjawab 413 — "muatannya memang begitu besar", bukan 400 yang
 * menuduh peramban salah bentuk.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { readBoundedText } from "@/lib/request-body";
import { EXPORT_MAX_BODY_BYTES, EXPORT_MAX_ROWS } from "@sai/core/export-limits";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import { getCompanyIdentity } from "@/lib/company-identity";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
// Nama dokumennya datang dari penentu bentuk laporan, bukan dari modul PDF
// (#323) — rute ini dulu menarik seluruh jsPDF ke graf modulnya hanya untuk
// membaca satu judul; `statement-layout.ts` tidak mengimpor apa pun.
import { STATEMENT_TITLES } from "@/lib/statement-layout";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";

export async function POST(request: Request) {
  const authz = await requireApiPermission("report.export");
  if (!authz.authorized) return authz.response;

  const mentah = await readBoundedText(request, EXPORT_MAX_BODY_BYTES);
  if (!mentah.ok) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("reports.exportPayloadTooLarge") }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(mentah.text);
  } catch {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = statementPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat @sai/core/i18n/validation).
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

  // Lock-step with the PDF payload: if the two shapes ever diverge this fails to
  // compile, rather than silently exporting a different structure.
  const payload: StatementPayload = parsed.data;

  const sheet = buildReportSheet(payload);
  if (sheet.rows.length > EXPORT_MAX_ROWS) {
    const { t, locale } = await getRequestI18n();
    const angka = new Intl.NumberFormat(locale);
    return NextResponse.json(
      {
        error: t("reports.exportTooLarge", {
          rows: angka.format(sheet.rows.length),
          max: angka.format(EXPORT_MAX_ROWS),
        }),
      },
      { status: 413 }
    );
  }
  const buffer = await buildWorkbookBuffer([sheet], await getCompanyIdentity());

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
