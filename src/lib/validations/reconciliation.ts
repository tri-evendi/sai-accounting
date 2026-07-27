import { z } from "zod";
import { currencyEnum } from "./fx";
import { vmsg } from "@/lib/i18n/validation";

/**
 * Bank reconciliation validation (issue #24).
 *
 * A `BankStatement` is one bank account (identified by cashType + currency) over
 * one period, with the opening/closing balance the bank reports. Reconciliation
 * only makes sense against the `bank` cash book — kas fisik has no rekening
 * koran — so `cashType` is fixed to `bank` here.
 */
export const bankStatementSchema = z
  .object({
    cashType: z.literal("bank").default("bank"),
    currency: currencyEnum.default("IDR"),
    periodStart: z.string().min(1, vmsg("validation.periodStartRequired")),
    periodEnd: z.string().min(1, vmsg("validation.periodEndRequired")),
    openingBalance: z.coerce.number().default(0),
    closingBalance: z.coerce.number().default(0),
    note: z.string().max(500).trim().optional(),
  })
  .refine((d) => new Date(d.periodEnd) >= new Date(d.periodStart), {
    message: vmsg("validation.periodEndBeforeStart"),
    path: ["periodEnd"],
  });

/** One manually-entered statement line. `amount` is signed: + in, − out. */
export const statementLineSchema = z.object({
  date: z.string().min(1, vmsg("validation.dateRequired")),
  description: z.string().min(1, vmsg("validation.statementDescriptionRequired")).max(255).trim(),
  amount: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n !== 0, {
      message: vmsg("validation.statementAmountNonZero"),
    }),
});

/** Match a book movement to a statement line (or unmatch by lineId alone). */
export const matchSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  cashMovementId: z.coerce.number().int().positive(),
});

export const unmatchSchema = z.object({
  lineId: z.coerce.number().int().positive(),
});

export type BankStatementInput = z.infer<typeof bankStatementSchema>;
export type StatementLineInput = z.infer<typeof statementLineSchema>;
export type MatchInput = z.infer<typeof matchSchema>;
