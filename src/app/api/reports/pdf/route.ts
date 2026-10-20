/**
 * Laporan keuangan menjadi PDF — DI SERVER (rancangan §5).
 *
 * READ-ONLY. Ia menerima `StatementPayload` yang SAMA yang sudah dipakai
 * tombol Excel (`/api/reports/export`), menjalankan `generateStatementPDF`
 * yang SAMA yang dulu dijalankan peramban, dan men-stream byte-nya.
 *
 * ══ KENAPA PINDAH KE SERVER, DAN APA YANG DIBELINYA ════════════════════════
 * Sampai tahap ini sebelas modul `src/lib/pdf/` berjalan di PERAMBAN. Tiga hal
 * yang dibuka pemindahan ini, dan ketiganya mustahil dari peramban (§5):
 * server bisa MENYIMPAN byte yang persis sama dengan yang dikirim ke customer
 * (syarat audit), paket laporan bisa terbit sendiri tanpa ada yang membuka
 * halaman, dan dokumen tidak lagi bergantung pada perangkat pengguna.
 *
 * ⚠ **Ini TIDAK menuntut Go**, dan itu keputusan yang ditulis §5 sebelum satu
 * baris Go ada di repo ini: `invoice-send.ts` sudah menjalankan jsPDF di Node
 * sejak #465. Menulis ulang generatornya di Go akan memutus satu-satunya hal
 * yang membuat pemindahan ini murah — bahwa tata letaknya hanya punya SATU
 * implementasi.
 *
 * ══ ONGKOSNYA CPU YANG HARI INI GRATIS ════════════════════════════════════
 * Perakitan PDF laporan tadinya berjalan di mesin pengguna: satu peramban per
 * pengguna, paralel sempurna, nol beban server. Memindahkannya memindahkan
 * beban itu ke mesin 3,6 GB yang dibagi enam aplikasi.
 *
 * Rute ini SINKRON, dan itu sah untuk laporan yang sudah tampil di layar —
 * muatannya sudah dihitung halaman yang memintanya, jadi yang tersisa hanya
 * menggambar. Yang WAJIB lewat antrean adalah paket laporan dan periode
 * panjang (§5): kalau sebelas pengguna menekan "cetak laporan tahunan"
 * bersamaan, antrean yang menahannya — bukan event loop.
 *
 * Yang menahan rute ini sementara itu batas yang SAMA dengan ekspor Excel:
 * byte badan sebelum diurai, lalu jumlah baris pada muatan yang sudah
 * divalidasi. Keduanya 413.
 *
 * ══ BYTE-NYA DIHASILKAN SEKALI ════════════════════════════════════════════
 * `output("arraybuffer")` dipanggil TEPAT sekali, dan buffer itulah yang
 * dipulangkan. Itu bukan penghematan: syarat audit §5 adalah "yang disimpan
 * sama dengan yang dikirim", dan satu-satunya cara itu dijamin adalah satu
 * buffer untuk kedua tujuan — bukan dua pembangkitan yang kebetulan sama.
 *
 * Diukur di sesi ini: dua INSTANCE jsPDF atas muatan yang sama berbeda pada
 * `/ID` di trailer (pengenal berkas acak, 60 byte) dan — bila jamnya berjalan —
 * `/CreationDate`. Isinya identik. Jadi "byte identik" adalah sifat SATU
 * pembangkitan, bukan sifat yang bisa diandalkan dari dua.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { readBoundedText } from "@/lib/request-body";
import { EXPORT_MAX_BODY_BYTES, EXPORT_MAX_ROWS } from "@sai/core/export-limits";
import { statementPayloadSchema } from "@/lib/validations/report-export";
import { buildReportSheet } from "@/lib/report-export";
import { serverPdfCompany } from "@/lib/pdf-company";
import { STATEMENT_TITLES } from "@/lib/statement-layout";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { translateFieldErrors } from "@sai/core/i18n/validation";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const payload: StatementPayload = parsed.data;

  /*
   * Batas BARIS dihitung pada `SheetModel` yang sudah dipetakan — sama persis
   * dengan ekspor Excel, dan sengaja memakai pemeta yang SAMA alih-alih
   * menghitung baris PDF-nya sendiri. Muatan tiap laporan berbeda bentuk
   * (`rows`, seksi bersarang, grup arus kas), jadi penghitung per-jenis adalah
   * penghitung yang akan melewatkan laporan berikutnya.
   */
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

  /* Impor DINAMIS: jsPDF hanya dibutuhkan pada permintaan yang benar-benar
     mencetak, dan graf modul rute ini tidak perlu memuatnya saat boot.
     Pola yang sama dengan `invoice-send.ts`. */
  const { generateStatementPDF } = await import("@/lib/pdf/statement-pdf");
  const company = await serverPdfCompany("reports/pdf");

  const doc = generateStatementPDF(payload, company);
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);

  const slug = STATEMENT_TITLES[payload.kind].replace(/[^A-Za-z0-9]+/g, "_");
  const filename = `${slug}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      /* `inline`: pemanggilnya menampilkannya di pratinjau lebih dulu, dan
         unduhannya dibuat dari Blob yang SAMA di sisi klien — bukan dari
         permintaan kedua yang akan menghasilkan `/ID` yang berbeda. */
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
