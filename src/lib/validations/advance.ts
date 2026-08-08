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
import { vissue, vmsg } from "@/lib/i18n/validation";

/** Direction of an advance. Mirrors `advance_payments.type` (enum-like VarChar). */
export const advanceTypeEnum = z.enum(["sales", "purchase"]);

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const MONEY_EPSILON = 0.005;

/**
 * Id yang datang dari sebuah isian PILIHAN, dan yang boleh tidak dipilih.
 *
 * Yang dikerjakan `preprocess` (issue #216): pilihan kosong tiba sebagai `""`
 * atau `null`, dan `Number("")` adalah `0` — id yang tak pernah ada. Tanpa
 * normalisasi ini `optional()` tak pernah tercapai, dan yang muncul di layar
 * adalah keluhan zod tentang angka yang terlalu kecil, bukan kalimat
 * "Pelanggan wajib dipilih" yang disusun `superRefine` di bawah.
 */
const pickedId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional()
);

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
    date: z.string().min(1, vmsg("validation.dateRequired")),
    customerId: pickedId,
    supplierId: pickedId,
    /** Optional link to the contract the advance was received against. */
    contractId: pickedId,
    amount: z.coerce.number().positive(vmsg("validation.advanceAmountPositive")),
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
          message: vmsg("validation.advanceCustomerRequired"),
        });
      }
      if (data.supplierId) {
        ctx.addIssue({
          code: "custom",
          path: ["supplierId"],
          message: vmsg("validation.advanceSalesNoSupplier"),
        });
      }
      return;
    }

    if (!data.supplierId) {
      ctx.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: vmsg("validation.advanceSupplierRequired"),
      });
    }
    if (data.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: vmsg("validation.advancePurchaseNoCustomer"),
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
  amount: z.coerce.number().positive(vmsg("validation.compensationAmountPositive")),
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
        message: vmsg("validation.advanceUsedTwice"),
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
    date: z.string().min(1, vmsg("validation.dateRequired")),
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
        ...vissue("validation.compensationExceedsAdvance", {
          amount: data.amount.toLocaleString("id-ID"),
          remaining: advanceRemaining.toLocaleString("id-ID"),
          currency,
        }),
      });
    }
  });
}
