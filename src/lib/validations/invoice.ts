import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

export const invoiceItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required").max(100).trim(),
  quantity: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  unit: z.string().max(20).trim().optional(),
});

export const invoiceSchema = z.object({
  invoiceNo: z.string().min(1, "Invoice number is required").max(50).trim(),
  date: z.string().min(1, "Date is required"),
  status: z.enum(["signed", "pending", "canceled"]).default("pending"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required").max(50),
});

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
