/**
 * Approval requests — the thin DB layer between the pure rules and everything
 * that writes a document (issue #25).
 *
 * Two jobs, and deliberately only two:
 *   1. `ensureApprovalRequest` — called by a document's POST route, INSIDE the
 *      same `$transaction` as the document write, right after the row exists.
 *      Looks up the active rules, matches on the IDR base value, and creates the
 *      pengajuan when one applies. Returns null when none does, which is the
 *      overwhelmingly common case (below ambang, or no rules configured at all).
 *   2. `isPostingBlocked` — the DB half of the posting gate, called by
 *      `postForSource`/`repostForSource`.
 *
 * WHY THIS MODULE IS SEPARATE FROM `@/lib/approval-queue`: the posting engine
 * imports the gate, and the queue's decide/approve path imports the posting
 * engine. Keeping the gate here — with a TYPE-ONLY Prisma import and no
 * `@/lib/prisma` singleton, exactly like `@/lib/posting/cogs` — means there is
 * no import cycle and no chance of dragging the queue's reads into every write
 * path.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  blocksPosting,
  documentTypeForSource,
  matchApprovalRule,
  type ApprovalSourceType,
} from "@/lib/approvals";

/** Type-only client (root or transaction) — no singleton import. */
type Client = Prisma.TransactionClient | PrismaClient;

/** The stored request, as far as callers here care. */
export interface ApprovalRequestRow {
  id: number;
  sourceType: string;
  documentId: number;
  documentType: string;
  documentNo: string | null;
  approverRole: string;
  status: string;
  baseAmount: unknown;
  thresholdAmount: unknown;
}

/** The pengajuan attached to a document, or null when it needs no approval. */
export async function findApprovalRequest(
  client: Client,
  sourceType: string,
  documentId: number
): Promise<{ id: number; status: string; approverRole: string } | null> {
  // Sources with no approval category (stock movement, penyusutan, saldo awal…)
  // can never have a request, so they never pay for a query.
  if (documentTypeForSource(sourceType) === null) return null;

  return client.approvalRequest.findUnique({
    where: { sourceType_documentId: { sourceType, documentId } },
    select: { id: true, status: true, approverRole: true },
  });
}

/**
 * Must the journal for this document be withheld?
 *
 * TRUE only when a pengajuan exists AND it is not yet `approved`. No pengajuan
 * → false, which is what keeps every pre-#25 document, and every document below
 * the ambang, posting exactly as before.
 */
export async function isPostingBlocked(
  client: Client,
  sourceType: string,
  documentId: number
): Promise<boolean> {
  const request = await findApprovalRequest(client, sourceType, documentId);
  return blocksPosting(request?.status ?? null);
}

export interface EnsureApprovalRequestInput {
  client: Client;
  /** Posting source type of the document just written. */
  sourceType: ApprovalSourceType;
  documentId: number;
  documentNo?: string | null;
  /** Nilai dalam mata uang dokumen. */
  amount: number;
  currency: string;
  rate?: number | null;
  /**
   * Nilai IDR base — the number the ambang is compared against. `null`/undefined
   * (a foreign document with no rate) matches no rule on purpose: see the
   * header of `@/lib/approvals`.
   */
  baseAmount?: number | null;
  /** `session.user.id` is a string; pass it parsed. */
  requestedById: number;
  requestNote?: string | null;
}

/**
 * Create the pengajuan for a freshly written document when a rule applies.
 *
 * Idempotent: a document that already has a pengajuan (a repost, a retry) gets
 * its existing one back rather than a second row — the `(source_type,
 * document_id)` unique index says the same thing at the database level.
 *
 * Returns null when no rule matches, i.e. "this document needs no approval and
 * posts immediately". Callers do not branch on it for posting — the gate in
 * `postForSource` reads the row itself — they use it only to tell the user.
 */
export async function ensureApprovalRequest(
  input: EnsureApprovalRequestInput
): Promise<ApprovalRequestRow | null> {
  const { client, sourceType, documentId } = input;

  const documentType = documentTypeForSource(sourceType);
  if (documentType === null) return null;

  const existing = await client.approvalRequest.findUnique({
    where: { sourceType_documentId: { sourceType, documentId } },
  });
  if (existing) return existing as unknown as ApprovalRequestRow;

  const rules = await client.approvalRule.findMany({
    where: { documentType, isActive: true },
    select: { id: true, documentType: true, minAmount: true, approverRole: true },
  });
  if (rules.length === 0) return null;

  // Decimal values reach the matcher as Prisma Decimals; their exact text form
  // is what is compared. Nothing here converts money to a JS number.
  const rule = matchApprovalRule(rules, {
    documentType,
    baseAmount: input.baseAmount ?? null,
  });
  if (!rule) return null;

  const created = await client.approvalRequest.create({
    data: {
      sourceType,
      documentId,
      documentType,
      documentNo: input.documentNo ?? null,
      ruleId: rule.id,
      approverRole: rule.approverRole,
      status: "pending_approval",
      amount: input.amount,
      currency: input.currency,
      rate: input.rate ?? null,
      // Never actually null here: a document with no IDR base matches no rule,
      // so `matchApprovalRule` returned null above and we never reached this.
      baseAmount: input.baseAmount ?? 0,
      thresholdAmount: rule.minAmount as Prisma.Decimal,
      requestedById: input.requestedById,
      requestNote: input.requestNote ?? null,
    },
  });

  return created as unknown as ApprovalRequestRow;
}

/**
 * What a document's POST route reports back to the browser. `null` when the
 * document needs no approval — the form then behaves exactly as it did before.
 */
export interface ApprovalNotice {
  required: true;
  requestId: number;
  status: string;
  approverRole: string;
  message: string;
}

export function approvalNotice(
  request: ApprovalRequestRow | null,
  documentLabel: string
): ApprovalNotice | null {
  if (!request) return null;
  return {
    required: true,
    requestId: request.id,
    status: request.status,
    approverRole: request.approverRole,
    message:
      `${documentLabel} tersimpan tetapi BELUM masuk jurnal: nilainya mencapai ambang ` +
      `persetujuan, jadi menunggu keputusan penyetuju di menu "Perlu Persetujuan".`,
  };
}
