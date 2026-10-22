/**
 * Settlement-date exchange rates (issue #43).
 *
 * ── THE QUESTION THIS MODULE EXISTS TO ANSWER ───────────────────────────────
 * A customer wires Rp 155.000.000 against a USD invoice. Which account falls,
 * and by how much? The receivable lives in 110202 Piutang Usaha (USD) and is
 * denominated in dollars, so relieving it means knowing how many dollars that
 * transfer settled — and that needs the rate of USD on the day the money
 * landed. The payment row knows only its own rate (1: it is rupiah). The
 * invoice knows the rate it was booked at, months earlier. Neither is the
 * answer, which is why issue #23 stopped here and left the account wrong.
 *
 * ── WHY THIS DOES NOT REOPEN THE ARGUMENT #23 SETTLED ───────────────────────
 * #23 rejected an `exchange_rates` table because a second rate source can
 * contradict the rate a document already asserts. That objection is honoured by
 * SCOPE, not by good intentions:
 *
 *   • Nothing is valued from this table. Invoices, contracts, purchases,
 *     advances and payments are still valued at the rate stored on themselves,
 *     through `resolveRate`, which this module neither calls nor replaces.
 *   • It is read on exactly one path — a settlement whose payment currency
 *     differs from the document's — and only for the DOCUMENT's currency.
 *   • It therefore cannot override a document rate, because it is never
 *     consulted about one. It complements them: document rates say what a debt
 *     was worth when raised, this says what the money was worth when it moved,
 *     and the gap between the two is realized FX, which is the truth of the
 *     matter rather than an artefact.
 *
 * ── EXACT DAY, OR NOTHING ───────────────────────────────────────────────────
 * A lookup matches one calendar day. There is no nearest, no previous, no
 * interpolation — each of those is a silent guess of exactly the kind
 * `resolveRate` refuses, and here the guess would decide how much receivable is
 * discharged, not merely how it is presented. A missing rate raises
 * `MissingSettlementRateError` and the posting is refused, so the user enters
 * the rate from the bank advice: the same number they would have been asked for
 * anyway, now recorded instead of assumed.
 *
 * ── CORRECTING LEGACY DOCUMENTS ─────────────────────────────────────────────
 * Cross-currency settlements posted before #43 credited the payment currency's
 * receivable/payable. They are corrected ONE DOCUMENT AT A TIME — never in
 * bulk:
 *
 *   1. Enter the rate for that settlement date (currency + rate_date + rate),
 *      sourced from the bank advice for that transfer.
 *   2. Check the document's period is open; if it is closed, a Manager reopens
 *      it deliberately (issue #13) or the correction is booked in an open one.
 *   3. `repostForSource({ sourceType: "invoice_payment", sourceId })` — which
 *      reverses the old journal and posts a fresh one, leaving the audit trail
 *      intact rather than editing history.
 *
 * A bulk repost is deliberately not offered: each one needs a rate that only a
 * human holding that bank advice can supply, and reposting without it would
 * either fail en masse or, worse, succeed against a guessed rate.
 */
import type { Prisma, PrismaClient } from "@sai/db/client/company";
import { businessISODate } from "@sai/core/business-date";

/** Type-only Prisma import, as in ./mapping — callers pass the client. */
type Client = Prisma.TransactionClient | PrismaClient;

/**
 * Raised when a cross-currency settlement needs a rate nobody has recorded.
 * Carries currency and date so a UI can deep-link straight to entering it.
 */
export class MissingSettlementRateError extends Error {
  constructor(
    readonly currency: string,
    readonly date: Date
  ) {
    const day = date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    super(
      `Kurs ${currency} untuk tanggal pelunasan ${day} belum dicatat. ` +
        `Pelunasan ini memakai mata uang yang berbeda dari dokumennya, sehingga ` +
        `nilai ${currency} yang dilunasi hanya bisa dihitung dari kurs tanggal tersebut. ` +
        `Catat kursnya (sesuai nota bank) di daftar kurs, lalu ulangi. ` +
        `Jurnal tidak diposting agar piutang/hutang tidak berkurang dengan nilai yang salah.`
    );
    this.name = "MissingSettlementRateError";
  }
}

/**
 * The `rate_date` (a `DATE` column) that `date` settles on.
 *
 * The calendar day is read on Jakarta time (`@sai/core/business-date`), not the
 * process zone, and the result is that day at 00:00 UTC — the form Prisma
 * reads and writes a `@db.Date` in (same as `tax-rates.ts`). Matching by
 * EQUALITY rather than by a `[start, end]` instant range matters for a DATE
 * column: the previous bounds were 00:00–23:59 WIB, i.e. 17:00Z the day before
 * to 16:59Z, and a DATE compared against that range admits BOTH the day before
 * and the day itself — with no `orderBy`, `findFirst` could then pick the wrong
 * day's rate whenever two consecutive days had one. Exactly one row can match
 * an equality, because `exchange_rates` is unique on (currency, rate_date).
 */
export function settlementRateDate(date: Date): Date {
  return new Date(`${businessISODate(date)}T00:00:00.000Z`);
}

/**
 * The rate of `currency` against IDR on `date`.
 *
 * IDR is 1 by definition and never hits the table. Anything else must have a
 * row for that exact day or this throws — see the module note on why there is
 * no fallback.
 *
 * Note the absence of an `orderBy`: with at most one row per currency per day
 * there is nothing to order, and leaving it out means this lookup cannot later
 * drift into a "most recent rate before the date" fallback by accident.
 */
export async function resolveSettlementRate(
  currency: string,
  date: Date,
  client: Client
): Promise<number> {
  if (currency === "IDR") return 1;

  const row = await client.exchangeRate.findFirst({
    where: { currency, isActive: true, rateDate: settlementRateDate(date) },
  });

  const rate = row ? Number(row.rate) : 0;
  if (!(rate > 0)) throw new MissingSettlementRateError(currency, date);
  return rate;
}
