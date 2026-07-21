"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";
import { useToast } from "@/components/ui/toast";

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
 * Cetak Surat Jalan. Reuses the EXISTING jsPDF renderer `generateShippingPDF`
 * (src/lib/pdf/shipping-pdf.ts) — the same surat-jalan document the contract
 * detail already prints — so there is one shipping-document layout, not two. The
 * DO number stands in for `contractNo`, and kendaraan/kontainer are folded into
 * the `shipment` line the template already renders.
 */
export function DeliveryOrderPdfButton({ order }: { order: DeliveryOrderPdf }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateShippingPDF } = await import("@/lib/pdf/shipping-pdf");
      const shipment = [
        order.vehicleNo ? `Kendaraan: ${order.vehicleNo}` : null,
        order.containerNo ? `Kontainer: ${order.containerNo}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const doc = generateShippingPDF({
        contractNo: order.no,
        date: order.date,
        buyer: order.buyer,
        consignee: order.consignee,
        shipment: shipment || null,
        items: order.items,
      });
      doc.save(`SuratJalan_${order.no}.pdf`);
      toast("Surat jalan diunduh");
    } catch (err) {
      console.error(err);
      toast("Gagal membuat PDF", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <Truck className="mr-1 h-4 w-4" />
      {loading ? "Menyiapkan…" : "Cetak Surat Jalan"}
    </Button>
  );
}
