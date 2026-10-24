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
 *
 * ══ 09 §5: PENGGAMBARAN DAN PERAKITANNYA DI SERVER ════════════════════════
 * Sejak tahap 1c kedua tombol ini tidak memuat jsPDF; sejak §5 ditutup mereka
 * juga tidak lagi MERAKIT muatannya. Dulu barisnya melintasi jaringan DUA kali
 * di beranda — turun dari `/api/inventory` / `/api/finance`, lalu naik lagi
 * sebagai muatan (~3 MB pada buku kas 18.000+ baris). Pemicu untuk menghapus
 * perjalanan kedua yang ditulis di sini dulu — "turunan laporan kas diekstrak
 * jadi satu fungsi bersama" — sudah terjadi: `financeFilter` /
 * `financeBalances` di `src/lib/report-pdf-payload.ts`, dipakai halaman Kas &
 * Bank DAN rute PDF-nya.
 *
 * Jadi tombolnya kini hanya menyebut JENIS dan saringannya (kosong = seluruh
 * buku, bentuk yang dulu dibaca `GET /api/finance` tanpa parameter), dan rute
 * menghitung muatannya dari buku PT. Yang melewati ambang penyerahan dikerjakan
 * antrean; tombolnya menunggu di rute hasil.
 */

import { useT } from "@sai/core/i18n/client";
import { businessISODate } from "@sai/core/business-date";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { fetchReportPdfBlob } from "@/lib/report-files";

const today = () => businessISODate(new Date());

export function InventoryExportAction() {
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewStock")}
      title={t("pdf.titleStockReport")}
      filename={`Stock_Report_${today()}.pdf`}
      generate={() => fetchReportPdfBlob("stock", {})}
    />
  );
}

export function FinanceExportAction() {
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewFinance")}
      title={t("pdf.titleFinanceReport")}
      filename={`Finance_Report_${today()}.pdf`}
      generate={() => fetchReportPdfBlob("finance", {})}
    />
  );
}
