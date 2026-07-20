import { z } from "zod";
import { round2 } from "@/lib/posting/rules";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

export const invoiceItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required").max(100).trim(),
  quantity: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  unit: z.string().max(20).trim().optional(),
});

export const invoiceSchema = z
  .object({
    invoiceNo: z.string().min(1, "Invoice number is required").max(50).trim(),
    date: z.string().min(1, "Date is required"),
    status: z.enum(["signed", "pending", "canceled"]).default("pending"),
    // Nullable: legacy invoices carry no customer, and the picker may be left empty.
    customerId: z.coerce.number().int().positive().nullish(),
    currency: currencyEnum.default("IDR"),
    // Persisted to invoices.rate; drives base_amount and the IDR value of the journal.
    rate: rateField,
    // PPN Keluaran, in `currency`. Posted to Hutang PPN Keluaran (2103).
    taxAmount: z.coerce.number().min(0, "Pajak tidak boleh negatif").default(0),
    items: z.array(invoiceItemSchema).min(1, "At least one item is required").max(50),
  })
  .superRefine(requireRateForForeign);

/** Net line value of an invoice, in the invoice's own currency. */
export function invoiceSubtotal(items: { quantity: number; price: number }[]): number {
  return round2(items.reduce((sum, i) => sum + i.quantity * i.price, 0));
}

/**
 * Gross document value (subtotal + PPN) in the invoice's own currency — the
 * figure that becomes `base_amount` once multiplied by the rate, and the amount
 * debited to Piutang Usaha.
 */
export function invoiceTotal(
  items: { quantity: number; price: number }[],
  taxAmount = 0
): number {
  return round2(invoiceSubtotal(items) + taxAmount);
}

export const invoicePaymentSchema = z
  .object({
    invoiceId: z.coerce.number().int(),
    date: z.string().min(1, "Date is required"),
    amount: z.coerce.number().positive("Amount must be positive"),
    currency: currencyEnum.default("USD"),
    // Persisted to invoice_payments.rate; drives base_amount and the journal.
    rate: rateField,
    note: z.string().max(500).trim().optional(),
  })
  .superRefine(requireRateForForeign);

export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;
