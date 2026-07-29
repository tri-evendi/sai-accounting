/**
 * Kartu Stok / Mutasi — the period stock report (issue #126).
 *
 * PURE. Takes the two GROUP BY results the reader already fetched and turns them
 * into rows; touches no database, so the arithmetic below is unit-tested directly
 * (`tests/stock-movement.test.ts`).
 *
 * ── Why opening/closing and not "total masuk & keluar" ──────────────────────
 * The Stok page answers "how much do I have right now" and is deliberately
 * period-less. The moment a period is introduced, in/out totals stop being
 * self-explaining: 400 in and 650 out over July says nothing about whether the
 * warehouse ran dry unless you know where it started. Worse, showing a period's
 * in/out beside a LIFETIME balance produces a row whose columns answer two
 * different questions — the figures are each correct and the row as a whole is a
 * lie. So a period report carries its own bookends:
 *
 *     saldo awal + masuk − keluar = saldo akhir
 *
 * which is checkable on every single row, and is what a Kartu Stok is.
 *
 * ── `process` is counted, never netted (issue #111) ─────────────────────────
 * Only `in` adds to the balance and only `out` subtracts — the exact rule in
 * `calculateStockTotals` and `stockLevelsFromTotals`. Goods marked `process` are
 * being worked on and still belong to the company, so subtracting them would
 * delete stock that physically exists.
 *
 * But they are NOT dropped either: they get their own column, shown only when the
 * period actually contains one. A movement that exists in the books and appears
 * nowhere in the report is the failure this codebase keeps guarding against —
 * and a company that never processes anything should not have to read an empty
 * column to learn that.
 */

/** One row of a GROUP BY over `stock_movements` (itemId × type). */
export interface StockTotalRow {
  itemId: number;
  type: string;
  quantity: number;
}

export interface StockMovementItem {
  id: number;
  name: string;
  unit: string | null;
}

export interface StockMovementRow extends StockMovementItem {
  /** Balance carried in from before the period: Σin − Σout over all earlier dates. */
  opening: number;
  movedIn: number;
  movedOut: number;
  /** Quantity marked `process` within the period. Never nets against the balance. */
  processed: number;
  /** opening + movedIn − movedOut. */
  closing: number;
}

export interface StockMovementReport {
  rows: StockMovementRow[];
  totalOpening: number;
  totalIn: number;
  totalOut: number;
  totalProcessed: number;
  totalClosing: number;
  /** True when the period contains any `process` movement — drives the extra column. */
  hasProcess: boolean;
  /** Rows whose opening, movements and closing are all zero, hidden from `rows`. */
  dormantCount: number;
}

/** Fold a GROUP BY result into per-item in/out/process sums. */
function tally(totals: StockTotalRow[]): Map<number, { in: number; out: number; process: number }> {
  const byItem = new Map<number, { in: number; out: number; process: number }>();
  for (const row of totals) {
    const entry = byItem.get(row.itemId) ?? { in: 0, out: 0, process: 0 };
    // Named explicitly rather than `else` — an unknown type must not silently
    // behave like an outflow, which is precisely the bug issue #111 fixed.
    if (row.type === "in") entry.in += row.quantity;
    else if (row.type === "out") entry.out += row.quantity;
    else if (row.type === "process") entry.process += row.quantity;
    byItem.set(row.itemId, entry);
  }
  return byItem;
}

/**
 * Build the report.
 *
 * `openingTotals` must cover every movement STRICTLY BEFORE the period and
 * `periodTotals` exactly the movements inside it — the reader guarantees that
 * with two disjoint date filters, so no movement is counted twice or missed.
 *
 * Items that neither held nor moved stock in the period are dropped from `rows`
 * but counted in `dormantCount`. A trading company's item master outlives the
 * commodities it still deals in; printing forty all-zero rows buries the six that
 * moved. The count keeps that omission visible instead of silent.
 */
export function buildStockMovementReport(
  items: StockMovementItem[],
  openingTotals: StockTotalRow[],
  periodTotals: StockTotalRow[]
): StockMovementReport {
  const opening = tally(openingTotals);
  const period = tally(periodTotals);

  const rows: StockMovementRow[] = [];
  let dormantCount = 0;

  for (const item of items) {
    const o = opening.get(item.id) ?? { in: 0, out: 0, process: 0 };
    const p = period.get(item.id) ?? { in: 0, out: 0, process: 0 };
    const openingBalance = o.in - o.out;
    const closing = openingBalance + p.in - p.out;

    if (openingBalance === 0 && p.in === 0 && p.out === 0 && p.process === 0) {
      dormantCount += 1;
      continue;
    }

    rows.push({
      ...item,
      opening: openingBalance,
      movedIn: p.in,
      movedOut: p.out,
      processed: p.process,
      closing,
    });
  }

  const sum = (pick: (r: StockMovementRow) => number) => rows.reduce((s, r) => s + pick(r), 0);

  return {
    rows,
    totalOpening: sum((r) => r.opening),
    totalIn: sum((r) => r.movedIn),
    totalOut: sum((r) => r.movedOut),
    totalProcessed: sum((r) => r.processed),
    totalClosing: sum((r) => r.closing),
    hasProcess: rows.some((r) => r.processed !== 0),
    dormantCount,
  };
}
