/**
 * Bagian PDF paket laporan — pekerjaan `report.package_pdf`, dikerjakan peran
 * `interactive` Node (`workers/interactive.ts`).
 *
 * ══ TIDAK ADA ARITMETIKA LAPORAN DI SINI ═══════════════════════════════════
 * Setiap PDF = `buildReportPayload` (pembangun muatan yang SAMA dengan
 * `/api/reports/payload`, yaitu tombol PDF dialog Pusat Laporan) +
 * `generateStatementPDF` (generator jsPDF yang SAMA dengan `/api/reports/pdf/
 * statement`). Parameternya yang SUDAH diselesaikan penerbit
 * (`goExportPayloadShape(...).params`) — tanggal yang sama dengan yang dihitung
 * Go untuk lembar sebar paket yang sama.
 *
 * ══ MEMORI: SATU PDF PADA SATU WAKTU ═══════════════════════════════════════
 * Laporan digambar BERURUTAN; tiap PDF dikompresi dan ditulis ke ZIP antara
 * (`ZipStreamWriter` → `writeJobResultStream`) sebelum laporan berikutnya
 * dihitung, jadi buffer sebelumnya bisa dibuang pengumpul sampah. Tidak ada
 * daftar semua PDF di memori.
 *
 * Konteks perusahaan dipasang PEMANGGILNYA (`dalamKonteksPerusahaan`).
 */
import "server-only";

import type { Writable } from "node:stream";

import { isExportable, reportById } from "@/lib/report-catalog";
import { buildReportPayload } from "@/lib/report-payload";
import { serverPdfCompany } from "@/lib/pdf-company";
import { generateStatementPDF } from "@/lib/pdf/statement-pdf";
import { generateReportPackageCoverPDF } from "@/lib/pdf/report-package-cover-pdf";
import { ZipStreamWriter } from "@/lib/zip-stream";
import { PACKAGE_COVER_ENTRY, formatsLine, type ReportPackagePdfPayload } from "@/lib/report-package";
import { PACKAGE_FORMATS, type PackageFormat } from "@/lib/report-package-text";

/** Nama berkas ZIP antara — dibaca pelari `report.package` lewat `result_ref`. */
export const PACKAGE_PDF_PART_FILENAME = "pdf.zip";

const ENTRI = /^PDF\/\d{2}_[A-Za-z0-9_]+\.pdf$/;

/** Muatan dari basis data kendali diperiksa ulang, tidak dipercaya. */
export function parsePackagePdfPayload(raw: unknown): ReportPackagePdfPayload {
  const p = (raw ?? {}) as Partial<ReportPackagePdfPayload>;
  if (!Array.isArray(p.reports) || p.reports.length === 0) {
    throw new Error("muatan `report.package_pdf` tanpa laporan");
  }
  if (!Array.isArray(p.formats) || p.formats.length === 0 || !p.formats.every((f) => (PACKAGE_FORMATS as readonly string[]).includes(f))) {
    throw new Error("muatan `report.package_pdf` dengan format tak dikenal");
  }
  for (const r of p.reports) {
    const report = reportById(String(r?.reportId ?? ""));
    if (!report || !isExportable(report)) throw new Error(`laporan \`${String(r?.reportId)}\` tidak dapat dicetak`);
    if (typeof r.entry !== "string" || !ENTRI.test(r.entry)) throw new Error(`nama entri tidak sah: ${String(r.entry)}`);
    if (typeof r.params !== "object" || r.params === null) throw new Error(`parameter \`${report.id}\` hilang`);
  }
  if (typeof p.periodLabel !== "string" || typeof p.requestedAt !== "string") {
    throw new Error("muatan `report.package_pdf` tanpa label periode / waktu permintaan");
  }
  return p as ReportPackagePdfPayload;
}

export interface OpsiBagianPdf {
  /** Pembungkus pembacaan buku — pekerja menyerahkan `runReadOnly`. */
  bacaBuku?: <T>(fn: () => Promise<T>) => Promise<T>;
  progress?: (persen: number) => Promise<void>;
  cancelled?: () => boolean;
  now?: Date;
}

/**
 * Tulis ZIP antara ke `out`: ringkasan lebih dulu, lalu PDF tiap laporan
 * (bila format "pdf" diminta). Memulangkan nama entri yang ditulis.
 */
export async function writeReportPackagePdfPart(
  raw: unknown,
  out: Writable,
  opsi: OpsiBagianPdf = {}
): Promise<string[]> {
  const payload = parsePackagePdfPayload(raw);
  const bacaBuku = opsi.bacaBuku ?? ((fn) => fn());
  const now = opsi.now ?? new Date();
  const withPdf = payload.formats.includes("pdf" as PackageFormat);
  const company = await serverPdfCompany("jobs/report.package_pdf");

  const zip = new ZipStreamWriter(out, now);
  const cover = generateReportPackageCoverPDF(
    {
      periodLabel: payload.periodLabel,
      generatedLine: `Dibuat: ${new Date(payload.requestedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
      requestedByLine: `Diminta oleh: ${payload.requestedByName}`,
      formatsLine: formatsLine(payload.formats),
      included: payload.reports.map((r) => ({ title: r.title, entry: withPdf ? r.entry : null })),
      excluded: payload.excluded ?? [],
    },
    company
  );
  await zip.addFile(PACKAGE_COVER_ENTRY, new Uint8Array(cover.output("arraybuffer") as ArrayBuffer));

  if (withPdf) {
    for (const [i, r] of payload.reports.entries()) {
      if (opsi.cancelled?.()) throw new Error("dibatalkan");
      const report = reportById(r.reportId);
      if (!report || !isExportable(report)) throw new Error(`laporan \`${r.reportId}\` tidak dapat dicetak`);
      const muatan = await bacaBuku(() => buildReportPayload(report, r.params));
      const doc = generateStatementPDF(muatan, company);
      await zip.addFile(r.entry, new Uint8Array(doc.output("arraybuffer") as ArrayBuffer));
      await opsi.progress?.(10 + Math.round((80 * (i + 1)) / payload.reports.length));
    }
  }
  await zip.finish();
  return zip.names();
}
