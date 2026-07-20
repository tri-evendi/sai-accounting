/**
 * Inventory costing — simple weighted average, as sanctioned by issue #9
 * ("awalnya boleh average sederhana dari Stock movement").
 *
 * Method: unit cost = Σ(qty_in × unit_cost_in) / Σ(qty_in), over every `in`
 * movement dated on or before the movement being costed. Outgoing movements are
 * valued at that average.
 *
 * KNOWN LIMITATIONS of this starting method — revisit if the business needs
 * FIFO/perpetual (issue #9 notes this may warrant its own issue):
 *   1. Not perpetual. The average is recomputed from the full purchase history
 *      each time rather than carried as a running balance, so a *backdated*
 *      purchase silently changes the cost of already-posted sales. Existing
 *      journals are not retro-corrected — repost the affected stock movements.
 *   2. No lot tracking. FIFO/LIFO and per-lot margins are not derivable.
 *   3. `in` rows with a NULL unit_cost are excluded from both numerator and
 *      denominator: costing what we know beats averaging in a fake zero.
 *   4. Costs are IDR only. Foreign-currency purchases must be converted before
 *      being stored in stock.unit_cost.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { round2 } from "./rules";

/**
 * Type-only Prisma import (no `@/lib/prisma` singleton) so the costing maths can
 * be imported and unit-tested without a DATABASE_URL.
 */
type Client = Prisma.TransactionClient | PrismaClient;

/** Minimal shape needed to cost a movement — keeps the maths unit-testable. */
export interface CostingMovement {
  quantity: number | string | { toString(): string };
  type: string;
  unitCost?: number | string | { toString(): string } | null;
}

const num = (v: CostingMovement["quantity"] | null | undefined): number =>
  v == null ? 0 : Number(v);

/**
 * Weighted-average unit cost (IDR) from a set of movements. Pure — callers pass
 * the movements already filtered to the item and date window.
 * Returns 0 when nothing is costed, which callers treat as "nothing to post".
 */
export function weightedAverageUnitCost(movements: CostingMovement[]): number {
  let qty = 0;
  let value = 0;

  for (const m of movements) {
    if (m.type !== "in") continue;
    const unitCost = m.unitCost == null ? null : num(m.unitCost);
    if (unitCost == null) continue; // limitation 3: uncosted rows are excluded
    const q = num(m.quantity);
    if (q <= 0) continue;
    qty += q;
    value += q * unitCost;
  }

  if (qty <= 0) return 0;
  return round2(value / qty);
}

/** Total IDR cost of an outgoing movement, at the weighted average. */
export function costOfMovement(quantity: number, unitCost: number): number {
  return round2(Math.abs(quantity) * unitCost);
}

/**
 * DB-backed lookup: weighted-average unit cost for an item as of a date.
 * Thin on purpose — the arithmetic lives in weightedAverageUnitCost().
 */
export async function averageUnitCostForItem(
  itemId: number,
  asOf: Date,
  client: Client
): Promise<number> {
  const movements = await client.stock.findMany({
    where: { itemId, type: "in", date: { lte: asOf } },
    select: { quantity: true, type: true, unitCost: true },
  });
  return weightedAverageUnitCost(movements);
}
