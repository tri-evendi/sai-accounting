/**
 * Surat Jalan / Delivery Order — pure maths + the next-number helper (issue #14).
 *
 * The exported arithmetic (kg per line, per-item totals, the over-issue guard)
 * has NO Prisma and NO I/O — the same posture as `@/lib/returns` and
 * `@/lib/posting/rules`, so it can be unit-tested without a DATABASE_URL and
 * imported into Zod. The one DB-touching helper (`nextDeliveryOrderNo`) takes a
 * type-only client, exactly like `@/lib/posting/cogs`.
 *
 * WHY KG IS THE STOCK UNIT: HPP in this app is recognised only on a `stock`
 * movement of type `out`, valued at a weighted-average `unit_cost` that is IDR
 * per unit; contracts price per kg (`price_per_kg`). Kg is therefore the fungible
 * unit stock is costed in, so a surat jalan reduces stock by KG — total
 * `bags × kg_per_bag` — not by whole bags. The whole line (bags + kg/bag) is kept
 * on the document; only the kg total drives the stock-out and the over-issue check.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Type-only client (no `@/lib/prisma` singleton) so number-gen stays importable. */
type Client = Prisma.TransactionClient | PrismaClient;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** A whole milli-unit is a real shortfall; smaller is float noise (see returns.ts). */
const EPSILON = 1e-6;

/** Round a quantity to 3 decimals (Decimal(15,3)), matching the DB column. */
export const round3 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1000) / 1000;

/** The bags/kg shape of one surat-jalan line (mirrors ContractItem). */
export interface DeliveryLineQty {
  bags: number | string;
  kgPerBag: number | string;
}

/** Kg removed from stock for ONE line = bags × kg/bag, rounded to the DB grain. */
export function lineStockKg(line: DeliveryLineQty): number {
  return round3(num(line.bags) * num(line.kgPerBag));
}

/** One surat-jalan line, enough to total a DO and check availability. */
export interface DeliveryLine extends DeliveryLineQty {
  itemId: number;
  itemName?: string;
}

/**
 * Total kg requested per `itemId` across a DO's lines — several lines may name
 * the same item, so the over-issue guard is measured on the summed demand, never
 * line by line.
 */
export function sumRequestedKgByItem(lines: DeliveryLine[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const l of lines) {
    map.set(l.itemId, round3(num(map.get(l.itemId)) + lineStockKg(l)));
  }
  return map;
}

/** One item that cannot be fully issued: what was asked vs what is on hand. */
export interface StockShortfall {
  itemId: number;
  itemName: string;
  requested: number;
  available: number;
}

/** Raised when a surat jalan would drive an item's stock negative. */
export class OverIssueError extends Error {
  readonly shortfalls: StockShortfall[];
  constructor(shortfalls: StockShortfall[]) {
    const detail = shortfalls
      .map(
        (s) =>
          `${s.itemName} (diminta ${round3(s.requested)} kg, tersedia ${round3(
            s.available
          )} kg)`
      )
      .join("; ");
    super(
      `Stok tidak cukup untuk menerbitkan surat jalan: ${detail}. ` +
        `Surat jalan tidak dibuat dan stok tidak berkurang.`
    );
    this.name = "OverIssueError";
    this.shortfalls = shortfalls;
  }
}

/**
 * Which items in `requested` exceed the kg `available`. Pure — the caller sums
 * prior stock movements into `available` and the DO lines into `requested`.
 * Mirrors the manual stock-out guard in `/api/inventory`: the app already refuses
 * to drive stock negative, so a surat jalan matches that convention out loud.
 */
export function findStockShortfalls(
  requested: { itemId: number; itemName: string; kg: number }[],
  available: Map<number, number>
): StockShortfall[] {
  const short: StockShortfall[] = [];
  for (const r of requested) {
    const have = round3(num(available.get(r.itemId)));
    if (round3(r.kg) > have + EPSILON) {
      short.push({
        itemId: r.itemId,
        itemName: r.itemName,
        requested: round3(r.kg),
        available: have,
      });
    }
  }
  return short;
}

/**
 * Throw `OverIssueError` if any requested item exceeds what is on hand. The single
 * choke point the route calls before it writes anything, so an over-issue never
 * leaves a posted surat jalan (or a COGS journal) behind.
 */
export function assertStockAvailable(
  requested: { itemId: number; itemName: string; kg: number }[],
  available: Map<number, number>
): void {
  const short = findStockShortfalls(requested, available);
  if (short.length > 0) throw new OverIssueError(short);
}

/**
 * Document number: `SJ.YYYY.MM.NNNNN` (surat jalan) — UNIQUE, count-derived,
 * mirroring `nextSalesReturnNo`. The `SJ.` prefix matches the file name the
 * legacy shipping PDF already saved (`SuratJalan_…`).
 */
export async function nextDeliveryOrderNo(tx: Client, date: Date): Promise<string> {
  const prefix = `SJ.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const count = await tx.deliveryOrder.count({ where: { no: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}
