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

const section = z.object({ lines: z.array(line), total: money });

const incomeStatement = z.object({
  kind: z.literal("income-statement"),
  period: z.string(),
  sales: section,
  cogs: section,
  grossProfit: money,
  operatingExpense: section,
  operatingProfit: money,
  otherIncome: section,
  otherExpense: section,
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

/**
 * Kartu Stok (issue #126). `quantity` is a plain finite number like `money` —
 * it may be negative (an oversold item, a correction) and is never re-rounded
 * here; `Decimal(15,3)` precision has to survive to the spreadsheet.
 */
const quantity = z.number().finite();

const stockMovement = z.object({
  kind: z.literal("stock-movement"),
  period: z.string(),
  rows: z.array(
    z.object({
      name: z.string(),
      unit: z.string().nullable(),
      opening: quantity,
      movedIn: quantity,
      movedOut: quantity,
      processed: quantity,
      closing: quantity,
    })
  ),
  totalOpening: quantity,
  totalIn: quantity,
  totalOut: quantity,
  totalProcessed: quantity,
  totalClosing: quantity,
  hasProcess: z.boolean(),
  dormantCount: z.number().int().nonnegative(),
});

export const statementPayloadSchema = z.discriminatedUnion("kind", [
  trialBalance,
  incomeStatement,
  balanceSheet,
  cashFlow,
  stockMovement,
]);

export type StatementPayloadInput = z.infer<typeof statementPayloadSchema>;
