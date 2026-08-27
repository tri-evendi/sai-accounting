"use client";

import { useRouter } from "next/navigation";
import { PaymentForm } from "@/components/shared/payment-form";
import { asCurrency } from "@/lib/validations/fx";

export function InvoicePaymentSection({
  invoiceId,
  documentCurrency,
}: {
  invoiceId: number;
  /** Mata uang dokumen — pembayaran mengikutinya, dan server menolak yang lain. */
  documentCurrency: string;
}) {
  const router = useRouter();
  return (
    <PaymentForm
      entityType="invoices"
      entityId={invoiceId}
      documentCurrency={asCurrency(documentCurrency)}
      onSuccess={() => router.refresh()}
    />
  );
}
