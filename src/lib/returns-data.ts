/**
 * DB-side companion to the pure `@/lib/returns` maths (issue #27): how much of an
 * origin document has ALREADY been returned, and the next return number.
 *
 * Kept thin and separate from `@/lib/returns` so the over-return arithmetic stays
 * pure and unit-testable; this module only sums prior returns out of the database
 * and hands the numbers to `assertWithinReturnable`.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Quantity already returned per `invoice_item_id`, across every NON-canceled
 * sales return of the given invoice. A canceled return does not consume any of
 * the returnable quantity, so it is excluded — the same posture the journal takes
 * (a canceled return posts nothing).
 */
export async function priorReturnedByInvoiceItem(
  invoiceId: number,
  client: Client = prisma
): Promise<Map<number, number>> {
  const rows = await client.salesReturnItem.findMany({
    where: { salesReturn: { invoiceId, status: { not: "canceled" } } },
    select: { invoiceItemId: true, quantity: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.invoiceItemId, num(map.get(r.invoiceItemId)) + num(r.quantity));
  }
  return map;
}

/**
 * Net value (Σ subtotal) already returned against a purchase, across every
 * NON-canceled purchase return of it. A purchase has no line items, so its
 * over-return cap is by value; this is the "already returned" side of it.
 */
export async function priorReturnedPurchaseSubtotal(
  purchaseId: number,
  client: Client = prisma
): Promise<number> {
  const rows = await client.purchaseReturn.findMany({
    where: { purchaseId, status: { not: "canceled" } },
    select: { subtotal: true },
  });
  return rows.reduce((s, r) => s + num(r.subtotal), 0);
}

/** Document number: `RSJ.YYYY.MM.NNNNN` (retur sales) — UNIQUE, count-derived. */
export async function nextSalesReturnNo(
  tx: Prisma.TransactionClient,
  date: Date
): Promise<string> {
  const prefix = `RSJ.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const count = await tx.salesReturn.count({ where: { returnNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/** Document number: `RSB.YYYY.MM.NNNNN` (retur beli) — UNIQUE, count-derived. */
export async function nextPurchaseReturnNo(
  tx: Prisma.TransactionClient,
  date: Date
): Promise<string> {
  const prefix = `RSB.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  const count = await tx.purchaseReturn.count({ where: { returnNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}
