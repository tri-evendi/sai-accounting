/**
 * Approval transaksi — aturan murni (issue #25).
 *
 * Everything here runs without a database: `@/lib/approvals` has no Prisma and
 * no I/O, so the ambang comparison, the rule matcher, the state machine and the
 * posting gate can be pinned down exactly. The DB-side wiring is exercised
 * separately in posting-engine.test.ts, which drives the gate through
 * `postForSource` against the in-memory fake client.
 *
 * The comparison is the part that must not be sloppy: money is Decimal(15,2),
 * and a threshold decided by float arithmetic would let a document worth exactly
 * the ambang slip through on some days and not others.
 */
import { describe, expect, it } from "vitest";
import {
  APPROVAL_DOCUMENT_TYPES,
  APPROVAL_STATUSES,
  ApprovalTransitionError,
  absoluteDecimal,
  assertTransition,
  blocksPosting,
  canTransition,
  compareDecimal,
  countUnreadDecisions,
  decimalAtLeast,
  decisionMessage,
  documentTypeForSource,
  isUnreadDecision,
  matchApprovalRule,
  requiresApproval,
  statusForDecision,
  type ApprovalRuleLike,
  coveredByApproval,
  reapprovalAction,
  canResubmit,
  wasResubmitted,
  isUnreadDecision,
} from "@/lib/approvals";
import {
  approvalDecisionSchema,
  approvalRuleSchema,
} from "@/lib/validations/approval";

/** A Prisma Decimal only ever reaches us as something with an exact toString(). */
const decimal = (text: string) => ({ toString: () => text });

// ─── Decimal-safe comparison ────────────────────────────────────────────────

describe("compareDecimal is exact, never float", () => {
  it("orders plain values", () => {
    expect(compareDecimal(1, 2)).toBe(-1);
    expect(compareDecimal(2, 1)).toBe(1);
    expect(compareDecimal(2, 2)).toBe(0);
  });

  it("compares across different scales", () => {
    expect(compareDecimal("500000000", "500000000.00")).toBe(0);
    expect(compareDecimal("500000000.01", "500000000.00")).toBe(1);
    expect(compareDecimal("499999999.99", "500000000")).toBe(-1);
  });

  it("decides the classic float trap correctly", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754. As decimal text there is
    // no such thing: three tenths is three tenths.
    expect(compareDecimal("0.3", "0.30")).toBe(0);
    expect(compareDecimal("0.1", "0.2")).toBe(-1);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    // Decimal(15,2) tops out at 9,999,999,999,999.99 — 15 significant digits,
    // which a double cannot separate by a single cent.
    expect(compareDecimal("9999999999999.99", "9999999999999.98")).toBe(1);
    expect(compareDecimal("9999999999999.99", "9999999999999.99")).toBe(0);
  });

  it("handles Prisma Decimal objects through toString()", () => {
    expect(compareDecimal(decimal("650000000.00"), decimal("650000000"))).toBe(0);
    expect(compareDecimal(decimal("650000000.00"), 650_000_000)).toBe(0);
  });

  it("orders negatives below positives, and among themselves", () => {
    expect(compareDecimal("-1", "1")).toBe(-1);
    expect(compareDecimal("-5", "-2")).toBe(-1);
    expect(compareDecimal("-2", "-5")).toBe(1);
    expect(compareDecimal("-3.00", "-3")).toBe(0);
  });

  it("treats -0 as 0", () => {
    expect(compareDecimal("-0", "0")).toBe(0);
    expect(compareDecimal("-0.00", 0)).toBe(0);
  });

  it("reads exponent notation rather than mangling it", () => {
    expect(compareDecimal("1e3", "1000")).toBe(0);
    expect(compareDecimal("1.5e2", "150")).toBe(0);
    expect(compareDecimal("1e-2", "0.01")).toBe(0);
  });

  it("returns null when either side is not a decimal", () => {
    expect(compareDecimal(null, 1)).toBeNull();
    expect(compareDecimal(undefined, 1)).toBeNull();
    expect(compareDecimal("", 1)).toBeNull();
    expect(compareDecimal("abc", 1)).toBeNull();
    expect(compareDecimal(NaN, 1)).toBeNull();
    expect(compareDecimal(Infinity, 1)).toBeNull();
    expect(compareDecimal(1, null)).toBeNull();
  });
});

