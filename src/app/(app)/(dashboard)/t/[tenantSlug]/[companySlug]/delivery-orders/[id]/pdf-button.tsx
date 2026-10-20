"use client";

/**
 * Pratinjau + Cetak Surat Jalan dari baris `delivery_orders` (dokumen berantai
 * #16).
 *
 * Sejak tahap 1c ia hanya meneruskan ID dan nomornya — PDF-nya dirender di
 * SERVER dari baris buku (rancangan §5). Prop yang dulu memuat muatan surat
 * jalan beserta pelipatan kendaraan/kontainer dicabut: pelipatan itu kini di
 * `document-loaders.ts`, satu tempat, dan surat jalan adalah dokumen yang
 * diserahkan ke pengangkut.
 *
 * ⚠ Ada DUA surat jalan di aplikasi ini, dan keduanya sah: yang ini dari baris
 * `delivery_orders`, dan satu lagi dari KONTRAK di halaman kontrak. Keduanya
 * memakai generator yang sama — satu tata letak, bukan dua — tapi punya kunci
 * jenisnya sendiri, sebab `id` yang berarti dua hal adalah `id` yang suatu
 * hari memuat dokumen yang salah.
 */
import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@sai/core/i18n/client";
import { fetchDocumentPdfBlob } from "@/lib/report-files";

export function DeliveryOrderPdfButton({
  orderId,
  orderNo,
}: {
  orderId: number;
  orderNo: string;
}) {
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("deliveryOrders.title")}
      title={t("deliveryOrders.detailTitle", { no: orderNo })}
      filename={`SuratJalan_${orderNo}.pdf`}
      generate={() => fetchDocumentPdfBlob("delivery-order", orderId)}
    />
  );
}
