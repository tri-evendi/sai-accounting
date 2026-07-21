/**
 * Validation for the statement-export payload (issue #19).
 *
 * The Excel export API is handed the *same* serialisable `StatementPayload` the
 * report page built for its PDF button — this schema is the trust boundary that
 * turns that untyped JSON back into a known shape before `@/lib/report-export`
 * maps it to a sheet. It intentionally mirrors `StatementPayload` in
 * `@/lib/pdf/statement-pdf`; the `satisfies` check in the route keeps the two in
 * lock-step at compile time. Money fields are plain finite numbers (they may be
 * negative — a loss, a contra-asset), never re-rounded here.
 */
import { z } from "zod";

const money = z.number().finite();
const line = z.object({ code: z.string(), name: z.string(), amount: money });

const trialBalance = z.object({
  kind: z.literal("trial-balance"),
  period: z.string(),
  rows: z.array(z.object({ code: z.string(), name: z.string(), debit: money, credit: money })),
  totalDebit: money,
  totalCredit: money,
  balanced: z.boolean(),
});

const incomeStatement = z.object({
  kind: z.literal("income-statement"),
  period: z.string(),
  revenue: z.array(line),
  expense: z.array(line),
  totalRevenue: money,
  totalExpense: money,
  netIncome: money,
});

const balanceSheet = z.object({
  kind: z.literal("balance-sheet"),
  period: z.string(),
  assets: z.array(line),
  liabilities: z.array(line),
  equity: z.array(line),
  totalAssets: money,
  totalLiabilities: money,
  totalEquity: money,
  netIncome: money,
  totalLiabilitiesEquity: money,
  balanced: z.boolean(),
});

const cashFlow = z.object({
  kind: z.literal("cash-flow"),
  period: z.string(),
  groups: z.array(
    z.object({
      label: z.string(),
      lines: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          inflow: money,
          outflow: money,
          net: money,
        })
      ),
      inflow: money,
      outflow: money,
      net: money,
    })
  ),
  totalInflow: money,
  totalOutflow: money,
  netChange: money,
  openingCash: money,
  closingCash: money,
  reconciled: z.boolean(),
  suspectUnrated: z.number().int().nonnegative(),
});

export const statementPayloadSchema = z.discriminatedUnion("kind", [
  trialBalance,
  incomeStatement,
  balanceSheet,
  cashFlow,
]);

export type StatementPayloadInput = z.infer<typeof statementPayloadSchema>;
