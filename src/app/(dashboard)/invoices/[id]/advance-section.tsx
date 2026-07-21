"use client";

/**
 * Compensating uang muka into this invoice (issue #26).
 *
 * The body of this component moved to
 * `src/components/shared/advance-compensation.tsx` when issue #41 gave the
 * purchase side the same flow. Nothing about the sales side changed — this is
 * the invoice-shaped call into the shared component, kept as a named module so
 * the invoice page reads as before and so "where is the down-payment panel on
 * the invoice screen" still has an answer next to the page that uses it.
 */
import {
  AdvanceCompensationSection,
  type AdvanceOption,
  type AppliedAdvance,
} from "@/components/shared/advance-compensation";

export type { AdvanceOption, AppliedAdvance };

export function InvoiceAdvanceSection({
  invoiceId,
  invoiceCurrency,
  outstandingBase,
  advances,
  applied,
}: {
  invoiceId: number;
  invoiceCurrency: string;
  /** What the invoice still owes in IDR, after payments and prior compensation. */
  outstandingBase: number | null;
  advances: AdvanceOption[];
  applied: AppliedAdvance[];
}) {
  return (
    <AdvanceCompensationSection
      targetKind="invoice"
      targetId={invoiceId}
      targetCurrency={invoiceCurrency}
      outstandingBase={outstandingBase}
      advances={advances}
      applied={applied}
    />
  );
}
