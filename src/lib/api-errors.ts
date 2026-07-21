/**
 * Turning posting-engine failures into HTTP responses a user can act on.
 *
 * Auto-posting runs inside the same `$transaction` as the source write, so a
 * posting failure rolls the source record back too. That is deliberate — a
 * half-recorded transaction is worse than none — but it means the response has
 * to say two things: *what* is misconfigured, and *that the record was not
 * saved*. A 500 stack trace says neither.
 *
 * Status 422: the request was well-formed (Zod passed) but the accounting
 * configuration cannot satisfy it. Retrying the same payload without fixing the
 * mapping/rate would fail identically.
 */
import { NextResponse } from "next/server";
import {
  MissingMappingError,
  MissingSettlementRateError,
  PostingRuleError,
  SourceNotFoundError,
} from "@/lib/posting";
import { UnbalancedJournalError } from "@/lib/ledger";
import { ClosedPeriodError } from "@/lib/period";

/** Appended to every posting error so the user knows the write was rolled back. */
export const NOT_SAVED_NOTICE =
  "Data TIDAK tersimpan agar buku besar tetap konsisten. Perbaiki penyebabnya lalu simpan ulang.";

export interface PostingErrorBody {
  error: string;
  code: string;
  /** Which account_mappings key to configure, when that is the cause. */
  mappingKey?: string;
  currency?: string | null;
  /** The closed month that blocked the write, when that is the cause. */
  period?: { year: number; month: number };
  /** Always false — makes "was my record saved?" unambiguous for the client. */
  saved: false;
}

/**
 * Map a thrown value to a 422 response, or null when it isn't a posting error
 * (caller should rethrow — a genuine bug must not be disguised as a 422).
 */
export function postingErrorResponse(e: unknown): NextResponse<PostingErrorBody> | null {
  // 422, not a 400 Zod field error, on purpose. Issue #9's rule is that what is
  // knowable at validation time belongs in Zod — and "is this month closed?" is
  // precisely *not* knowable there: it is server state that needs a query
  // against `periods`, while these Zod schemas are pure and synchronous. A date
  // that is perfectly valid this morning is rejected this afternoon once a
  // Manager closes the month, with the payload unchanged. That is the same
  // shape as a missing account mapping: well-formed request, server state
  // forbids it, retrying the identical payload fails identically. It also earns
  // the `saved: false` notice, which matters here because the guard fires
  // inside the source write's transaction and rolls the document back too.
  if (e instanceof ClosedPeriodError) {
    return NextResponse.json(
      {
        error: `${e.message} ${NOT_SAVED_NOTICE}`,
        code: "period_closed",
        period: { year: e.year, month: e.month },
        saved: false as const,
      },
      { status: 422 }
    );
  }
  if (e instanceof MissingMappingError) {
    return NextResponse.json(
      {
        error: `${e.message} ${NOT_SAVED_NOTICE}`,
        code: "missing_account_mapping",
        mappingKey: e.key,
        currency: e.currency ?? null,
        saved: false as const,
      },
      { status: 422 }
    );
  }
  if (e instanceof PostingRuleError) {
    return NextResponse.json(
      { error: `${e.message} ${NOT_SAVED_NOTICE}`, code: "posting_rule", saved: false as const },
      { status: 422 }
    );
  }
  // A cross-currency settlement needs a rate nobody has recorded (issue #43). Like
  // a missing mapping, it is server state a well-formed payload cannot satisfy, so
  // it earns a 422 with the not-saved notice rather than a 500 stack trace. This
  // is the message an allocation edit (issue #42) surfaces when the purchase it is
  // moved onto is in another currency and that day's rate is absent.
  if (e instanceof MissingSettlementRateError) {
    return NextResponse.json(
      {
        error: `${e.message} ${NOT_SAVED_NOTICE}`,
        code: "missing_settlement_rate",
        currency: e.currency ?? null,
        saved: false as const,
      },
      { status: 422 }
    );
  }
  if (e instanceof UnbalancedJournalError) {
    return NextResponse.json(
      {
        error: `${e.message} ${NOT_SAVED_NOTICE}`,
        code: "unbalanced_journal",
        saved: false as const,
      },
      { status: 422 }
    );
  }
  if (e instanceof SourceNotFoundError) {
    return NextResponse.json(
      { error: `${e.message} ${NOT_SAVED_NOTICE}`, code: "source_not_found", saved: false as const },
      { status: 422 }
    );
  }
  return null;
}

/**
 * `catch (e) { return handlePostingError(e); }` — returns 422 for posting
 * failures, rethrows everything else so real bugs still surface.
 */
export function handlePostingError(e: unknown): NextResponse<PostingErrorBody> {
  const response = postingErrorResponse(e);
  if (response) return response;
  throw e;
}
