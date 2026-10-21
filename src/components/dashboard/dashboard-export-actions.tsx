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
 * ══ TAHAP 1c: PENGGAMBARANNYA PINDAH KE SERVER, DAN ONGKOSNYA DISEBUT ══════
 * Sejak §5 kedua tombol ini tidak lagi memuat jsPDF: mereka mengirim muatannya
 * ke `/api/reports/pdf/<jenis>`. Harganya nyata dan tidak disembunyikan —
 * **barisnya melintasi jaringan DUA kali** di beranda: sekali turun dari
 * `/api/inventory` atau `/api/finance`, sekali naik kembali sebagai muatan.
 *
 * Itu diterima dengan sadar karena yang dibelinya satu aturan, bukan dua:
 * laporan dicetak DARI MUATAN, titik. Rute yang juga bisa memuat sendiri bila
 * muatannya kosong adalah rute dengan dua modus — dan modus kedua adalah
 * tempat perbedaan perilaku bersembunyi. Pada pemasangan terbesar yang pernah
 * diukur (18.000+ baris kas) muatannya ~3 MB, masih di bawah batas 16 MB.
 *
 * **Pemicunya untuk menghapus perjalanan kedua:** turunan laporan kas
 * diekstrak jadi satu fungsi bersama. Hari ini ia ditulis DUA kali — sekali
 * sebaris di halaman Kas & Bank (disaring tahun/bulan) dan sekali di
 * `/api/finance` GET (disaring jenis/mata uang) — dan menyatukannya adalah
 * perubahan pada halaman yang filternya dipakai orang, bukan pekerjaan sambil
 * lalu.
 */

import { useT } from "@sai/core/i18n/client";
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow } from "@/lib/pdf/finance-report-pdf";
import { toFinanceReportRows, type FinanceRowSource } from "@/lib/finance-report-rows";
import { apiFetch } from "@/lib/api-fetch";
import { fetchReportPdfBlob } from "@/lib/report-files";

const today = () => new Date().toISOString().slice(0, 10);

export function InventoryExportAction() {
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewStock")}
      title="Laporan Stok"
      filename={`Stock_Report_${today()}.pdf`}
      generate={async () => {
        const res = await apiFetch("/api/inventory");
        if (!res.ok) throw new Error("inventory fetch failed");
        const items: ClientInventoryItem[] = await res.json();
        return fetchReportPdfBlob("stock", { items });
      }}
    />
  );
}

export function FinanceExportAction() {
  const t = useT();

  return (
    <PdfDocumentButton
      label={t("pdf.previewFinance")}
      title="Laporan Kas & Bank"
      filename={`Finance_Report_${today()}.pdf`}
      generate={async () => {
        const res = await apiFetch("/api/finance");
        if (!res.ok) throw new Error("finance fetch failed");
        /* `transactions` di sini baris Prisma mentah: `Decimal` tiba sebagai
           STRING. Pemetanya yang sama dengan halaman Kas & Bank — lihat
           `finance-report-rows.ts`. */
        const data: { balances: FinanceBalanceRow[]; transactions: FinanceRowSource[] } =
          await res.json();
        return fetchReportPdfBlob("finance", {
          balances: data.balances,
          transactions: toFinanceReportRows(data.transactions),
        });
      }}
    />
  );
}
