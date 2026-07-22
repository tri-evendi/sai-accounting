/**
 * Approval payload validation — issue #25.
 *
 * Mirrors the DB constraints of `approval_rules` / `approval_requests`
 * (docs/DATABASE.md §9): enum-like columns become `z.enum` over the SAME
 * snake_case literals the pure module exports, money is bounded to what
 * `Decimal(15,2)` can hold, and text is capped at the VARCHAR/TEXT lengths.
 *
 * Whatever needs the database — does the rule exist, is this user allowed to
 * decide, is the transition legal — belongs to the route and to
 * `@/lib/approvals`, not here.
 */
import { z } from "zod";
import { APPROVAL_DOCUMENT_TYPES } from "@/lib/approvals";
import { ROLES } from "@/lib/constants";

const roleValues = [ROLES.BOS, ROLES.CORE, ROLES.PTG] as const;

/**
 * Ambang nilai in IDR base. Non-negative (an ambang below zero would match
 * every document including the ones worth nothing) and capped at what
 * `Decimal(15,2)` stores.
 */
const threshold = z.coerce.number().nonnegative().max(9_999_999_999_999);

/** Buat/ubah satu aturan approval. */
export const approvalRuleSchema = z.object({
  documentType: z.enum(APPROVAL_DOCUMENT_TYPES),
  minAmount: threshold,
  approverRole: z.enum(roleValues),
  note: z.string().max(1000).trim().optional().nullable(),
  isActive: z.boolean().optional(),
});
export type ApprovalRuleInput = z.infer<typeof approvalRuleSchema>;

/**
 * Keputusan penyetuju. The note is REQUIRED on a rejection: "ditolak" without a
 * reason is not something a requester can act on, and issue #25 asks for the
 * catatan to be part of the trail. An approval may be silent.
 */
export const approvalDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().max(1000).trim().optional().nullable(),
  })
  .refine((v) => v.decision !== "reject" || (v.note != null && v.note.length >= 5), {
    path: ["note"],
    message: "Alasan penolakan wajib diisi (minimal 5 karakter).",
  });
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

/**
 * Pengajuan ulang setelah ditolak (issue #44). Catatannya OPSIONAL — berbeda
 * dari penolakan, yang wajib beralasan: penyetuju harus menjelaskan mengapa
 * menolak, sedangkan pemohon sudah menjelaskan dirinya lewat dokumen yang ia
 * perbaiki. Bila diisi, catatan itu MENGGANTI `requestNote` sehingga penyetuju
 * membaca alasan terbaru, bukan alasan pengajuan pertama.
 */
export const approvalResubmitSchema = z.object({
  note: z.string().max(1000).trim().optional().nullable(),
});
export type ApprovalResubmitInput = z.infer<typeof approvalResubmitSchema>;

/** Filter antrean: which slice of the queue a page/API call wants. */
export const approvalListQuerySchema = z.object({
  scope: z.enum(["inbox", "mine"]).optional().default("inbox"),
  status: z.enum(["draft", "pending_approval", "approved", "rejected"]).optional(),
  documentType: z.enum(APPROVAL_DOCUMENT_TYPES).optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;
