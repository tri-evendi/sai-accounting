"use client";

import { InvoicePDFButton } from "@/components/shared/pdf-export-buttons";

interface Props {
  invoice: {
    invoiceNo: string;
    date: string;
    status: string;
    items: { itemName: string; quantity: number; price: number; unit: string | null }[];
    payments: { date: string; amount: number; currency: string; note: string | null }[];
  };
}

export function InvoicePDFButtonWrapper({ invoice }: Props) {
  return <InvoicePDFButton invoice={invoice} />;
}
