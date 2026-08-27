"use client";

import { useRouter } from "next/navigation";
import { PaymentForm } from "@/components/shared/payment-form";
import { asCurrency } from "@/lib/validations/fx";

export function ContractPaymentSection({
  contractId,
  documentCurrency,
}: {
  contractId: number;
  /** Mata uang dokumen — pembayaran mengikutinya, dan server menolak yang lain. */
  documentCurrency: string;
}) {
  const router = useRouter();
  return (
    <PaymentForm
      entityType="contracts"
      entityId={contractId}
      documentCurrency={asCurrency(documentCurrency)}
      onSuccess={() => router.refresh()}
    />
  );
}
