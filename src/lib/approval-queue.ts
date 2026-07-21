/**
 * Reading the approval queue — issue #25.
 *
 * The READ side only: what the "Perlu Persetujuan" page and the navbar badge
 * need, shaped for the browser (plain numbers and ISO strings, never Prisma
 * Decimal/Date objects, so the rows can cross the server→client boundary).
 *
 * The decision itself lives in the API route, because approving a document must
 * post its journal and this module must stay free of `@/lib/posting` — see the
 * cycle note in `@/lib/approval-requests`.
 *
 * Requester/approver names are fetched EXPLICITLY here rather than through a
 * Prisma relation: `approval_requests.requested_by_id` is a plain Int column
 * with an FK in migration 0024, the same posture as Budget.accountId (#29) and
 * the fixed-asset tables (#28), so no back-relation hangs off `User`.
 */
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";
import {
  APPROVAL_DOCUMENT_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  countUnreadDecisions,
  decisionMessage,
  type ApprovalDocumentType,
  type ApprovalStatus,
} from "@/lib/approvals";

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** One row of the queue, ready to render. */
export interface ApprovalRequestView {
  id: number;
  sourceType: string;
  documentId: number;
  documentType: ApprovalDocumentType | string;
  documentTypeLabel: string;
  documentNo: string | null;
  /** Deep link to the document itself, when it has a page of its own. */
  documentHref: string | null;
  status: ApprovalStatus | string;
  statusLabel: string;
  approverRole: string;
  amount: number;
  currency: string;
  rate: number | null;
  /** IDR base — the value the ambang was measured on. */
  baseAmount: number;
  thresholdAmount: number;
  requestedById: number;
  requestedByName: string;
  requestNote: string | null;
  decidedById: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  readAt: string | null;
  createdAt: string;
  /** One plain-Indonesian line describing the current state. */
  message: string;
}

/** Where a document of each source type can be opened, when such a page exists. */
function documentHref(sourceType: string, documentId: number): string | null {
  switch (sourceType) {
    case "contract":
      return `/contracts/${documentId}`;
    case "invoice":
      return `/invoices/${documentId}`;
    default:
      // Payments live inside their parent document's page and have no route of
      // their own; the queue shows the number and the value instead of a link.
      return null;
  }
}

type RawRequest = {
  id: number;
  sourceType: string;
  documentId: number;
  documentType: string;
  documentNo: string | null;
  status: string;
  approverRole: string;
  amount: unknown;
  currency: string;
  rate: unknown;
  baseAmount: unknown;
  thresholdAmount: unknown;
  requestedById: number;
  requestNote: string | null;
  decidedById: number | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  readAt: Date | null;
  createdAt: Date;
};

async function withUserNames(rows: RawRequest[]): Promise<ApprovalRequestView[]> {
  const ids = [
    ...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById]).filter((v): v is number => v != null)),
  ];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, username: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name || u.username]));

  return rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    documentId: r.documentId,
    documentType: r.documentType,
    documentTypeLabel:
      APPROVAL_DOCUMENT_TYPE_LABELS[r.documentType as ApprovalDocumentType] ?? r.documentType,
    documentNo: r.documentNo,
    documentHref: documentHref(r.sourceType, r.documentId),
    status: r.status,
    statusLabel: APPROVAL_STATUS_LABELS[r.status as ApprovalStatus] ?? r.status,
    approverRole: r.approverRole,
    amount: num(r.amount),
    currency: r.currency,
    rate: r.rate == null ? null : Number(r.rate),
    baseAmount: num(r.baseAmount),
    thresholdAmount: num(r.thresholdAmount),
    requestedById: r.requestedById,
    requestedByName: nameById.get(r.requestedById) ?? `#${r.requestedById}`,
    requestNote: r.requestNote,
    decidedById: r.decidedById,
    decidedByName: r.decidedById == null ? null : nameById.get(r.decidedById) ?? `#${r.decidedById}`,
    decidedAt: iso(r.decidedAt),
    decisionNote: r.decisionNote,
    readAt: iso(r.readAt),
    createdAt: r.createdAt.toISOString(),
    message: decisionMessage(r),
  }));
}

/**
 * The approver's inbox: everything still waiting for THIS role to decide.
 * Oldest first — an approval queue is worked from the top, and the document
 * that has been blocked longest is the one holding up the ledger.
 */
export async function listPendingApprovals(role: Role | string): Promise<ApprovalRequestView[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: { status: "pending_approval", approverRole: role },
    orderBy: { createdAt: "asc" },
  });
  return withUserNames(rows);
}

/** Everything a user has raised, newest first — including decided outcomes. */
export async function listMyApprovalRequests(
  userId: number,
  limit = 50
): Promise<ApprovalRequestView[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: { requestedById: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return withUserNames(rows);
}

/** Recently decided requests for this role — the approver's own history. */
export async function listDecidedApprovals(
  role: Role | string,
  limit = 25
): Promise<ApprovalRequestView[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: { approverRole: role, status: { in: ["approved", "rejected"] } },
    orderBy: { decidedAt: "desc" },
    take: limit,
  });
  return withUserNames(rows);
}

export interface ApprovalCounts {
  /** Waiting for this user's role to decide — the approver's badge. */
  pending: number;
  /** This user's own requests, decided but not opened yet — the requester's badge. */
  unread: number;
}

/**
 * The two numbers the navbar badge shows. One query each, both narrow: the
 * inbox count is an indexed `(status, approver_role)` count, and the unread one
 * reads only the requester's own decided rows.
 */
export async function getApprovalCounts(
  userId: number,
  role: Role | string
): Promise<ApprovalCounts> {
  const [pending, decidedMine] = await Promise.all([
    prisma.approvalRequest.count({
      where: { status: "pending_approval", approverRole: role },
    }),
    prisma.approvalRequest.findMany({
      where: {
        requestedById: userId,
        status: { in: ["approved", "rejected"] },
        readAt: null,
      },
      select: { status: true, readAt: true },
    }),
  ]);

  return { pending, unread: countUnreadDecisions(decidedMine) };
}

/** Aturan approval, for the rules screen. */
export interface ApprovalRuleView {
  id: number;
  documentType: string;
  documentTypeLabel: string;
  minAmount: number;
  approverRole: string;
  note: string | null;
  isActive: boolean;
}

export async function listApprovalRules(
  options: { includeInactive?: boolean } = {}
): Promise<ApprovalRuleView[]> {
  const rules = await prisma.approvalRule.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: [{ documentType: "asc" }, { minAmount: "asc" }],
  });
  return rules.map((r) => ({
    id: r.id,
    documentType: r.documentType,
    documentTypeLabel:
      APPROVAL_DOCUMENT_TYPE_LABELS[r.documentType as ApprovalDocumentType] ?? r.documentType,
    minAmount: num(r.minAmount),
    approverRole: r.approverRole,
    note: r.note,
    isActive: r.isActive,
  }));
}
