import { z } from "zod";
// Pure module (no Prisma singleton) — safe to pull into schemas that client
// components import.
import { round2 } from "@/lib/posting/rules";

/** Currencies the app transacts in. IDR is the reporting/base currency. */
export const CURRENCY_VALUES = ["USD", "CNY", "IDR"] as const;
export const currencyEnum = z.enum(CURRENCY_VALUES);
export type CurrencyCode = (typeof CURRENCY_VALUES)[number];

export const BASE_CURRENCY: CurrencyCode = "IDR";

/**
 * Exchange rate to IDR. Optional in the schema, but `requireRateForForeign`
 * makes it mandatory whenever the currency isn't IDR — the posting engine
 * refuses to guess a rate, and booking USD at 1:1 would silently wreck the
 * ledger. Decimal(18,6) in the DB.
 */
export const rateField = z.coerce
  .number()
  .positive("Kurs harus lebih besar dari 0")
  .optional();

/**
 * Reject a foreign-currency amount that carries no rate, at validation time
 * (400 with a field error) rather than letting the posting engine throw later.
 */
export function requireRateForForeign(
  data: { currency?: string; rate?: number },
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["rate"]
) {
  if (data.currency && data.currency !== BASE_CURRENCY && !data.rate) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `Kurs ke ${BASE_CURRENCY} wajib diisi untuk mata uang ${data.currency}.`,
    });
  }
}

/**
 * Rate + IDR base value to persist alongside a foreign-currency amount.
 * IDR is always 1:1. Callers have already been through `requireRateForForeign`,
 * so a missing rate here can only mean a non-validated call path — throw rather
 * than default to 1.
 */
export function fxAmounts(
  currency: string,
  amount: number,
  rate?: number
): { rate: number; baseAmount: number } {
  if (currency === BASE_CURRENCY) return { rate: 1, baseAmount: round2(amount) };
  if (!rate || rate <= 0) {
    throw new Error(`Kurs ke ${BASE_CURRENCY} wajib diisi untuk mata uang ${currency}.`);
  }
  return { rate, baseAmount: round2(amount * rate) };
}
