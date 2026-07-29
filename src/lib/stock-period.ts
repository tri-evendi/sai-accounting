/**
 * Minggu / Bulan / Tahun — the period selector behind Kartu Stok (issue #126).
 *
 * ── Why an ANCHOR DATE and not (year, month) ────────────────────────────────
 * The three granularities have to share one URL shape or the "◀ sebelumnya /
 * berikutnya ▶" control would need different parameters per granularity, and
 * switching from Bulan to Minggu would lose where the user was. So the URL
 * carries a granularity plus a single anchor date, and each granularity widens
 * that one date into its own bounds. Switching granularity keeps the anchor, so
 * "Juli 2026" → Minggu lands on the week containing that anchor rather than
 * dumping the user back on today.
 *
 * ── Weeks are ISO-8601 (Monday–Sunday) ──────────────────────────────────────
 * Nothing in this codebase knew about weeks before this file — `period.ts` only
 * ever dealt in months and years. ISO-8601 is the rule chosen here: weeks run
 * Monday to Sunday, and week 1 is the one containing the first Thursday of the
 * year. That matches the Indonesian working week and is the only week
 * definition that is stable across years; "the first 7 days of January" is not.
 *
 * ── Bounds are inclusive and local ──────────────────────────────────────────
 * `from` is 00:00:00.000 of the first day, `to` is 23:59:59.999 of the last, in
 * the server's local zone — identical to `resolvePeriod` and `periodBounds`, so
 * a movement dated on a boundary day falls in exactly one period no matter which
 * reader asks. Invalid input never produces an `Invalid Date`: it falls back to
 * the period containing today, because a report showing the wrong period is a
 * bug the user can see, while `Invalid Date` poisons every figure silently.
 */
import { toISODate } from "@/lib/dashboard-summary";
import { isValidISODate } from "@/lib/report-catalog";

export const STOCK_PERIOD_GRANULARITIES = ["week", "month", "year", "custom"] as const;
export type StockPeriodGranularity = (typeof STOCK_PERIOD_GRANULARITIES)[number];

export function isStockPeriodGranularity(value: string): value is StockPeriodGranularity {
  return (STOCK_PERIOD_GRANULARITIES as readonly string[]).includes(value);
}

export interface StockPeriod {
  granularity: StockPeriodGranularity;
  from: Date;
  to: Date;
  fromISO: string;
  toISO: string;
  /** The date the period was widened from; carried across granularity switches. */
  anchorISO: string;
  /** Anchors for the ◀ / ▶ steppers. Both null for `custom` — there is nothing to step. */
  prevAnchorISO: string | null;
  nextAnchorISO: string | null;
  /** ISO-8601 week number, only meaningful when granularity is `week`. */
  weekNumber: number | null;
  year: number;
  /** 1–12, the anchor's month. Only meaningful when granularity is `month`. */
  month: number;
}

const DAY_MS = 86_400_000;

/** Monday of the ISO week containing `date`, at 00:00 local. */
export function startOfISOWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): Sunday = 0. Shift so Monday = 0, Sunday = 6.
  const dayIndex = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayIndex);
  return d;
}

/**
 * ISO-8601 week number (1–53).
 *
 * Anchored on the week's THURSDAY, which is what makes the turn of the year come
 * out right: 1 January can belong to week 52 of the previous year, and 31
 * December to week 1 of the next. Counting "days since 1 January ÷ 7" gets both
 * wrong. Rounding rather than flooring the week span absorbs the one-hour drift
 * a daylight-saving boundary would otherwise introduce.
 */
export function isoWeekNumber(date: Date): number {
  const thursday = startOfISOWeek(date);
  thursday.setDate(thursday.getDate() + 3);
  const firstThursday = startOfISOWeek(new Date(thursday.getFullYear(), 0, 4));
  firstThursday.setDate(firstThursday.getDate() + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Parse an anchor param, falling back to `now` for anything that is not a real date. */
function parseAnchor(raw: string | undefined, now: Date): Date {
  if (raw && isValidISODate(raw)) return new Date(`${raw}T00:00:00`);
  return startOfDay(now);
}

/**
 * Widen `?g=&d=` (or `?from=&to=` when `g=custom`) into inclusive bounds.
 *
 * Defaults to the month containing today — the period a user opening the report
 * cold almost always means, and the one whose figures they can still act on.
 */
export function resolveStockPeriod(
  granularityRaw: string | undefined,
  anchorRaw: string | undefined,
  fromRaw?: string,
  toRaw?: string,
  now: Date = new Date()
): StockPeriod {
  const granularity: StockPeriodGranularity =
    granularityRaw && isStockPeriodGranularity(granularityRaw) ? granularityRaw : "month";
  const anchor = parseAnchor(anchorRaw, now);

  let from: Date;
  let to: Date;
  let prev: Date | null;
  let next: Date | null;

  if (granularity === "week") {
    from = startOfISOWeek(anchor);
    to = endOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6));
    prev = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7);
    next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  } else if (granularity === "year") {
    from = new Date(anchor.getFullYear(), 0, 1, 0, 0, 0, 0);
    to = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999);
    prev = new Date(anchor.getFullYear() - 1, 0, 1);
    next = new Date(anchor.getFullYear() + 1, 0, 1);
  } else if (granularity === "custom") {
    // A half-supplied range is not an error: the missing end falls back to the
    // anchor's month, so the report still shows a real period rather than nothing.
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    from = fromRaw && isValidISODate(fromRaw) ? new Date(`${fromRaw}T00:00:00`) : monthStart;
    to = toRaw && isValidISODate(toRaw) ? new Date(`${toRaw}T23:59:59.999`) : monthEnd;
    // A reversed range would silently report nothing; swap it instead.
    if (from.getTime() > to.getTime()) {
      const swap = from;
      from = startOfDay(to);
      to = endOfDay(swap);
    }
    prev = null;
    next = null;
  } else {
    from = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    prev = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  }

  return {
    granularity,
    from,
    to,
    fromISO: toISODate(from),
    toISO: toISODate(to),
    anchorISO: toISODate(anchor),
    prevAnchorISO: prev ? toISODate(prev) : null,
    nextAnchorISO: next ? toISODate(next) : null,
    weekNumber: granularity === "week" ? isoWeekNumber(from) : null,
    year: from.getFullYear(),
    month: anchor.getMonth() + 1,
  };
}
