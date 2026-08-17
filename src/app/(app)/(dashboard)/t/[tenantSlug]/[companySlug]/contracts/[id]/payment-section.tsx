"use client";

import { useRouter } from "next/navigation";
import { PaymentForm } from "@/components/shared/payment-form";

export function ContractPaymentSection({ contractId }: { contractId: number }) {
  const router = useRouter();
  return (
    <PaymentForm
      entityType="contracts"
      entityId={contractId}
      onSuccess={() => router.refresh()}
    />
  );
}
