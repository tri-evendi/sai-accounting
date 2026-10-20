"use client";

import { useState } from "react";
import { Button } from "@sai/ui/button";
import { FileExcelOutlined } from "@ant-design/icons";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { useToast } from "@sai/ui/toast";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@sai/core/i18n/client";
import { useCompanyIdentity } from "@/lib/company-identity-client";
import {
  downloadStatementWorkbook,
  fetchDocumentPdfBlob,
  fetchStatementPdfBlob,
} from "@/lib/report-files";

/*
 * `ContractPDFData` DICABUT di tahap 1c, alasan yang sama dengan
 * `InvoicePDFData`: tipe yang tinggal sebagai "bentuk yang dikirim peramban"
 * adalah tipe yang mengundang jalur kedua dibangun lagi di atasnya. Bentuknya
 * kini hidup di satu tempat — `ContractData` di generatornya, yang diberi makan
 * `document-loaders.ts` dari baris buku.
 */

export function ContractPDFButton({
  contractId,
  contractNo,
}: {
  contractId: number;
  contractNo: string;
}) {
  /* DARI SERVER, dan ia mengirim ID — bukan muatan kontrak. Kontrak adalah
     dokumen yang dikirim ke pembeli; angka di atas kertas diturunkan dari BUKU
     (rancangan §5). */
  return (
    <PdfDocumentButton
      title={`Kontrak ${contractNo}`}
      filename={`Contract_${contractNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("contract", contractId)}
    />
  );
}

export function ShippingDocButton({
  contractId,
  contractNo,
}: {
  contractId: number;
  contractNo: string;
}) {
  const t = useT();
  /*
   * ⚠ `id`-nya id KONTRAK, bukan id `delivery_orders`. Tombolnya ada di halaman
   * kontrak dan memakai data kontrak yang sama; membangun jalur kedua dari
   * `delivery_orders` akan menghasilkan surat jalan yang berbeda dari yang
   * dicetak orang hari ini — perubahan perilaku yang menyelinap di bawah nama
   * "pindah ke server". Sebabnya ikut tertulis di `DOCUMENT_PDF`.
   */
  return (
    <PdfDocumentButton
      label={t("nav.items.deliveryOrders")}
      title={`Surat Jalan ${contractNo}`}
      filename={`SuratJalan_${contractNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("contract-shipping", contractId)}
    />
  );
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
        return generateStockReportPDF(items, company).output("blob");
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
        return generateOpnameSheetPDF(items, company, { date, showSystemQty }).output("blob");
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
        return generateFinanceReportPDF(balances, transactions, company).output("blob");
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
  /* `useCompanyIdentity()` dicabut dari tombol INI saja: identitas dan logonya
     kini dirakit di server (`serverPdfCompany`), dari basis data PT yang sedang
     dibuka. Merakitnya di klien lalu mengirimkannya berarti nama dan logo
     perusahaan di kertas ditentukan oleh apa yang dikirim peramban — dan
     peramban bukan sumber kebenaran tentang PT mana ini. Enam tombol lain di
     berkas ini masih menggambar di peramban dan tetap memakainya. */
  const t = useT();
  const dateSlug = new Date().toISOString().slice(0, 10);
  return (
    <PdfDocumentButton
      label={t("pdf.previewAndPrint")}
      title="Laporan Keuangan"
      filename={`Laporan_${dateSlug}.pdf`}
      /* DARI SERVER sejak tahap 1c (rancangan §5): peramban tidak lagi memuat
         `statement-pdf` (1.097 baris) beserta jsPDF hanya untuk menggambar
         laporan yang angkanya sudah ada di layar. Muatannya sudah bolak-balik
         ke server untuk tombol Excel di sebelahnya, jadi yang hilang nol dan
         yang dibeli tiga: byte yang bisa DISIMPAN sama dengan yang dikirim,
         paket laporan yang bisa terbit sendiri, dan dokumen yang tidak
         bergantung pada perangkat pengguna. */
      generate={() => fetchStatementPdfBlob(payload)}
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
  const t = useT();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      // Unduhannya sendiri hidup di `lib/report-files` — dipakai bersama dialog
      // parameter di Pusat Laporan, yang mengunduh laporan yang sama tanpa
      // membuka halamannya lebih dulu.
      await downloadStatementWorkbook(payload);
      toast(t("excel.downloaded"));
    } catch (err) {
      console.error(err);
      toast(t("excel.failed"), "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      {/* Jarak ikon–teks dari `iconGap` `.ant-btn`; ukuran dari primitif `Button`. */}
      <FileExcelOutlined aria-hidden="true" />
      {loading ? t("pdf.preparing") : t("excel.download")}
    </Button>
  );
}

export function InvoicePDFButton({
  invoiceId,
  invoiceNo,
}: {
  invoiceId: number;
  invoiceNo: string;
}) {
  /*
   * DARI SERVER sejak tahap 1c (rancangan §5), dan ia mengirim **ID** — bukan
   * muatan faktur.
   *
   * Faktur adalah dokumen yang dikirim ke pelanggan dan disimpan sebagai
   * bukti. Meneruskan muatannya ke server berarti angka di atas kertas tetap
   * ditentukan oleh apa yang dikirim peramban, sementara server kini tampak
   * menjaminnya — dan syarat audit §5 ("yang disimpan sama dengan yang dikirim
   * ke customer") baru berarti sesuatu bila kertasnya diturunkan dari BUKU.
   *
   * Pintunya SAMA dengan lampiran surel faktur (`invoicePdfById`), jadi kertas
   * yang dicetak dan yang dikirim tidak bisa berbeda — bukan karena keduanya
   * memakai generator yang sama, tapi karena keduanya satu fungsi.
   *
   * Yang tinggal sebagai prop hanya `invoiceNo`, dan hanya untuk JUDUL serta
   * nama berkas di layar; nama berkas yang sungguh dipakai datang dari
   * `Content-Disposition` milik servernya.
   */
  return (
    <PdfDocumentButton
      title={`Faktur ${invoiceNo}`}
      filename={`Invoice_${invoiceNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("invoice", invoiceId)}
    />
  );
}
