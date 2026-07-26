"use client";

import { PdfDocumentButton } from "@/components/shared/pdf-document-button";
import { useT } from "@/lib/i18n/client";

interface DeliveryOrderPdf {
  no: string;
  date: string;
  buyer: string;
  consignee: string | null;
  vehicleNo: string | null;
  containerNo: string | null;
  items: { itemName: string; bags: number; kgPerBag: number }[];
}

/**
 * Pratinjau + Cetak Surat Jalan. Memakai renderer jsPDF yang SAMA
 * (`generateShippingPDF`) dengan surat-jalan di detail kontrak — satu layout,
 * bukan dua. Nomor DO menggantikan `contractNo`; kendaraan/kontainer dilipat ke
 * baris `shipment`.
 */
export function DeliveryOrderPdfButton({ order }: { order: DeliveryOrderPdf }) {
  const t = useT();
  return (
    <PdfDocumentButton
      label={t("deliveryOrders.title")}
      title={t("deliveryOrders.detailTitle", { no: order.no })}
      filename={`SuratJalan_${order.no}.pdf`}
      generate={async () => {
        const { generateShippingPDF } = await import("@/lib/pdf/shipping-pdf");
        const shipment = [
          order.vehicleNo ? `Kendaraan: ${order.vehicleNo}` : null,
          order.containerNo ? `Kontainer: ${order.containerNo}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return generateShippingPDF({
          contractNo: order.no,
          date: order.date,
          buyer: order.buyer,
          consignee: order.consignee,
          shipment: shipment || null,
          items: order.items,
        });
      }}
    />
  );
}
