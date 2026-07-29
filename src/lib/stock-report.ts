/**
 * Reader for Kartu Stok / Mutasi (issue #126).
 *
 * Thin on purpose: two aggregates and the item master, handed straight to the
 * pure `buildStockMovementReport`. All the arithmetic lives there so it can be
 * tested without a database.
 *
 * ── Two disjoint aggregates, not one scan ───────────────────────────────────
 * Opening balance needs every movement STRICTLY BEFORE the period; the report
 * body needs exactly the movements inside it. Expressed as two GROUP BY queries
 * with `{ lt: from }` and `{ gte: from, lte: to }`, the two sets cannot overlap
 * and cannot leave a gap, so `saldo awal + masuk − keluar = saldo akhir` holds by
 * construction rather than by careful bookkeeping in application code.
 *
 * This deliberately does NOT stream every movement row the way `/inventory` does.
 * That page must, because weighted-average costing needs each `in` with its unit
 * cost one at a time. A quantity report needs only sums, and `@@index([itemId,
 * date])` serves exactly this shape.
 */
import { prisma } from "@/lib/prisma";
import { OPNAME_ADJUSTMENT_NOTE } from "@/lib/constants";
import {
  buildStockMovementReport,
  type StockMovementReport,
  type StockTotalRow,
} from "@/lib/stock-movement";
import { buildOpnameHistory, type OpnameHistory } from "@/lib/opname-history";

type Client = typeof prisma;

/** Sum quantity per (item, type) for a journal-free date window. */
async function stockTotals(
  where: { date: { lt: Date } | { gte: Date; lte: Date } },
  client: Client
): Promise<StockTotalRow[]> {
  const grouped = await client.stockMovement.groupBy({
    by: ["itemId", "type"],
    _sum: { quantity: true },
    where,
  });
  return grouped.map((g) => ({
    itemId: g.itemId,
    type: g.type,
    quantity: Number(g._sum.quantity ?? 0),
  }));
}

/**
 * Kartu Stok for an inclusive [from, to] window.
 *
 * Items come back in name order — the order the Stok page already lists them in,
 * so a user moving between the two reads the same sequence.
 */
export async function getStockMovementReport(
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<StockMovementReport> {
  const [items, openingTotals, periodTotals] = await Promise.all([
    client.item.findMany({
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    stockTotals({ date: { lt: from } }, client),
    stockTotals({ date: { gte: from, lte: to } }, client),
  ]);

  return buildStockMovementReport(items, openingTotals, periodTotals);
}

/**
 * Riwayat Hitung Ulang Stok for an inclusive [from, to] window (issue #129).
 *
 * Opname has no table of its own: a count exists only as the stock movements it
 * produced, marked with `OPNAME_ADJUSTMENT_NOTE`. Matching on that constant — the
 * same one the write path stamps — is what keeps the two halves from drifting
 * into a history that is silently always empty.
 *
 * `note` is an exact match, not a `contains`: a user-typed note that merely
 * mentions the phrase in a manual adjustment must not be dressed up as a
 * stock count that never happened.
 */
export async function getOpnameHistory(
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<OpnameHistory> {
  const rows = await client.stockMovement.findMany({
    where: { note: OPNAME_ADJUSTMENT_NOTE, date: { gte: from, lte: to } },
    select: {
      date: true,
      type: true,
      quantity: true,
      item: { select: { name: true, unit: true } },
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });

  return buildOpnameHistory(
    rows.map((r) => ({
      date: r.date,
      itemName: r.item.name,
      unit: r.item.unit,
      type: r.type,
      quantity: Number(r.quantity),
    }))
  );
}
