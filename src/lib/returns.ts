/**
 * Retur penjualan & pembelian — the pure arithmetic of "how much of an origin
 * document may still be returned" (issue #27).
 *
 * Pure module: no Prisma, no I/O — the same posture as `@/lib/tax` and
 * `@/lib/posting/rules`, so the over-return maths can be unit-tested without a
 * database and imported into Zod schemas. The DB side (summing prior returns) is
 * a thin lookup in the API route; this module only compares the numbers.
 *
 * THE ACCEPTANCE CRITERION THIS ENCODES: "tidak bisa meretur melebihi
 * kuantitas/nilai dokumen asal." A return may never exceed what the origin
 * document transacted, net of returns already made against it. For a sales
 * return the cap is per-line QUANTITY (an invoice has line items); for a purchase
 * return it is by net VALUE (a supplier purchase is a single amount, no lines).
 */
import { round2 } from "@/lib/posting/rules";

export type ReturnKind = "sales" | "purchase";

/**
 * Which way stock moves for a return: a sales return brings goods back IN, a
 * purchase return sends them back OUT. Pure so the direction is locked by a test
 * rather than only asserted in a route.
 */
export function stockDirectionForReturn(kind: ReturnKind): "in" | "out" {
  return kind === "sales" ? "in" : "out";
}

/** Raised when a requested return exceeds the origin document's remaining amount. */
export class OverReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverReturnError";
  }
}

/**
 * A whole cent / whole milli-unit is a real error; anything smaller is float
 * noise from summing Decimals through `Number`. Comparisons admit the noise and
 * reject the error.
 */
const EPSILON = 1e-6;

/** Round a quantity to 3 decimals (Decimal(15,3)), matching the DB column. */
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * How much of an origin amount is still returnable: origin minus what has
 * already been returned. Clamped at zero — a fully-returned line reads 0, never a
 * tiny negative from rounding.
 */
export function returnableRemaining(origin: number, alreadyReturned: number): number {
  const remaining = origin - alreadyReturned;
  return remaining > EPSILON ? remaining : 0;
}

/**
 * Does `requested` fit within `origin` net of `alreadyReturned`?
 * `decimals` picks the rounding grain: 3 for a quantity cap, 2 for a value cap.
 */
export function isWithinReturnable(
  origin: number,
  alreadyReturned: number,
  requested: number,
  decimals: 2 | 3 = 3
): boolean {
  const round = decimals === 2 ? round2 : round3;
  return round(requested) <= round(origin - alreadyReturned) + EPSILON;
}

export interface ReturnableCheck {
  /** What the user is returning (a line name, or the document number). */
  label: string;
  /** "unit" for a quantity cap, "IDR"/currency for a value cap — for the message. */
  unit?: string;
  origin: number;
  alreadyReturned: number;
  requested: number;
  /** 3 = quantity grain (default), 2 = money grain. */
  decimals?: 2 | 3;
}

/**
 * Throw `OverReturnError` unless `requested` is positive and within the remaining
 * returnable amount. The single choke point both server routes call before they
 * write anything, so an over-return never leaves a posted document behind.
 */
export function assertWithinReturnable(check: ReturnableCheck): void {
  const decimals = check.decimals ?? 3;
  const round = decimals === 2 ? round2 : round3;
  const requested = round(check.requested);
  if (requested <= 0) {
    throw new OverReturnError(
      `Jumlah retur untuk ${check.label} harus lebih besar dari nol.`
    );
  }
  const remaining = returnableRemaining(check.origin, check.alreadyReturned);
  if (!isWithinReturnable(check.origin, check.alreadyReturned, requested, decimals)) {
    const unit = check.unit ? ` ${check.unit}` : "";
    throw new OverReturnError(
      `Retur untuk ${check.label} melebihi sisa yang dapat diretur. ` +
        `Diminta ${round(requested)}${unit}, sisa yang dapat diretur ${round(remaining)}${unit} ` +
        `(dokumen asal ${round(check.origin)}${unit} dikurangi retur sebelumnya ` +
        `${round(check.alreadyReturned)}${unit}). Jurnal tidak diposting.`
    );
  }
}

/**
 * PPN reversed on a purchase return, proportional to the returned value.
 *
 * A supplier purchase stores only its net `amount` and its PPN `taxAmount`, not a
 * rate, so the effective rate is `taxAmount / amount` and the reversed PPN is
 * `returnedSubtotal × that`. Kept pure and separate so the proportional-tax rule
 * is unit-testable. A purchase with no PPN (`purchaseTax` 0) reverses 0 → the
 * posting engine emits no VAT leg, exactly like a 0%/export sales return.
 */
export function proportionalTax(
  returnedSubtotal: number,
  purchaseSubtotal: number,
  purchaseTax: number
): number {
  if (purchaseSubtotal <= 0 || purchaseTax <= 0) return 0;
  return round2((round2(returnedSubtotal) * round2(purchaseTax)) / round2(purchaseSubtotal));
}