describe("decimalAtLeast — the ambang is inclusive", () => {
  it("is true exactly at the threshold", () => {
    expect(decimalAtLeast("500000000.00", "500000000")).toBe(true);
  });

  it("is true above and false below", () => {
    expect(decimalAtLeast("500000000.01", "500000000")).toBe(true);
    expect(decimalAtLeast("499999999.99", "500000000")).toBe(false);
  });

  it("is false when there is nothing to compare", () => {
    expect(decimalAtLeast(null, "500000000")).toBe(false);
  });
});

describe("absoluteDecimal", () => {
  it("drops the sign but keeps the scale", () => {
    expect(absoluteDecimal("-650000000.00")).toBe("650000000.00");
    expect(absoluteDecimal("650000000.00")).toBe("650000000.00");
    expect(absoluteDecimal("-0.5")).toBe("0.5");
  });

  it("returns null for an unvaluable input", () => {
    expect(absoluteDecimal(null)).toBeNull();
    expect(absoluteDecimal("kosong")).toBeNull();
  });
});

// ─── Rule matching ──────────────────────────────────────────────────────────

const RULES: ApprovalRuleLike[] = [
  { id: 1, documentType: "invoice", minAmount: "100000000", approverRole: "core" },
  { id: 2, documentType: "invoice", minAmount: "1000000000", approverRole: "bos" },
  { id: 3, documentType: "payment", minAmount: "50000000.00", approverRole: "bos" },
  { id: 4, documentType: "contract", minAmount: "0", approverRole: "bos", isActive: false },
];

describe("matchApprovalRule", () => {
  it("returns null when nothing reaches any ambang", () => {
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: "99999999.99" })
    ).toBeNull();
    expect(requiresApproval(RULES, { documentType: "invoice", baseAmount: "1" })).toBe(false);
  });

  it("matches at the exact threshold — the boundary belongs to the rule", () => {
    const rule = matchApprovalRule(RULES, {
      documentType: "invoice",
      baseAmount: decimal("100000000.00"),
    });
    expect(rule?.id).toBe(1);
    expect(rule?.approverRole).toBe("core");
  });

  it("picks the STRICTEST band when several rules match", () => {
    // 2,000,000,000 satisfies both the 100jt and the 1M rule. The tighter,
    // higher-value one must win, or adding it would have changed nothing.
    const rule = matchApprovalRule(RULES, {
      documentType: "invoice",
      baseAmount: "2000000000",
    });
    expect(rule?.id).toBe(2);
    expect(rule?.approverRole).toBe("bos");
  });

  it("breaks a tie on the lowest rule id, deterministically", () => {
    const tied: ApprovalRuleLike[] = [
      { id: 9, documentType: "payment", minAmount: "10", approverRole: "core" },
      { id: 4, documentType: "payment", minAmount: "10.00", approverRole: "bos" },
    ];
    expect(matchApprovalRule(tied, { documentType: "payment", baseAmount: "10" })?.id).toBe(4);
    // Order of the input array must not change the answer.
    expect(
      matchApprovalRule([...tied].reverse(), { documentType: "payment", baseAmount: "10" })?.id
    ).toBe(4);
  });

  it("never crosses document types", () => {
    // A 2M payment does not pick up the invoice rules, only the payment one.
    const rule = matchApprovalRule(RULES, { documentType: "payment", baseAmount: "2000000000" });
    expect(rule?.id).toBe(3);
  });

  it("ignores deactivated rules", () => {
    // Rule 4 would match every contract (ambang 0) if it were active.
    expect(
      matchApprovalRule(RULES, { documentType: "contract", baseAmount: "999999999999" })
    ).toBeNull();
  });

  it("treats a zero-value document as reaching a zero ambang, and nothing higher", () => {
    const zeroRule: ApprovalRuleLike[] = [
      { id: 1, documentType: "invoice", minAmount: "0", approverRole: "bos" },
    ];
    expect(matchApprovalRule(zeroRule, { documentType: "invoice", baseAmount: 0 })?.id).toBe(1);
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: 0 })
    ).toBeNull();
  });

  it("measures a NEGATIVE document on its magnitude — a minus sign is no bypass", () => {
    const rule = matchApprovalRule(RULES, {
      documentType: "invoice",
      baseAmount: "-2000000000",
    });
    expect(rule?.id).toBe(2);
  });

  it("matches nothing when the document has no IDR value at all", () => {
    // A foreign-currency document with no rate: its rupiah value is unknown, and
    // guessing one is what the posting engine already refuses to do. Such a
    // document cannot post either, so it never escapes control by being unmatched.
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: null })
    ).toBeNull();
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: undefined })
    ).toBeNull();
  });

  it("compares the IDR BASE of a foreign document, not its own-currency amount", () => {
    // USD 40,000 at 16,250 = IDR 650,000,000 — over the 100jt invoice ambang,
    // while the bare 40,000 would have been far under it.
    const usdInvoiceBase = decimal("650000000.00");
    expect(matchApprovalRule(RULES, { documentType: "invoice", baseAmount: 40_000 })).toBeNull();
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: usdInvoiceBase })?.id
    ).toBe(1);
  });

  it("keeps a foreign document that lands one cent short below the ambang", () => {
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: decimal("99999999.99") })
    ).toBeNull();
    expect(
      matchApprovalRule(RULES, { documentType: "invoice", baseAmount: decimal("100000000.01") })
        ?.id
    ).toBe(1);
  });

  it("returns null when there are no rules at all — the default installation", () => {
    expect(matchApprovalRule([], { documentType: "invoice", baseAmount: "1e12" })).toBeNull();
  });
});

