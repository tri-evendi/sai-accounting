/**
 * Penyusutan aset tetap — PURE math (issue #28).
 *
 * No Prisma, no I/O, no clock. Everything the schedule needs (cost, residual,
 * useful life, running accumulated) is passed in, which is what makes the
 * straight-line arithmetic — including the final-period true-up — unit-testable
 * without a database. The posting glue in `@/lib/fixed-assets` reads asset rows
 * and calls these; the ledger side lives in `@/lib/posting/rules`.
 *
 * ── UNIT OF USEFUL LIFE: MONTHS ──────────────────────────────────────────────
 * Useful life is stored and reasoned about in MONTHS, because a periodic run is
 * monthly: the natural depreciation period is one calendar month, so a
 * months-denominated life makes "amount per period" a plain division with no
 * re-derivation. A category expressed in years is multiplied by 12 at the edge
 * (the form), never here.
 *
 * ── STRAIGHT-LINE ONLY (garis lurus dulu, per the issue) ─────────────────────
 * `method` is carried so the model and UI can name it, but only `straight_line`
 * is implemented. An unknown method throws rather than silently straight-lining.
 *
 * ── ALWAYS IDR ───────────────────────────────────────────────────────────────
 * Fixed assets are scoped to IDR (see the model note in prisma/schema.prisma and
 * @/lib/fixed-assets): `cost`, `residualValue` and every amount here are IDR base.
 * There is no rate and no cross-currency addition to guard against.
 */

/** Cents-accurate rounding — never trust raw float arithmetic on money. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
export const MONEY_EPSILON = 0.005;

export const DEPRECIATION_METHODS = ["straight_line"] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "Garis Lurus",
};

/** Raised when a depreciation input cannot yield a correct schedule. */
export class DepreciationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepreciationError";
  }
}

export interface DepreciationParams {
  /** Acquisition cost in IDR (> 0). */
  cost: number;
  /** Residual / salvage value in IDR (>= 0, <= cost). */
  residualValue: number;
  /** Useful life in months (integer > 0). */
  usefulLifeMonths: number;
  /** Only `straight_line` is implemented. */
  method?: string;
}

function assertParams(p: DepreciationParams): void {
  if (!(p.cost > 0)) {
    throw new DepreciationError("Nilai perolehan aset harus lebih besar dari nol.");
  }
  if (p.residualValue < 0) {
    throw new DepreciationError("Nilai residu tidak boleh negatif.");
  }
  if (p.residualValue > p.cost) {
    throw new DepreciationError("Nilai residu tidak boleh melebihi nilai perolehan.");
  }
  if (!Number.isInteger(p.usefulLifeMonths) || p.usefulLifeMonths <= 0) {
    throw new DepreciationError("Umur manfaat (bulan) harus bilangan bulat lebih dari nol.");
  }
  const method = p.method ?? "straight_line";
  if (method !== "straight_line") {
    throw new DepreciationError(
      `Metode penyusutan "${method}" belum didukung. Gunakan "straight_line" (garis lurus).`
    );
  }
}

/** The total amount that will ever be depreciated: cost − residual, floored at 0. */
export function depreciableBase(cost: number, residualValue: number): number {
  return Math.max(0, round2(round2(cost) - round2(residualValue)));
}

/** Book value (nilai buku) = cost − accumulated depreciation. */
export function bookValue(cost: number, accumulated: number): number {
  return round2(round2(cost) - round2(accumulated));
}

/**
 * Nominal straight-line amount for one month, BEFORE the final-period true-up.
 * `(cost − residual) / usefulLifeMonths`. The final period may differ by a few
 * cents so accumulated lands exactly on the depreciable base — see
 * `nextPeriodDepreciation`.
 */
export function straightLineMonthly(params: DepreciationParams): number {
  assertParams(params);
  return round2(depreciableBase(params.cost, params.residualValue) / params.usefulLifeMonths);
}

