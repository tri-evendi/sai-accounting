"use client";

import type { ReturnPdfData } from "@/lib/pdf/return-pdf";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@/lib/i18n/client";
import { useCompanyIdentity } from "@/lib/company-identity-client";

/**
 * Nota retur (issue #27) — kini Pratinjau + Unduh + Cetak lewat komponen dokumen
 * bersama. jsPDF di-load malas; datanya sudah ada di baris tabel.
 */
export function ReturnPdfButton({ data }: { data: ReturnPdfData }) {
  const company = useCompanyIdentity();
  const t = useT();
  return (
    <PdfDocumentButton
      label="PDF"
      title={t("returns.notaTitle", { no: data.returnNo })}
      filename={`${data.returnNo}.pdf`}
      generate={async () => {
        const { generateReturnPDF } = await import("@/lib/pdf/return-pdf");
        return generateReturnPDF(data, company);
      }}
    />
  );
}