// ─── Source → document type ─────────────────────────────────────────────────

describe("documentTypeForSource", () => {
  it("maps the three payment shapes onto one rule category", () => {
    expect(documentTypeForSource("invoice_payment")).toBe("payment");
    expect(documentTypeForSource("contract_payment")).toBe("payment");
    expect(documentTypeForSource("supplier_transaction")).toBe("payment");
  });

  it("maps documents to themselves", () => {
    expect(documentTypeForSource("invoice")).toBe("invoice");
    expect(documentTypeForSource("contract")).toBe("contract");
  });

  it("returns null for sources approval never gates", () => {
    for (const source of [
      "stock_movement",
      "cash_account",
      "advance_payment",
      "advance_application",
      "sales_return",
      "purchase_return",
      "depreciation",
      "fixed_asset_disposal",
      "opening_balance",
      null,
      undefined,
    ]) {
      expect(documentTypeForSource(source)).toBeNull();
    }
  });

  it("covers every declared document type", () => {
    expect([...APPROVAL_DOCUMENT_TYPES].sort()).toEqual(["contract", "invoice", "payment"]);
  });
});

// ─── State machine ──────────────────────────────────────────────────────────

describe("approval state machine", () => {
  it("declares the four states of issue #25", () => {
    expect([...APPROVAL_STATUSES]).toEqual([
      "draft",
      "pending_approval",
      "approved",
      "rejected",
    ]);
  });

  it("allows submit, approve and reject", () => {
    expect(canTransition("draft", "pending_approval")).toBe(true);
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("pending_approval", "rejected")).toBe(true);
  });

  it("allows a rejected document to be revised and resubmitted", () => {
    expect(canTransition("rejected", "pending_approval")).toBe(true);
  });

  it("makes approved terminal — un-approving is a journal reversal, not an edit", () => {
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(canTransition("approved", "pending_approval")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
  });

  it("refuses to decide something that was already decided", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(() => assertTransition("approved", "approved")).toThrow(ApprovalTransitionError);
  });

  it("refuses to skip the queue — draft cannot jump straight to approved", () => {
    expect(canTransition("draft", "approved")).toBe(false);
  });

  it("rejects unknown statuses rather than guessing", () => {
    expect(canTransition("menunggu", "approved")).toBe(false);
    expect(canTransition("pending_approval", "disetujui")).toBe(false);
  });

  it("names both states in the error a user sees", () => {
    try {
      assertTransition("approved", "rejected");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApprovalTransitionError);
      expect((e as Error).message).toContain("Disetujui");
      expect((e as Error).message).toContain("Ditolak");
    }
  });

  it("maps a decision to its status", () => {
    expect(statusForDecision("approve")).toBe("approved");
    expect(statusForDecision("reject")).toBe("rejected");
  });
});

