/**
 * Halaman RINGKASAN paket laporan (09 §5) — lembar pertama di ZIP paket.
 *
 * Isinya yang dibutuhkan orang yang membuka berkas tanpa konteks (auditor,
 * pemilik yang menerima lampiran): PT, periode, kapan & oleh siapa dibuat,
 * format, daftar laporan yang disertakan beserta nama berkasnya, dan laporan
 * yang TIDAK disertakan beserta alasannya. Bahasa Indonesia, seperti setiap
 * kertas cetak lain (#278); kalimatnya dari `PACKAGE_SUMMARY_TEXT` — sumber
 * yang sama dengan lembar Ringkasan buku kerja Go.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { PRINT_BRAND } from "@/lib/pdf/brand";
import { drawCompanyLogo, type PdfCompany } from "./company-header";
import { PACKAGE_SUMMARY_TEXT } from "@/lib/report-package-text";

export interface ReportPackageCover {
  periodLabel: string;
  /** "Dibuat: 1/2/2026, 09.00.00" — sudah diformat. */
  generatedLine: string;
  requestedByLine: string;
  formatsLine: string;
  included: { title: string; entry: string | null }[];
  excluded: { title: string; reason: string }[];
}

export function generateReportPackageCoverPDF(cover: ReportPackageCover, company: PdfCompany): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.name, pageWidth / 2, y, { align: "center" });
  drawCompanyLogo(doc, company, y);
  y += 7;
  doc.setFontSize(12);
  doc.text(PACKAGE_SUMMARY_TEXT.title, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  for (const line of [cover.periodLabel, cover.generatedLine, cover.requestedByLine, cover.formatsLine]) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 5;
  }
  y += 4;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(PACKAGE_SUMMARY_TEXT.includedHeading, 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [[PACKAGE_SUMMARY_TEXT.numberHeader, PACKAGE_SUMMARY_TEXT.reportHeader, "Berkas"]],
    body: cover.included.map((r, i) => [String(i + 1), r.title, r.entry ?? "—"]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: PRINT_BRAND },
    columnStyles: { 0: { cellWidth: 12 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(PACKAGE_SUMMARY_TEXT.excludedHeading, 14, y);
  y += 2;
  if (cover.excluded.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(PACKAGE_SUMMARY_TEXT.nothingExcluded, 14, y + 5);
  } else {
    autoTable(doc, {
      startY: y,
      head: [[PACKAGE_SUMMARY_TEXT.numberHeader, PACKAGE_SUMMARY_TEXT.reportHeader, PACKAGE_SUMMARY_TEXT.reasonHeader]],
      body: cover.excluded.map((r, i) => [String(i + 1), r.title, r.reason]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [100, 116, 139] },
      columnStyles: { 0: { cellWidth: 12 } },
    });
  }
  return doc;
}
