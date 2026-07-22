/**
 * Anggaran & Target payload validation — issue #29.
 *
 * Whatever is knowable from the payload alone lives here; whatever needs the
 * database (does the account/customer/item exist) is enforced by the route and
 * the FK. Budgets/targets are IDR-only, so there is no currency/rate field.
 */
import { z } from "zod";

const year = z.coerce.number().int().min(2000).max(2100);
const month = z.coerce.number().int().min(1).max(12);
/** IDR base amount. Non-negative — a plan is never a negative number here. */
const money = z.coerce.number().nonnegative().max(9_999_999_999_999);
const optionalId = z.coerce.number().int().positive().optional().nullable();
const note = z.string().max(1000).trim().optional();

/** Create/upsert one budget: an account's planned amount for one month. */
export const budgetSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  year,
  month,
  amount: money,
  note,
});
export type BudgetInput = z.infer<typeof budgetSchema>;

/** Create/upsert one sales target for a period, optionally per customer/item. */
export const salesTargetSchema = z.object({
  year,
  month,
  customerId: optionalId,
  itemId: optionalId,
  amount: money,
  note,
});
export type SalesTargetInput = z.infer<typeof salesTargetSchema>;
