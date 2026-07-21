"use client";

import { Download } from "lucide-react";
import { generateReturnPDF, type ReturnPdfData } from "@/lib/pdf/return-pdf";

/**
 * Nota retur download (issue #27). Client-only because jsPDF runs in the browser;
 * the row's data is already on the page, so no extra fetch is needed.
 */
export function ReturnPdfButton({ data }: { data: ReturnPdfData }) {
  return (
    <button
      type="button"
      onClick={() => generateReturnPDF(data).save(`${data.returnNo}.pdf`)}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
      aria-label={`Unduh nota retur ${data.returnNo}`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      PDF
    </button>
  );
}
