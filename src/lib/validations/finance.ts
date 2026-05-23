import { z } from "zod";

export const cashTransactionSchema = z
  .object({
    type: z.enum(["bank", "kas_besar", "kas_kecil"]),
    date: z.string().min(1, "Date is required"),
    description: z.string().min(1, "Description is required").max(255).trim(),
    currency: z.enum(["USD", "CNY", "IDR"]).default("IDR"),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    note: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.debit > 0 || data.credit > 0, {
    message: "Either debit or credit must be greater than 0",
    path: ["debit"],
  });

export const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required").max(100).trim(),
  address: z.string().max(500).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  email: z.string().email("Invalid email").max(100).optional().or(z.literal("")),
});

export const customerSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(100).trim(),
  address: z.string().max(500).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  email: z.string().email("Invalid email").max(100).optional().or(z.literal("")),
  pic: z.string().max(100).trim().optional(),
});

export type CashTransactionInput = z.infer<typeof cashTransactionSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
