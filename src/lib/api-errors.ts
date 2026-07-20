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
import { MissingMappingError, PostingRuleError, SourceNotFoundError } from "@/lib/posting";
import { UnbalancedJournalError } from "@/lib/ledger";

/** Appended to every posting error so the user knows the write was rolled back. */
export const NOT_SAVED_NOTICE =
  "Data TIDAK tersimpan agar buku besar tetap konsisten. Perbaiki penyebabnya lalu simpan ulang.";

export interface PostingErrorBody {
  error: string;
  code: string;
  /** Which account_mappings key to configure, when that is the cause. */
  mappingKey?: string;
  currency?: string | null;
  /** Always false — makes "was my record saved?" unambiguous for the client. */
  saved: false;
}

/**
 * Map a thrown value to a 422 response, or null when it isn't a posting error
 * (caller should rethrow — a genuine bug must not be disguised as a 422).
 */
export function postingErrorResponse(e: unknown): NextResponse<PostingErrorBody> | null {
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