/**
 * Depreciation for the `periodIndex`-th posting (1-based), WITH the final-period
 * true-up.
 *
 * This is the single source of truth for "how much this month". Every period but
 * the last books the nominal monthly amount; the LAST period (periodIndex ===
 * usefulLifeMonths) books whatever is left of the depreciable base, so the
 * schedule is exactly `usefulLifeMonths` periods long and accumulated lands
 * EXACTLY on cost − residual — never a cent over, and never a stray rounding
 * tail spilling into an extra period. A period beyond the useful life returns 0,
 * which is how a fully-depreciated asset stops depreciating.
 *
 * Index-based, not accumulated-based, precisely so the rounding tail cannot
 * escape: `monthly × (N − 1)` may be a few cents off the base either way, and the
 * final period absorbs that gap by construction. `@/lib/fixed-assets` derives the
 * index from the count of periods already posted for the asset.
 */
export function depreciationForPeriod(
  params: DepreciationParams,
  periodIndex: number
): number {
  assertParams(params);
  if (!Number.isInteger(periodIndex) || periodIndex < 1) return 0;
  if (periodIndex > params.usefulLifeMonths) return 0;

  const base = depreciableBase(params.cost, params.residualValue);
  const monthly = straightLineMonthly(params);
  if (periodIndex === params.usefulLifeMonths) {
    // True-up: everything not yet booked by the N − 1 earlier periods.
    return round2(base - round2(monthly * (params.usefulLifeMonths - 1)));
  }
  return monthly;
}

/**
 * The next posting's amount, given how many periods have ALREADY been posted.
 * A thin wrapper over `depreciationForPeriod` for the periodic run, capped at the
 * remaining base as belt-and-suspenders against any manual drift in accumulated.
 */
export function nextPeriodDepreciation(
  params: DepreciationParams,
  periodsElapsed: number,
  accumulated: number
): number {
  assertParams(params);
  const base = depreciableBase(params.cost, params.residualValue);
  const remaining = round2(base - round2(accumulated));
  if (remaining <= MONEY_EPSILON) return 0;
  return Math.min(depreciationForPeriod(params, periodsElapsed + 1), remaining);
}

/** Has this asset depreciated its whole base already? */
export function isFullyDepreciated(params: DepreciationParams, accumulated: number): boolean {
  const base = depreciableBase(params.cost, params.residualValue);
  return round2(base - round2(accumulated)) <= MONEY_EPSILON;
}

export interface ScheduleRow {
  /** 1-based period index. */
  index: number;
  year: number;
  /** 1-12. */
  month: number;
  /** Depreciation booked in this period (IDR). */
  amount: number;
  /** Accumulated depreciation after this period. */
  accumulated: number;
  /** Book value after this period. */
  bookValue: number;
}

/** Advance a (year, month: 1..12) pair by one month. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * The full straight-line schedule from a starting period, ending when the base
 * is exhausted. The last row trues up so `accumulated` equals the depreciable
 * base exactly (never a cent more). Used for the detail-page preview and for
 * tests; the periodic run posts one period at a time via `nextPeriodDepreciation`.
 */
export function depreciationSchedule(
  params: DepreciationParams,
  startYear: number,
  startMonth: number
): ScheduleRow[] {
  assertParams(params);
  const rows: ScheduleRow[] = [];
  let accumulated = 0;
  let year = startYear;
  let month = startMonth;

  for (let index = 1; index <= params.usefulLifeMonths; index += 1) {
    const amount = depreciationForPeriod(params, index);
    if (amount <= 0) break;
    accumulated = round2(accumulated + amount);
    rows.push({
      index,
      year,
      month,
      amount,
      accumulated,
      bookValue: bookValue(params.cost, accumulated),
    });
    ({ year, month } = nextMonth(year, month));
  }
  return rows;
}

/**
 * Gain/loss on disposal (laba/rugi pelepasan) = proceeds − net book value.
 *
 * Positive → a GAIN (sold above book value), negative → a LOSS. This is the same
 * figure the disposal journal books as its balancing plug (see
 * `buildAssetDisposalLines`), exposed as a pure function for the UI and reports.
 */
export function disposalGainLoss(
  cost: number,
  accumulated: number,
  proceeds: number
): number {
  return round2(round2(proceeds) - bookValue(cost, accumulated));
}
