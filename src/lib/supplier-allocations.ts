/**
 * Supplier payment → purchase allocation: the write-path guard.
 *
 * Allocation is *reporting* data. It records which purchase a payment settled so
 * that AP aging can stop guessing (issue #37); it is not an accounting event and
 * nothing in this module posts, reverses or otherwise touches the ledger. The
 * purchase and the payment are each already journalled on their own — a journal
 * for the link between them would be inventing a cash movement that never
 * happened, and would double the money.
 *
 * The database-side half of the over-allocation guard lives here, extracted from
 * the create route so that creating a payment with allocations (POST) and
 * re-allocating an existing one (PUT, issue #38) share one implementation. The
 * payload-side half — no duplicate purchase, no more than the payment is worth —
 * is `checkAllocationSet` in `validations/finance`. Two paths, one set of rules.
 *
 * Everything compared here is IDR base, for the reason set out in the header of
 * `receivables.ts`: a purchase and the payment settling it may be in different
 * currencies, and those are never added or compared raw.
 */
import { prisma } from "@/lib/prisma";
import { fxAmounts } from "@/lib/validations/fx";
import { getSupplierPurchaseAllocations } from "@/lib/receivables";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const MONEY_EPSILON = 0.005;

/** One validated allocation line, ready to persist. */
export interface ResolvedAllocationLine {
  purchaseId: number;
  /** Portion of the payment applied, in the PAYMENT's currency. */
  amount: number;
  /** The same portion in IDR, at the payment's own rate. */
  base: number;
}

export interface ResolveAllocationsInput {
  supplierId: number;
  /** The payment's currency — allocations are slices of it, so they share it. */
  currency: string;
  /** The payment's rate to IDR. Required for a foreign payment. */
  rate?: number;
  allocations: { purchaseId: number; amount: number }[];
  /**
   * Set when re-allocating an existing payment, so its current allocations do
   * not count against the room available to their own replacements.
   */
  excludePaymentId?: number;
  client?: typeof prisma;
}

export type ResolveAllocationsResult =
  | { ok: true; lines: ResolvedAllocationLine[] }
  | { ok: false; error: string };

/**
 * Check every allocation line against the database and convert it to IDR base.
 *
 * What the Zod schema cannot see is the other side of the link: whether each
 * target purchase exists, belongs to *this* supplier, has a usable IDR value,
 * and still has room. All four are settled here, before anything is written, so
 * a rejected allocation never leaves a half-applied state behind.
 *
 * Room is deliberately measured from **recorded allocations only** — the FIFO
 * estimate is never subtracted. FIFO is an assumption about payments nobody
 * allocated; letting a guess consume a purchase's room would stop a user from
 * recording the truth merely because the report had already speculated.
 */
export async function resolveAllocationLines(
  input: ResolveAllocationsInput
): Promise<ResolveAllocationsResult> {
  const { supplierId, currency, rate, allocations, excludePaymentId } = input;
  const client = input.client ?? prisma;

  if (allocations.length === 0) return { ok: true, lines: [] };

  const state = await getSupplierPurchaseAllocations(supplierId, client, { excludePaymentId });
  const byId = new Map(state.map((p) => [p.id, p]));
  const lines: ResolvedAllocationLine[] = [];

  for (const line of allocations) {
    const purchase = byId.get(line.purchaseId);
    if (!purchase) {
      return {
        ok: false,
        error: `Pembelian #${line.purchaseId} tidak ditemukan pada supplier ini.`,
      };
    }
    if (purchase.remainingBase == null) {
      // Foreign purchase with no rate: it has no IDR value, so "how much is
      // left" has no answer and no allocation against it can be checked.
      return {
        ok: false,
        error: `Pembelian #${line.purchaseId} belum punya kurs, sehingga sisa utangnya dalam IDR tidak diketahui. Isi kurs pembelian tersebut lebih dulu.`,
      };
    }

    // Convert the allocation to IDR at the PAYMENT's rate — the same rate the
    // ledger posted this payment at — then compare like with like. Currencies
    // are never added: both sides of this comparison are IDR base.
    const { baseAmount: lineBase } = fxAmounts(currency, line.amount, rate);

    if (lineBase > purchase.remainingBase + MONEY_EPSILON) {
      return {
        ok: false,
        error: `Alokasi ke pembelian #${line.purchaseId} (Rp ${lineBase.toLocaleString("id-ID")}) melebihi sisa utangnya (Rp ${purchase.remainingBase.toLocaleString("id-ID")}).`,
      };
    }

    lines.push({ purchaseId: line.purchaseId, amount: line.amount, base: lineBase });
    // Two lines in one payload could each fit alone but not together.
    byId.set(line.purchaseId, {
      ...purchase,
      remainingBase: purchase.remainingBase - lineBase,
    });
  }

  return { ok: true, lines };
}
