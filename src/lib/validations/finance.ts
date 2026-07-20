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
 * One "this payment settles that purchase" line (issue #37).
 *
 * `amount` is denominated in the PAYMENT's currency — an allocation is a slice
 * of one payment, so it cannot be in any other unit, and keeping it there means
 * the "allocations must not exceed the payment" check below compares two numbers
 * in the same currency. Converting to IDR is the API's job, using the payment's
 * own rate. Whether the target purchase exists, belongs to this supplier and has
 * room left cannot be known from the payload alone; the route checks that
 * against the database.
 */
export const supplierPaymentAllocationSchema = z.object({
  purchaseId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("Jumlah alokasi harus lebih besar dari 0"),
});

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const MONEY_EPSILON = 0.005;

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
    /**
     * Which purchase(s) this payment settles (issue #37). Optional on purpose:
     * a payment may legitimately be recorded without one (an advance, or a user
     * who does not know yet), in which case it falls back to the FIFO estimate
     * exactly as every legacy row does. Empty is never the same as wrong.
     */
    allocations: z.array(supplierPaymentAllocationSchema).max(100).optional(),
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

    const allocations = data.allocations ?? [];
    if (allocations.length === 0) return;

    // A purchase creates the debt; it cannot settle one.
    if (data.type !== "payment") {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Alokasi hanya berlaku untuk transaksi pembayaran, bukan pembelian.",
      });
      return;
    }

    const seen = new Set<number>();
    for (const [i, a] of allocations.entries()) {
      if (seen.has(a.purchaseId)) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations", i, "purchaseId"],
          message: "Pembelian yang sama dialokasikan lebih dari sekali.",
        });
      }
      seen.add(a.purchaseId);
    }

    // Over-allocation guard #1: a payment cannot hand out more than it is worth.
    // Same currency on both sides by construction, so this comparison is safe.
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (total > data.amount + MONEY_EPSILON) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: `Total alokasi (${total.toLocaleString("id-ID")}) melebihi jumlah pembayaran (${data.amount.toLocaleString("id-ID")}).`,
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
