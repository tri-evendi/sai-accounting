"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { useToast } from "@/components/ui/toast";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@/lib/i18n/client";
import { useCompanyIdentity } from "@/lib/company-identity-client";

interface ContractPDFData {
  contractNo: string;
  date: string;
  buyer: string;
  consignee: string | null;
  packaging: string | null;
  shipment: string | null;
  top1: string | null;
  top2: string | null;
  currency: string;
  status: string;
  items: { itemName: string; bags: number; kgPerBag: number; pricePerKg: number }[];
  payments: { date: string; amount: number; currency: string; note: string | null }[];
}

export function ContractPDFButton({ contract }: { contract: ContractPDFData }) {
  const company = useCompanyIdentity();
  return (
    <PdfDocumentButton
      title={`Kontrak ${contract.contractNo}`}
      filename={`Contract_${contract.contractNo}.pdf`}
      generate={async () => {
        const { generateContractPDF } = await import("@/lib/pdf/contract-pdf");
        return generateContractPDF(contract, company);
      }}
    />
  );
}

export function ShippingDocButton({ contract }: { contract: ContractPDFData }) {
  const company = useCompanyIdentity();
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("nav.items.deliveryOrders")}
      title={`Surat Jalan ${contract.contractNo}`}
      filename={`SuratJalan_${contract.contractNo}.pdf`}
      generate={async () => {
        const { generateShippingPDF } = await import("@/lib/pdf/shipping-pdf");
        return generateShippingPDF({
          contractNo: contract.contractNo,
          date: contract.date,
          buyer: contract.buyer,
          consignee: contract.consignee,
          shipment: contract.shipment,
          items: contract.items.map((i) => ({
            itemName: i.itemName,
            bags: i.bags,
            kgPerBag: i.kgPerBag,
          })),
        }, company);
      }}
    />
  );
}

interface InvoicePDFData {
  invoiceNo: string;
  date: string;
  status: string;
  currency?: string;
  taxAmount?: number;
  taxable?: boolean;
  taxRate?: number | null;
  pebNumber?: string | null;
  pebDate?: string | null;
  exportNote?: string | null;
  customerName?: string | null;
  items: { itemName: string; quantity: number; price: number; unit: string | null }[];
  payments: { date: string; amount: number; currency: string; note: string | null }[];
}

export function StockReportPDFButton({ items }: { items: ClientInventoryItem[] }) {
  const company = useCompanyIdentity();
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("pdf.previewStock")}
      title="Laporan Stok"
      filename={`Stock_Report_${new Date().toISOString().slice(0, 10)}.pdf`}
      disabled={items.length === 0}
      generate={async () => {
        const { generateStockReportPDF } = await import("@/lib/pdf/stock-report-pdf");
        return generateStockReportPDF(items, company);
      }}
    />
  );
}

/**
 * Lembar hitung fisik stok opname (issue #129).
 *
 * Satu-satunya cetakan yang dipakai SEBELUM datanya ada: dicetak kosong, dibawa
 * ke gudang, ditulisi, baru diketik balik. `showSystemQty` bawaannya mati —
 * lihat alasan hitung-buta di `lib/pdf/opname-sheet-pdf.ts`.
 */
export function OpnameSheetPDFButton({
  items,
  date,
  showSystemQty,
}: {
  items: { name: string; unit: string | null; currentStock: number }[];
  date: string;
  showSystemQty: boolean;
}) {
  const company = useCompanyIdentity();
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("inventory.opnameSheetButton")}
      title={t("inventory.opnameSheetTitle")}
      filename={`Lembar_Hitung_Stok_${date}.pdf`}
      disabled={items.length === 0}
      generate={async () => {
        const { generateOpnameSheetPDF } = await import("@/lib/pdf/opname-sheet-pdf");
        return generateOpnameSheetPDF(items, company, { date, showSystemQty });
      }}
    />
  );
}

export function FinanceReportPDFButton({
  balances,
  transactions,
}: {
  balances: FinanceBalanceRow[];
  transactions: FinanceReportRow[];
}) {
  const company = useCompanyIdentity();
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("pdf.previewFinance")}
      title="Laporan Kas & Bank"
      filename={`Finance_Report_${new Date().toISOString().slice(0, 10)}.pdf`}
      generate={async () => {
        const { generateFinanceReportPDF } = await import("@/lib/pdf/finance-report-pdf");
        return generateFinanceReportPDF(balances, transactions, company);
      }}
    />
  );
}

/**
 * PDF export for the four financial statements (issue #18). One button serves all
 * of them: the server component hands over an already-computed, serialisable
 * payload, so nothing is recalculated here and the PDF can never disagree with
 * the page the user is looking at.
 */
export function StatementPDFButton({ payload }: { payload: StatementPayload }) {
  const company = useCompanyIdentity();
  const t = useT();
  const dateSlug = new Date().toISOString().slice(0, 10);
  return (
    <PdfDocumentButton
      label={t("pdf.previewAndPrint")}
      title="Laporan Keuangan"
      filename={`Laporan_${dateSlug}.pdf`}
      generate={async () => {
        const { generateStatementPDF } = await import("@/lib/pdf/statement-pdf");
        return generateStatementPDF(payload, company);
      }}
    />
  );
}

/**
 * Excel (.xlsx) export for the four financial statements (issue #19). The genuine
 * new capability alongside the PDF button: it POSTs the *same* `StatementPayload`
 * to the server, which builds the workbook with ExcelJS and streams it back — so
 * the numbers are identical to the page and to the PDF, and money lands in real
 * (summable, exact) number cells rather than pre-formatted strings.
 */
export function StatementExcelButton({ payload }: { payload: StatementPayload }) {
  const company = useCompanyIdentity();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `Laporan_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(t("excel.downloaded"));
    } catch (err) {
      console.error(err);
      toast(t("excel.failed"), "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <FileSpreadsheet className="h-4 w-4 mr-1" />
      {loading ? t("pdf.preparing") : t("excel.download")}
    </Button>
  );
}

export function InvoicePDFButton({ invoice }: { invoice: InvoicePDFData }) {
  const company = useCompanyIdentity();
  // Pratinjau + Unduh + Cetak lewat komponen dokumen bersama (contoh penerapan;
  // dokumen lain menyusul dengan pola yang sama).
  return (
    <PdfDocumentButton
      title={`Faktur ${invoice.invoiceNo}`}
      filename={`Invoice_${invoice.invoiceNo}.pdf`}
      generate={async () => {
        const { generateInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
        return generateInvoicePDF(invoice, company);
      }}
    />
  );
}
