import { z } from "zod";
import { round2 } from "@/lib/posting/rules";
import { BASE_CURRENCY, currencyEnum, fxAmounts, rateField, requireRateForForeign } from "./fx";
import { dueDateField } from "./common";

export const contractItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required").max(100).trim(),
  bags: z.coerce.number().int().min(0, "Bags must be 0 or more"),
  kgPerBag: z.coerce.number().min(0, "Kg per bag must be 0 or more"),
  pricePerKg: z.coerce.number().min(0, "Price must be 0 or more"),
});

export const contractSchema = z
  .object({
    contractNo: z.string().min(1, "Contract number is required").max(50).trim(),
    date: z.string().min(1, "Date is required"),
    /**
     * Explicit due date for AR aging (issue #12). Deliberately separate from
     * `top1`/`top2`: those stay free-text commercial terms and are shown as-is,
     * because "30% advance, 70% on B/L" is not a date and must not be guessed at.
     */
    dueDate: dueDateField,
    buyer: z.string().min(1, "Buyer is required").max(100).trim(),
    /**
     * Legacy free-text consignee, kept as a FALLBACK for un-migrated rows
     * (issue #22). When `consigneeId` points at a master row the text is
     * redundant but never dropped, so nothing is lost for rows that never
     * resolved to a master.
     */
    consignee: z.string().max(100).trim().optional(),
    /**
     * FK to the Consignee master (issue #22). Nullable: a contract may still
     * carry only the legacy free text. "" / null / undefined coerce to null so
     * the form can clear the selection.
     */
    consigneeId: z
      .preprocess(
        (v) => (v === "" || v === null || v === undefined ? null : v),
        z.coerce.number().int().positive().nullable()
      )
      .default(null),
    packaging: z.string().max(100).trim().optional(),
    shipment: z.string().max(200).trim().optional(),
    top1: z.string().max(200).trim().optional(),
    top2: z.string().max(200).trim().optional(),
    currency: currencyEnum.default("USD"),
    /**
     * Persisted to `contracts.rate` (migration 0008); drives `base_amount` and
     * the IDR value of the journal. Stored rather than passed per-post, so an
     * edit no longer has to re-enter it and a repost recovers the same value.
     */
    rate: rateField,
    status: z.enum(["signed", "pending", "canceled"]).default("pending"),
    items: z.array(contractItemSchema).min(1, "At least one item is required").max(50),
  })
  .superRefine((data, ctx) => {
    // A cancelled or zero-value contract produces no journal, so it needs no rate.
    if (data.status === "canceled" || contractSubtotal(data.items) <= 0) return;
    requireRateForForeign(data, ctx);
  });

/**
 * Contract value in its own currency — bags × kg/bag × price/kg across items.
 * This is the figure multiplied by the rate to become `base_amount`, and the
 * amount debited to Piutang Usaha.
 */
export function contractSubtotal(
  items: { bags: number; kgPerBag: number; pricePerKg: number }[]
): number {
  return round2(items.reduce((s, i) => s + i.bags * i.kgPerBag * i.pricePerKg, 0));
}

/**
 * The `rate` / `base_amount` pair to persist on a contract (issue #36).
 *
 * Both stay NULL when a foreign contract genuinely has no rate. Validation only
 * demands one for a contract that will actually post — a cancelled or zero-value
 * contract never does — so this path is reachable, and defaulting it to 1 there
 * would record a USD contract as worth its face value in rupiah, the very bug
 * this issue fixes. Everything else goes through `fxAmounts`, which is the one
 * place rate × amount is turned into an IDR base.
 */
export function contractFx(
  currency: string,
  items: { bags: number; kgPerBag: number; pricePerKg: number }[],
  rate?: number
): { rate: number | null; baseAmount: number | null } {
  if (currency !== BASE_CURRENCY && !(rate && rate > 0)) {
    return { rate: null, baseAmount: null };
  }
  return fxAmounts(currency, contractSubtotal(items), rate);
}

export const contractPaymentSchema = z
  .object({
    contractId: z.coerce.number().int(),
    date: z.string().min(1, "Date is required"),
    amount: z.coerce.number().positive("Amount must be positive"),
    currency: currencyEnum.default("USD"),
    // Persisted to contract_payments.rate; drives base_amount and the journal.
    rate: rateField,
    note: z.string().max(500).trim().optional(),
  })
  .superRefine(requireRateForForeign);

export type ContractInput = z.infer<typeof contractSchema>;
export type ContractItemInput = z.infer<typeof contractItemSchema>;
export type ContractPaymentInput = z.infer<typeof contractPaymentSchema>;
