/**
 * Plain-language dashboard summary (issue #3).
 *
 * The dashboard's top layer answers five questions an owner actually asks —
 * how much came in, how much went out, did we end up ahead, who has not paid us,
 * what do we still owe — without using an accounting word to do it. It computes
 * *nothing* of its own: every figure is read from the report that owns it
 * (`@/lib/reports` for the income statement, `@/lib/receivables` for AR/AP) and
 * every card links back to that report. This file only holds the two pure pieces
 * needed to keep that promise honest.
 *
 * ── Why `monthRange` returns both Dates and ISO strings ──────────────────────
 * "Traceable to its source report" is the acceptance criterion, and a card that
 * shows one period while its link opens another quietly fails it. So the ISO
 * strings are the source of truth: they are what the link carries, and the Dates
 * are parsed back out of them exactly the way `/reports/income-statement` parses
 * its own `?from=&to=` params. Following the link therefore re-runs the query the
 * card ran, and the two numbers cannot drift apart.
 *
 * ── Currency ─────────────────────────────────────────────────────────────────
 * Cross-document sums are IDR base only — see the header of `@/lib/receivables`
 * for why, and for what happens to a foreign row with no rate. `summarizeByCurrency`
 * does not soften that rule: it splits documents by the currency they were written
 * in, but each group's total is still IDR base, and a row with no determinable IDR
 * value is counted in `unresolved` rather than summed at face value.
 */

/** The calendar month containing `now`, as both link params and query bounds. */
export interface MonthRange {
  /** Inclusive start, 00:00:00.000 local. */
  from: Date;
  /** Inclusive end, 23:59:59.999 local. */
  to: Date;
  /** `YYYY-MM-DD` for the `?from=` link param. */
  fromISO: string;
  /** `YYYY-MM-DD` for the `?to=` link param. */
  toISO: string;
  /** Human label, e.g. "Juli 2026". */
  label: string;
}

/**
 * Local `YYYY-MM-DD`. Deliberately not `toISOString()`, which shifts to UTC and
 * hands back the previous day for anywhere east of Greenwich — including here.
 */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Bounds of the calendar month containing `now`.
 *
 * Day 0 of the next month is the last day of this one, which sidesteps every
 * month-length and leap-year special case. The Dates are re-parsed from the ISO
 * strings rather than built directly, so they are identical to what the income
 * statement page derives from the same params — see the file header.
 */
export function monthRange(now: Date): MonthRange {
  const fromISO = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const toISO = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return {
    fromISO,
    toISO,
    from: new Date(`${fromISO}T00:00:00`),
    to: new Date(`${toISO}T23:59:59.999`),
    label: new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(now),
  };
}

/** Outstanding documents of one document currency, valued in IDR base. */
export interface CurrencyBreakdownRow {
  /** The currency the documents were written in — not the currency of the total. */
  currency: string;
  /** Documents in this currency, including any with no usable rate. */
  count: number;
  /** Sum of their outstanding balances **in IDR base**. */
  outstandingBase: number;
  /** How many of `count` had no determinable IDR value and are missing above. */
  unresolved: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split outstanding documents by the currency they were issued in.
 *
 * This is the "tampilkan per mata uang" the issue asks for, done the only way it
 * can be done honestly for a cross-document balance: the *grouping* is by document
 * currency, but the *total* stays IDR base. Adding USD balances into a USD total
 * would be the mixed-currency bug the receivables header exists to prevent — a
 * USD invoice part-paid in rupiah has no USD remainder to report.
 *
 * A foreign document with no rate contributes to `count` and `unresolved` but not
 * to `outstandingBase`, so the UI can say how many rows its total is missing
 * instead of showing a number that is quietly short.
 */
export function summarizeByCurrency(
  rows: { currency: string; outstandingBase: number | null }[]
): CurrencyBreakdownRow[] {
  const byCurrency = new Map<string, CurrencyBreakdownRow>();

  for (const r of rows) {
    const entry = byCurrency.get(r.currency) ?? {
      currency: r.currency,
      count: 0,
      outstandingBase: 0,
      unresolved: 0,
    };
    entry.count += 1;
    if (r.outstandingBase == null) entry.unresolved += 1;
    else entry.outstandingBase += r.outstandingBase;
    byCurrency.set(r.currency, entry);
  }

  return [...byCurrency.values()]
    .map((e) => ({ ...e, outstandingBase: round2(e.outstandingBase) }))
    .sort((a, b) =>
      b.outstandingBase !== a.outstandingBase
        ? b.outstandingBase - a.outstandingBase
        : a.currency.localeCompare(b.currency)
    );
}
