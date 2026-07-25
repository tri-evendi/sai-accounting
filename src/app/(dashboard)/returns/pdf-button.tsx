"use client";

import type { ReturnPdfData } from "@/lib/pdf/return-pdf";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";

/**
 * Nota retur (issue #27) — kini Pratinjau + Unduh + Cetak lewat komponen dokumen
 * bersama. jsPDF di-load malas; datanya sudah ada di baris tabel.
 */
export function ReturnPdfButton({ data }: { data: ReturnPdfData }) {
  return (
    <PdfDocumentButton
      label="PDF"
      title={`Nota Retur ${data.returnNo}`}
      filename={`${data.returnNo}.pdf`}
      generate={async () => {
        const { generateReturnPDF } = await import("@/lib/pdf/return-pdf");
        return generateReturnPDF(data);
      }}
    />
  );
}