// ─── The posting gate ───────────────────────────────────────────────────────

describe("blocksPosting — backward compatibility lives here", () => {
  it("does NOT block a document with no approval request", () => {
    // Every document that predates issue #25, and every new one below the
    // ambang, is this case. Blocking here would freeze the whole ledger.
    expect(blocksPosting(null)).toBe(false);
    expect(blocksPosting(undefined)).toBe(false);
  });

  it("blocks anything not yet approved", () => {
    expect(blocksPosting("draft")).toBe(true);
    expect(blocksPosting("pending_approval")).toBe(true);
    expect(blocksPosting("rejected")).toBe(true);
  });

  it("lets an approved document through", () => {
    expect(blocksPosting("approved")).toBe(false);
  });

  it("blocks an unrecognised status rather than assuming the best", () => {
    expect(blocksPosting("apa_ini")).toBe(true);
  });
});

// ─── In-app notification ────────────────────────────────────────────────────

describe("unread decisions are the notification", () => {
  it("counts a decided request nobody opened yet", () => {
    expect(isUnreadDecision({ status: "approved", readAt: null })).toBe(true);
    expect(isUnreadDecision({ status: "rejected" })).toBe(true);
  });

  it("does not count one that has been opened", () => {
    expect(isUnreadDecision({ status: "approved", readAt: new Date() })).toBe(false);
  });

  it("does not count a request still waiting — the requester raised it themselves", () => {
    expect(isUnreadDecision({ status: "pending_approval", readAt: null })).toBe(false);
    expect(isUnreadDecision({ status: "draft", readAt: null })).toBe(false);
  });

  it("totals a mixed list", () => {
    expect(
      countUnreadDecisions([
        { status: "approved", readAt: null },
        { status: "rejected", readAt: null },
        { status: "approved", readAt: new Date() },
        { status: "pending_approval", readAt: null },
      ])
    ).toBe(2);
  });

  it("says in plain Indonesian what happened, and whether the journal moved", () => {
    expect(
      decisionMessage({ status: "approved", documentType: "invoice", documentNo: "SI.1" })
    ).toContain("masuk jurnal");
    expect(
      decisionMessage({ status: "rejected", documentType: "payment", documentNo: null })
    ).toContain("belum masuk jurnal");
    expect(
      decisionMessage({ status: "pending_approval", documentType: "contract", documentNo: "SC-1" })
    ).toContain("Kontrak SC-1");
  });
});

// ─── Zod payloads ───────────────────────────────────────────────────────────

describe("approval rule schema mirrors the DB constraints", () => {
  const base = { documentType: "invoice", minAmount: 500_000_000, approverRole: "bos" };

  it("accepts a well-formed rule", () => {
    const result = approvalRuleSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects a jenis dokumen that has no posting source behind it", () => {
    expect(approvalRuleSchema.safeParse({ ...base, documentType: "surat_jalan" }).success).toBe(
      false
    );
  });

  it("rejects a role that does not exist", () => {
    expect(approvalRuleSchema.safeParse({ ...base, approverRole: "manajer" }).success).toBe(false);
  });

  it("rejects a negative ambang — it would match every document, including worthless ones", () => {
    expect(approvalRuleSchema.safeParse({ ...base, minAmount: -1 }).success).toBe(false);
  });

  it("accepts a zero ambang — 'everything of this kind needs a signature'", () => {
    expect(approvalRuleSchema.safeParse({ ...base, minAmount: 0 }).success).toBe(true);
  });

  it("refuses more than Decimal(15,2) can hold", () => {
    expect(approvalRuleSchema.safeParse({ ...base, minAmount: 1e15 }).success).toBe(false);
  });
});

