"use client";

/**
 * Tombol ekspor di beranda — datanya diambil SAAT DITEKAN, bukan ikut dirender.
 *
 * ══ KENAPA DIUBAH ══════════════════════════════════════════════════════════
 * Sebelumnya beranda mengoper SELURUH isi buku kas dan seluruh ringkasan stok
 * ke komponen ini sebagai props, supaya tombolnya siap sedia. Akibatnya setiap
 * pembukaan beranda — termasuk oleh orang yang cuma ingin menekan satu Aksi
 * Cepat — membaca ribuan baris dari basis data, membentuknya jadi objek, lalu
 * mengirimkannya ke browser di dalam payload halaman. Pada pemasangan yang
 * sudah berjalan setahun itu 18.000+ baris kas per kunjungan, dan hampir tak
 * pernah dipakai.
 *
 * Sekarang halaman tidak membawa apa-apa untuk tombol ini. Datanya diambil di
 * dalam `generate`, yaitu setelah pengguna benar-benar menekan Ekspor. Isi PDF
 * tetap sama persis: sumbernya route yang sama dengan yang dipakai halaman
 * Kas & Bank dan Stok.
 *
 * Konsekuensi yang disebutkan apa adanya: PDF kini dibuat dari data SAAT
 * DITEKAN, bukan saat halaman dimuat. Bila ada transaksi masuk di antara
 * keduanya, ia ikut tercetak — dan itu justru lebih benar daripada mencetak
 * potret yang sudah basi.
 */

import { useCompanyIdentity } from "@/lib/company-identity-client";
import { useT } from "@/lib/i18n/client";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

const today = () => new Date().toISOString().slice(0, 10);

export function InventoryExportAction() {
  const company = useCompanyIdentity();
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewStock")}
      title="Laporan Stok"
      filename={`Stock_Report_${today()}.pdf`}
      generate={async () => {
        const res = await fetch("/api/inventory");
        if (!res.ok) throw new Error("inventory fetch failed");
        const items: ClientInventoryItem[] = await res.json();
        const { generateStockReportPDF } = await import("@/lib/pdf/stock-report-pdf");
        return generateStockReportPDF(items, company);
      }}
    />
  );
}

export function FinanceExportAction() {
  const company = useCompanyIdentity();
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewFinance")}
      title="Laporan Kas & Bank"
      filename={`Finance_Report_${today()}.pdf`}
      generate={async () => {
        const res = await fetch("/api/finance");
        if (!res.ok) throw new Error("finance fetch failed");
        const data: { balances: FinanceBalanceRow[]; transactions: FinanceReportRow[] } =
          await res.json();
        const { generateFinanceReportPDF } = await import("@/lib/pdf/finance-report-pdf");
        return generateFinanceReportPDF(data.balances, data.transactions, company);
      }}
    />
  );
}
