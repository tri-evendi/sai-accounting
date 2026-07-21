/**
 * Uang Muka (advance payment) payload validation — issue #26.
 *
 * The division of labour is the one issue #9 set and #37/#38 followed: whatever
 * is knowable from the payload alone lives here, and whatever needs the database
 * (does this advance exist, is it this customer's, has it room left) lives in
 * `resolveApplicationLines`. Two layers, no overlap, and the DB layer is
 * authoritative — a Zod cap that passes is still re-checked against real rows.
 */
import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";

/** Direction of an advance. Mirrors `advance_payments.type` (enum-like VarChar). */
export const advanceTypeEnum = z.enum(["sales", "purchase"]);

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const MONEY_EPSILON = 0.005;

/**
 * Recording an advance: money moved with no document to settle.
 *
 * The party is required and must match the direction — a sales advance without a
 * customer is money from nobody, and it is the customer that makes the balance
 * answerable ("how much does this buyer still have on account?"). The XOR is
 * enforced here rather than by a DB CHECK, matching how every other enum-like
 * invariant in this schema is enforced (docs/DATABASE.md §2).
 */
export const advancePaymentSchema = z
  .object({
    type: advanceTypeEnum,
    date: z.string().min(1, "Tanggal wajib diisi"),
    customerId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    /** Optional link to the contract the advance was received against. */
    contractId: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().positive("Jumlah uang muka harus lebih besar dari 0"),
    currency: currencyEnum.default("IDR"),
    rate: rateField,
    note: z.string().max(500).trim().optional(),
  })
  .superRefine((data, ctx) => {
    requireRateForForeign(data, ctx);

    if (data.type === "sales") {
      if (!data.customerId) {
        ctx.addIssue({
          code: "custom",
          path: ["customerId"],
          message: "Pelanggan wajib dipilih untuk uang muka penjualan.",
        });
      }
      if (data.supplierId) {
        ctx.addIssue({
          code: "custom",
          path: ["supplierId"],
          message: "Uang muka penjualan tidak boleh menunjuk supplier.",
        });
      }
      return;
    }

    if (!data.supplierId) {
      ctx.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: "Supplier wajib dipilih untuk uang muka pembelian.",
      });
    }
    if (data.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Uang muka pembelian tidak boleh menunjuk pelanggan.",
      });
    }
  });

export type AdvancePaymentInput = z.infer<typeof advancePaymentSchema>;

/**
 * One "compensate this much of that advance into this document" line.
 *
 * `amount` is denominated in the ADVANCE's currency — a compensation is a slice
 * of one advance, so it cannot be in any other unit. Converting to IDR is the
 * server's job, at the advance's own stored rate, which is the rate the ledger
 * booked Uang Muka at. Whether the advance exists, points the right way and has
 * room left is checked against the database in `resolveApplicationLines`.
 */
export const advanceApplicationLineSchema = z.object({
  advanceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("Jumlah kompensasi harus lebih besar dari 0"),
});

/**
 * The payload-only half of the over-compensation guard: no advance may appear
 * twice in one request.
 *
 * Note what is deliberately NOT checked here, unlike `checkAllocationSet`. That
 * function can cap the lines against the payment they slice up, because every
 * allocation shares that one payment's currency. Compensation lines each slice a
 * DIFFERENT advance, each with its own currency and rate, so there is no common
 * unit in the payload to sum them in — adding a CNY line to a USD line is exactly
 * the cross-currency addition this codebase forbids. The per-advance cap and the
 * per-target cap are therefore both left to the DB layer, where each line can be
 * valued in IDR at its own advance's rate. Zod stops what Zod can honestly see.
 */
export function checkApplicationSet(
  lines: { advanceId: number; amount: number }[],
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["lines"]
) {
  const seen = new Set<number>();
  for (const [i, line] of lines.entries()) {
    if (seen.has(line.advanceId)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, i, "advanceId"],
        message: "Uang muka yang sama dikompensasi lebih dari sekali.",
      });
    }
    seen.add(line.advanceId);
  }
}

/** Compensating one or more advances into a single invoice / supplier purchase. */
export const advanceApplicationsSchema = z
  .object({
    targetKind: z.enum(["invoice", "purchase"]),
    targetId: z.coerce.number().int().positive(),
    date: z.string().min(1, "Tanggal wajib diisi"),
    lines: z.array(advanceApplicationLineSchema).max(100),
    note: z.string().max(500).trim().optional(),
  })
  .superRefine((data, ctx) => checkApplicationSet(data.lines, ctx));

export type AdvanceApplicationsInput = z.infer<typeof advanceApplicationsSchema>;

/**
 * Single-advance cap, for the one place a cap IS honestly checkable in the
 * payload: applying exactly one advance whose remaining balance the caller
 * already holds, in that advance's own currency. A factory so the ceiling comes
 * from the stored row rather than the request — the same shape as
 * `supplierPaymentAllocationsSchema` (issue #38).
 */
export function singleApplicationSchema(advanceRemaining: number, currency: string) {
  return advanceApplicationLineSchema.superRefine((data, ctx) => {
    if (data.amount > advanceRemaining + MONEY_EPSILON) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message:
          `Kompensasi (${data.amount.toLocaleString("id-ID")} ${currency}) melebihi ` +
          `sisa uang muka (${advanceRemaining.toLocaleString("id-ID")} ${currency}).`,
      });
    }
  });
}
