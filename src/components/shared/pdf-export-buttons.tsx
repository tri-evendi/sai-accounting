"use client";

import { useState } from "react";
import { businessISODate } from "@sai/core/business-date";
import { Button } from "@sai/ui/button";
import { FileExcelOutlined } from "@ant-design/icons";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { useToast } from "@sai/ui/toast";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@sai/core/i18n/client";
import {
  downloadStatementWorkbook,
  fetchDocumentPdfBlob,
  fetchReportPdfBlob,
  fetchStatementPdfBlob,
  type SumberLaporan,
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
  const t = useT();
  return (
    <PdfDocumentButton
      title={t("pdf.titleContract", { no: contractNo })}
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
      title={t("pdf.titleShippingDoc", { no: contractNo })}
      filename={`SuratJalan_${contractNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("contract-shipping", contractId)}
    />
  );
}

export function StockReportPDFButton({ empty }: { empty: boolean }) {
  const t = useT();
  /* DARI SERVER, dan sejak 09 §5 ditutup ia tidak mengirim apa pun: muatannya
     dihitung rute dari buku PT dengan kueri dan ringkasan yang SAMA dengan
     halaman Stok (`src/lib/report-pdf-payload.ts`). Halaman karena itu tidak
     lagi mengoper seluruh daftar barang ke peramban hanya untuk tombol ini —
     cukup satu boolean untuk `disabled`. */
  return (
    <PdfDocumentButton
      label={t("pdf.previewStock")}
      title={t("pdf.titleStockReport")}
      filename={`Stock_Report_${businessISODate(new Date())}.pdf`}
      disabled={empty}
      generate={() => fetchReportPdfBlob("stock", {})}
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
  empty,
  date,
  showSystemQty,
}: {
  empty: boolean;
  date: string;
  showSystemQty: boolean;
}) {
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("inventory.opnameSheetButton")}
      title={t("inventory.opnameSheetTitle")}
      filename={`Lembar_Hitung_Stok_${date}.pdf`}
      disabled={empty}
      /* DARI SERVER. Yang dikirim hanya dua PILIHAN orang yang mencetaknya —
         tanggal hitung dan hitung-buta (`showSystemQty`); daftar barang beserta
         saldonya dihitung rute dari buku, dengan pembaca yang SAMA dengan
         halaman opname (`opnameStockLevels`). */
      generate={() => fetchReportPdfBlob("opname", { date, showSystemQty })}
    />
  );
}

/**
 * Saringan halaman Kas & Bank — bunyi yang SAMA dengan URL-nya. Kosong = tanpa
 * saringan (seluruh buku kas), bentuk yang dipakai tombol beranda.
 */
export interface FinanceReportFilters {
  type?: string;
  currency?: string;
  year?: string;
  month?: string;
}

export function FinanceReportPDFButton({ filters }: { filters: FinanceReportFilters }) {
  const t = useT();
  /* DARI SERVER, dan yang dikirim SARINGANNYA, bukan barisnya: saldo per jenis
     & mata uang dan transaksinya dihitung rute dari buku PT dengan aturan
     saringan yang SAMA dengan halaman ini (`financeFilter`). Buku kas setahun
     (18.000+ baris) tidak lagi menyeberang ke peramban dua kali, dan yang
     melewati ambang penyerahan dikerjakan antrean. */
  return (
    <PdfDocumentButton
      label={t("pdf.previewFinance")}
      title={t("pdf.titleFinanceReport")}
      filename={`Finance_Report_${businessISODate(new Date())}.pdf`}
      generate={() => fetchReportPdfBlob("finance", filters)}
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
  /* Identitas & logo dirakit di SERVER (`serverPdfCompany`), dari basis data PT
     yang sedang dibuka. Merakitnya di klien lalu mengirimkannya berarti nama
     dan logo perusahaan di kertas ditentukan oleh apa yang dikirim peramban —
     dan peramban bukan sumber kebenaran tentang PT mana ini.

     Sejak tahap 1c SETIAP tombol di berkas ini dirender server, jadi
     `useCompanyIdentity` tidak diimpor di sini lagi — satu impor yang tinggal
     adalah satu jalan kembali yang masih terbuka. */
  const t = useT();
  const dateSlug = businessISODate(new Date());
  return (
    <PdfDocumentButton
      label={t("pdf.previewAndPrint")}
      title={t("pdf.titleFinancialStatements")}
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
export function StatementExcelButton({
  payload,
  sumber,
}: {
  payload: StatementPayload;
  /**
   * Asal laporannya (`reportId` + parameter). WAJIB untuk laporan yang
   * berkasnya dihasilkan Go (`src/lib/report-engine.ts` → `go`): pekerja Go
   * menghitung dari PARAMETER, bukan dari muatan layar. Untuk laporan lain ia
   * membuka penyerahan ke antrean di atas ambang baris.
   */
  sumber?: SumberLaporan;
}) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      // Unduhannya sendiri hidup di `lib/report-files` — dipakai bersama dialog
      // parameter di Pusat Laporan, yang mengunduh laporan yang sama tanpa
      // membuka halamannya lebih dulu.
      await downloadStatementWorkbook(payload, sumber);
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
  const t = useT();
  return (
    <PdfDocumentButton
      title={t("pdf.titleInvoice", { no: invoiceNo })}
      filename={`Invoice_${invoiceNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("invoice", invoiceId)}
    />
  );
}
