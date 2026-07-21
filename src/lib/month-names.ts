/**
 * Indonesian month names — a client-safe constant.
 *
 * Lives on its own (not in `@/lib/period`) because `period.ts` imports Prisma:
 * a client component that only needs the month labels must not drag the database
 * client into the browser bundle. `period.ts` re-exports this so server code can
 * keep importing `MONTH_NAMES` from where it always has.
 */
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;
