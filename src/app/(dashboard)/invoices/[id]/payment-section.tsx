"use client";

import { useRouter } from "next/navigation";
import { PaymentForm } from "@/components/shared/payment-form";

export function InvoicePaymentSection({ invoiceId }: { invoiceId: number }) {
  const router = useRouter();
  return (
    <PaymentForm
      entityType="invoices"
      entityId={invoiceId}
      onSuccess={() => router.refresh()}
    />
  );
}