describe("approval decision schema", () => {
  it("allows a silent approval", () => {
    expect(approvalDecisionSchema.safeParse({ decision: "approve" }).success).toBe(true);
  });

  it("demands a reason on a rejection — 'ditolak' alone is not actionable", () => {
    const result = approvalDecisionSchema.safeParse({ decision: "reject" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("note");

    expect(
      approvalDecisionSchema.safeParse({ decision: "reject", note: "ok" }).success
    ).toBe(false);
    expect(
      approvalDecisionSchema.safeParse({
        decision: "reject",
        note: "Harga di atas kontrak induk",
      }).success
    ).toBe(true);
  });

  it("knows only two decisions", () => {
    expect(approvalDecisionSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

describe("decisionMessage names the document and the ledger consequence", () => {
  it("covers a draft that was never submitted", () => {
    expect(
      decisionMessage({ status: "draft", documentType: "invoice", documentNo: "SI.1" })
    ).toContain("draf");
  });

  it("falls back to the raw type for a value it does not know", () => {
    expect(
      decisionMessage({ status: "approved", documentType: "surat_jalan", documentNo: null })
    ).toContain("surat_jalan");
  });
});

// ─── Penilaian ulang saat dokumen diedit (issue #45) ────────────────────────

const RULE_CORE = { id: 1, documentType: "invoice", minAmount: "100000000", approverRole: "core" };
const RULE_BOS = { id: 2, documentType: "invoice", minAmount: "500000000", approverRole: "bos" };

const approved = (approvedBase: string | null, threshold = "100000000") => ({
  status: "approved",
  thresholdAmount: threshold,
  approvedBaseAmount: approvedBase,
});

describe("reapprovalAction — lubang ambang yang ditutup #45", () => {
  it("dokumen KECIL yang diedit menjadi BESAR wajib masuk antrean", () => {
    // Separuh pertama lubangnya: tanpa pengajuan sebelumnya, nilai baru yang
    // menyentuh ambang harus melahirkan pengajuan — bukan diam-diam terposting.
    expect(reapprovalAction(null, RULE_CORE, "250000000")).toBe("create");
  });

  it("dokumen kecil yang tetap kecil tidak menyentuh apa pun", () => {
    expect(reapprovalAction(null, null, "5000000")).toBe("none");
  });

  it("disetujui pada X lalu dinaikkan MELAMPAUI X → persetujuannya gugur", () => {
    // Separuh kedua lubangnya, dan alasan kolom approved_base_amount ada.
    expect(reapprovalAction(approved("200000000"), RULE_CORE, "900000000")).toBe("revoke");
  });

  it("disetujui pada X lalu DITURUNKAN masih tercakup", () => {
    expect(reapprovalAction(approved("900000000"), RULE_CORE, "200000000")).toBe("keep");
  });

  it("nilai persis sama dengan yang disetujui tetap tercakup", () => {
    expect(reapprovalAction(approved("250000000"), RULE_CORE, "250000000")).toBe("keep");
  });

  it("selisih satu sen di ATAS yang disetujui sudah menggugurkan — perbandingan desimal, bukan float", () => {
    expect(reapprovalAction(approved("250000000.00"), RULE_CORE, "250000000.01")).toBe("revoke");
    expect(reapprovalAction(approved("250000000.01"), RULE_CORE, "250000000.00")).toBe("keep");
  });

  it("naik ke BAND yang lebih ketat menggugurkan meski tak melebihi nilai yang disetujui", () => {
    // Disetujui core pada 600jt dengan ambang 100jt; nilainya turun ke 550jt
    // tetapi kini cocok dengan aturan bos (ambang 500jt) — restu core tak cukup.
    expect(reapprovalAction(approved("600000000", "100000000"), RULE_BOS, "550000000")).toBe(
      "revoke"
    );
  });

  it("nilainya jatuh di bawah semua ambang → tak ada yang perlu diminta lagi", () => {
    expect(reapprovalAction(approved("250000000"), null, "1000000")).toBe("keep");
  });

  it("pengajuan pra-#45 (tanpa catatan nilai disetujui) diperlakukan konservatif", () => {
    // Dianggap disetujui pada AMBANGNYA: naik di atas itu minta persetujuan lagi…
    expect(reapprovalAction(approved(null, "100000000"), RULE_CORE, "300000000")).toBe("revoke");
    // …sedangkan yang di bawah ambang lamanya tetap tercakup.
    expect(reapprovalAction(approved(null, "100000000"), RULE_CORE, "100000000")).toBe("keep");
  });

  it("yang masih menunggu / pernah ditolak hanya disegarkan, statusnya tak dipaksa maju", () => {
    const pending = { status: "pending_approval", thresholdAmount: "100000000" };
    const rejected = { status: "rejected", thresholdAmount: "100000000" };
    expect(reapprovalAction(pending, RULE_BOS, "900000000")).toBe("refresh");
    expect(reapprovalAction(rejected, RULE_CORE, "900000000")).toBe("refresh");
    // Mengajukan ulang setelah ditolak adalah alur #44, bukan efek samping edit.
    expect(reapprovalAction(rejected, RULE_CORE, "900000000")).not.toBe("pending_approval");
  });

  it("tanda minus tidak bisa mengelak — yang diadu adalah besarannya", () => {
    expect(reapprovalAction(approved("200000000"), RULE_CORE, "-900000000")).toBe("revoke");
  });

  it("dokumen tanpa nilai IDR (valas tanpa kurs) tidak tercakup persetujuan lama", () => {
    expect(coveredByApproval(approved("200000000"), null, RULE_CORE.minAmount)).toBe(false);
  });
});

// ─── Pengajuan ulang setelah ditolak (issue #44) ────────────────────────────

describe("canResubmit — hanya dari penolakan", () => {
  it("yang DITOLAK boleh diajukan ulang", () => {
    expect(canResubmit("rejected")).toBe(true);
  });

  it("yang menunggu tidak perlu diajukan ulang", () => {
    expect(canResubmit("pending_approval")).toBe(false);
  });

  it("yang sudah disetujui tidak diajukan ulang — ia digugurkan oleh perubahan nilai (#45)", () => {
    expect(canResubmit("approved")).toBe(false);
  });

  it("status asing ditolak, bukan diloloskan", () => {
    expect(canResubmit("draft")).toBe(false);
    expect(canResubmit("")).toBe(false);
    expect(canResubmit("selesai")).toBe(false);
  });
});

describe("wasResubmitted — diturunkan, tanpa kolom baru", () => {
  it("menunggu + pernah diputus = diajukan ulang", () => {
    expect(wasResubmitted({ status: "pending_approval", decidedAt: "2026-07-20T00:00:00Z" })).toBe(
      true
    );
  });

  it("pengajuan pertama belum pernah diputus", () => {
    expect(wasResubmitted({ status: "pending_approval", decidedAt: null })).toBe(false);
    expect(wasResubmitted({ status: "pending_approval" })).toBe(false);
  });

  it("yang sudah diputus bukan pengajuan ulang", () => {
    expect(wasResubmitted({ status: "rejected", decidedAt: "2026-07-20T00:00:00Z" })).toBe(false);
    expect(wasResubmitted({ status: "approved", decidedAt: "2026-07-20T00:00:00Z" })).toBe(false);
  });

  it("INVARIAN: jejak keputusan yang dipertahankan tidak menyalakan lagi badge notifikasi", () => {
    // Pengajuan ulang sengaja menyimpan decidedAt/decisionNote agar penyetuju
    // membaca alasan penolakan lama. Itu hanya aman karena notifikasi dihitung
    // dari STATUS, bukan dari adanya keputusan — kalau tidak, setiap pengajuan
    // ulang akan muncul sebagai "kabar baru" yang tak pernah bisa dibaca.
    expect(isUnreadDecision({ status: "pending_approval", readAt: null })).toBe(false);
  });
});
