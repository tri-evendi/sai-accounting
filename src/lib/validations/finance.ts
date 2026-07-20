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
 * The payload-only half of the over-allocation guard: no purchase may appear
 * twice, and the lines together may not exceed the payment they slice up.
 *
 * Extracted so the create path (`supplierTransactionSchema`, issue #37) and the
 * re-allocation path (`supplierPaymentAllocationsSchema`, issue #38) run the
 * *same* code rather than two copies that can drift apart. An edit must never be
 * laxer than a create — the cheapest way to guarantee that is to share the rule.
 *
 * `paymentAmount` is the payment's own amount in its own currency: on create it
 * comes from the payload, on edit from the stored row. Both sides of the
 * comparison are therefore the same currency, and no FX is involved here.
 */
export function checkAllocationSet(
  allocations: { purchaseId: number; amount: number }[],
  paymentAmount: number,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["allocations"]
) {
  if (allocations.length === 0) return;

  const seen = new Set<number>();
  for (const [i, a] of allocations.entries()) {
    if (seen.has(a.purchaseId)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, i, "purchaseId"],
        message: "Pembelian yang sama dialokasikan lebih dari sekali.",
      });
    }
    seen.add(a.purchaseId);
  }

  // Over-allocation guard #1: a payment cannot hand out more than it is worth.
  // Same currency on both sides by construction, so this comparison is safe.
  const total = allocations.reduce((s, a) => s + a.amount, 0);
  if (total > paymentAmount + MONEY_EPSILON) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `Total alokasi (${total.toLocaleString("id-ID")}) melebihi jumlah pembayaran (${paymentAmount.toLocaleString("id-ID")}).`,
    });
  }
}

/**
 * Re-allocating an *existing* payment (issue #38).
 *
 * The whole allocation set is replaced in one go — that is what makes "edit a
 * line", "remove a line" and "allocate a legacy payment that has none" the same
 * operation, and it makes the result independent of what was there before. An
 * empty array is meaningful and allowed: it clears every allocation and returns
 * the payment to the FIFO estimate, which is exactly how it was before #37.
 *
 * A factory rather than a constant because the cap belongs to the *stored*
 * payment, not the payload — a client must not be able to raise its own ceiling
 * by sending a bigger `amount`. The route loads the payment first and passes its
 * amount in. Duplicate + total checks are the shared `checkAllocationSet`, so
 * this path is guard-for-guard identical to the create path.
 */
export function supplierPaymentAllocationsSchema(paymentAmount: number) {
  return z
    .object({
      transactionId: z.coerce.number().int().positive(),
      allocations: z.array(supplierPaymentAllocationSchema).max(100),
    })
    .superRefine((data, ctx) => checkAllocationSet(data.allocations, paymentAmount, ctx));
}

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

    // Duplicate purchases and the "no more than the payment is worth" cap are
    // shared with the re-allocation path (issue #38) — see `checkAllocationSet`.
    checkAllocationSet(allocations, data.amount, ctx);
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
