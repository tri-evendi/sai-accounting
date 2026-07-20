import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

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
    buyer: z.string().min(1, "Buyer is required").max(100).trim(),
    consignee: z.string().max(100).trim().optional(),
    packaging: z.string().max(100).trim().optional(),
    shipment: z.string().max(200).trim().optional(),
    top1: z.string().max(200).trim().optional(),
    top2: z.string().max(200).trim().optional(),
    currency: currencyEnum.default("USD"),
    /**
     * LEGACY GAP: `contracts` has no rate column, so this is NOT persisted — it
     * is handed to the posting engine as `ctx.rate` so a USD/CNY contract books
     * a correct IDR value. Adding the column belongs to a schema migration
     * outside this issue's scope.
     */
    rate: rateField,
    status: z.enum(["signed", "pending", "canceled"]).default("pending"),
    items: z.array(contractItemSchema).min(1, "At least one item is required").max(50),
  })
  .superRefine((data, ctx) => {
    // A cancelled or zero-value contract produces no journal, so it needs no rate.
    const subtotal = data.items.reduce((s, i) => s + i.bags * i.kgPerBag * i.pricePerKg, 0);
    if (data.status === "canceled" || subtotal <= 0) return;
    requireRateForForeign(data, ctx);
  });

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
