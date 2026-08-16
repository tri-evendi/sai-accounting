"use client";

/**
 * Dua tombol cetak kontrak. **Jalur cetaknya (jsPDF) tidak disentuh issue
 * #195** — yang berubah hanya pembungkusnya: `flex gap-2` menjadi `Flex` AntD
 * dengan jarak dari token (`marginXS` = 8px, nilai yang sama).
 */

import { Flex, theme } from "antd";
import { ContractPDFButton, ShippingDocButton } from "@/components/shared/pdf-export-buttons";

interface Props {
  contract: {
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
  };
}

export function ContractPDFButtons({ contract }: Props) {
  const { token } = theme.useToken();
  return (
    <Flex wrap gap={token.marginXS}>
      <ContractPDFButton contract={contract} />
      <ShippingDocButton contract={contract} />
    </Flex>
  );
}
