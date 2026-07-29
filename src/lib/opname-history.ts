/**
 * Riwayat Hitung Ulang Stok — past stock counts, grouped into sessions (issue #129).
 *
 * PURE. Takes the adjustment rows the reader fetched and folds them into one
 * entry per counting session; no database, so the grouping and the arithmetic
 * are unit-tested directly.
 *
 * ── Why a "session" is a DATE, not a record ─────────────────────────────────
 * A stock count has no table of its own. Submitting the opname form writes one
 * ordinary `stock_movement` per item that differed, all stamped with the date the
 * user entered and the marker note `OPNAME_ADJUSTMENT_NOTE`. So the count itself
 * is not stored anywhere — it only exists as the set of adjustments sharing a
 * date. Grouping by calendar day reconstructs it, and that is exactly as precise
 * as the data allows: two counts on the same day are indistinguishable and are
 * honestly reported as one session rather than invented as two.
 *
 * ── Signs mean direction, not magnitude ─────────────────────────────────────
 * An `in` adjustment means the shelf held MORE than the books did (surplus); an
 * `out` means less (shrinkage). Both are stored as positive quantities with a
 * type, so the sign is reattached here — a shortage must read as −40, because a
 * report where surplus and shrinkage look alike is worse than no report.
 */

/** One adjustment movement, as fetched: quantity always positive, direction in `type`. */
export interface OpnameAdjustmentInput {
  date: Date | string;
  itemName: string;
  unit: string | null;
  type: string;
  quantity: number;
}

export interface OpnameAdjustment {
  itemName: string;
  unit: string | null;
  /** Signed: positive = lebih (surplus), negative = susut (shrinkage). */
  variance: number;
}

export interface OpnameSession {
  /** `YYYY-MM-DD` — the calendar day the count was recorded against. */
  dateISO: string;
  adjustments: OpnameAdjustment[];
  /** Σ of positive variances on this day. */
  increase: number;
  /** Σ of negative variances, reported as a POSITIVE magnitude. */
  decrease: number;
}

export interface OpnameHistory {
  /** Newest session first — the last count is the one people look for. */
  sessions: OpnameSession[];
  sessionCount: number;
  /** Number of item-level adjustments across every session in the period. */
  adjustmentCount: number;
  totalIncrease: number;
  totalDecrease: number;
  /** totalIncrease − totalDecrease: the net quantity the counts added to the books. */
  netVariance: number;
}

/** Local calendar day of a date, as `YYYY-MM-DD`. */
function dayKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildOpnameHistory(rows: OpnameAdjustmentInput[]): OpnameHistory {
  const byDay = new Map<string, OpnameAdjustment[]>();

  for (const row of rows) {
    // `in` = lebih, `out` = susut. Any other type is not an opname outcome and
    // is skipped rather than guessed at — the same explicit-naming rule the
    // stock readers use, so an unrecognised type can never read as shrinkage.
    let variance: number;
    if (row.type === "in") variance = row.quantity;
    else if (row.type === "out") variance = -row.quantity;
    else continue;

    const key = dayKey(row.date);
    const bucket = byDay.get(key);
    const entry = { itemName: row.itemName, unit: row.unit, variance };
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  const sessions: OpnameSession[] = [...byDay.entries()]
    .map(([dateISO, adjustments]) => ({
      dateISO,
      // Within a day, largest discrepancies first — the rows worth explaining.
      adjustments: [...adjustments].sort(
        (a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.itemName.localeCompare(b.itemName)
      ),
      increase: adjustments.filter((a) => a.variance > 0).reduce((s, a) => s + a.variance, 0),
      decrease: adjustments.filter((a) => a.variance < 0).reduce((s, a) => s - a.variance, 0),
    }))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const totalIncrease = sessions.reduce((s, x) => s + x.increase, 0);
  const totalDecrease = sessions.reduce((s, x) => s + x.decrease, 0);

  return {
    sessions,
    sessionCount: sessions.length,
    adjustmentCount: sessions.reduce((s, x) => s + x.adjustments.length, 0),
    totalIncrease,
    totalDecrease,
    netVariance: totalIncrease - totalDecrease,
  };
}
