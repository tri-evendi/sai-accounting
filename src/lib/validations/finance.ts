import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";
import { dueDateField } from "./common";

export const cashTransactionSchema = z
  .object({
    type: z.enum(["bank", "kas_besar", "kas_kecil"]),
    date: z.string().min(1, "Date is required"),
    description: z.string().min(1, "Description is required").max(255).trim(),
    currency: currencyEnum.default("IDR"),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    // Persisted to cash_accounts.rate; drives base_amount and the journal.
    rate: rateField,
    /**
     * The other side of the double entry. A cash movement on its own says
     * nothing about *why* money moved, so the posting engine refuses to post
     * without it — hence required here rather than optional.
     * Not a column on cash_accounts: it is passed to the engine as
     * `ctx.counterAccountId` and lives on in the journal line it produces.
     */
    counterAccountId: z.coerce
      .number()
      .int()
      .positive("Akun lawan wajib dipilih"),
    note: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.debit > 0 || data.credit > 0, {
    message: "Either debit or credit must be greater than 0",
    path: ["debit"],
  })
  .superRefine(requireRateForForeign);

/**
 * Supplier purchases and payments. `type` is the engine's discriminator:
 * `purchase` → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha,
 * `payment`  → D: Hutang Usaha / K: Kas & Bank.
 * Any other value makes the posting engine throw, so the enum is closed.
 */
export const supplierTransactionSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    date: z.string().min(1, "Date is required"),
    /** Only meaningful on a purchase — a payment has nothing to fall due. */
    dueDate: dueDateField,
    type: z.enum(["purchase", "payment"]),
    /** Net value, excluding tax — taxAmount is carried separately. */
    amount: z.coerce.number().positive("Amount must be positive"),
    currency: currencyEnum.default("IDR"),
    rate: rateField,
    /** PPN Masukan portion. Only meaningful on a purchase. */
    taxAmount: z.coerce.number().min(0).default(0),
    note: z.string().max(500).trim().optional(),
  })
  .superRefine((data, ctx) => {
    requireRateForForeign(data, ctx);
    if (data.type === "payment" && data.taxAmount > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["taxAmount"],
        message: "PPN hanya berlaku untuk transaksi pembelian, bukan pembayaran.",
      });
    }
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
export type SupplierTransactionInput = z.infer<typeof supplierTransactionSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
