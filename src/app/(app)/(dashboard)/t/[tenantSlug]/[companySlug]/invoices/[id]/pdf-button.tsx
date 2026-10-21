"use client";

/**
 * Tombol cetak faktur.
 *
 * Sejak tahap 1c ia hanya meneruskan ID dan nomor faktur: PDF-nya dirender di
 * SERVER dari buku PT, lewat pintu yang sama dengan lampiran surel faktur
 * (rancangan §5). Prop yang dulu memuat seluruh muatan faktur — item,
 * pembayaran, pajak — dicabut: angka di atas kertas tidak boleh ditentukan oleh
 * apa yang dikirim peramban.
 */
import { InvoicePDFButton } from "@/components/shared/pdf-export-buttons";

export function InvoicePDFButtonWrapper({
  invoiceId,
  invoiceNo,
}: {
  invoiceId: number;
  invoiceNo: string;
}) {
  return <InvoicePDFButton invoiceId={invoiceId} invoiceNo={invoiceNo} />;
}
