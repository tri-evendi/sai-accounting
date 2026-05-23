"use client";

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
  return (
    <div className="flex gap-2">
      <ContractPDFButton contract={contract} />
      <ShippingDocButton contract={contract} />
    </div>
  );
}
