/**
 * Approval transaksi berbasis ambang nilai & peran — pure rules (issue #25).
 *
 * NO Prisma, NO I/O, NO React: the same posture as `@/lib/returns` and
 * `@/lib/delivery-orders`, so every decision below can be unit-tested without a
 * DATABASE_URL and imported from a route, a page, the posting engine or a Zod
 * schema alike. Everything that needs the database (find the rules, write the
 * request, decide it) lives in `@/lib/approval-requests` and the API routes.
 *
 * ── WHICH NUMBER THE THRESHOLD COMPARES AGAINST (decision) ──────────────────
 * The **IDR base amount** (`base_amount`), never the document's own currency
 * amount. A USD 40,000 invoice at 16,250 is IDR 650,000,000 — comparing 40,000
 * against a rupiah threshold would let every export document slip under it. IDR
 * base is also the unit the ledger, the reports and the budget (#29) already
 * speak, so one threshold means one thing across the whole app.
 *
 * A document whose IDR base is UNKNOWN (a foreign-currency row with no rate —
 * legacy shape, see Invoice.rate/Contract.rate) matches NO rule and therefore
 * gets no approval request. That is not a hole: such a document cannot post
 * either — `resolveRate` in the posting engine refuses to value it at 1:1 — so
 * it never reaches the journal, which is exactly what approval protects.
 *
 * ── SIGN: MAGNITUDE DECIDES ─────────────────────────────────────────────────
 * The comparison uses the ABSOLUTE base value. A −650,000,000 document is as
 * significant as a +650,000,000 one, and letting a minus sign duck the ambang
 * would be a bypass rather than a rule.
 *
 * ── DECIMAL-SAFE, NOT FLOAT ─────────────────────────────────────────────────
 * Money is `Decimal(15,2)` and arrives from Prisma as a Decimal object whose
 * `toString()` is exact. `compareDecimal` parses the DECIMAL TEXT into aligned
 * integer digit strings and compares those, so an exact-threshold document
 * (base 500,000,000.00 vs ambang 500,000,000.00) is decided by integer equality
 * and never by `0.1 + 0.2 !== 0.3` arithmetic. Nothing here ever calls Number()
 * on a money value.
 */

// ─── Enum-like vocabularies (snake_case, mirrored by Zod) ───────────────────

/** Jenis dokumen yang bisa punya aturan approval (issue #25: kontrak/faktur/pembayaran). */
export const APPROVAL_DOCUMENT_TYPES = ["contract", "invoice", "payment"] as const;
export type ApprovalDocumentType = (typeof APPROVAL_DOCUMENT_TYPES)[number];

export const APPROVAL_DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  contract: "Kontrak",
  invoice: "Faktur",
  payment: "Pembayaran",
};

/**
 * Status persetujuan sebuah dokumen: `draft` → `pending_approval` →
 * `approved`/`rejected`. Stored on `approval_requests.status`, not on the
 * document tables — see the model comment in schema.prisma for why.
 */
export const APPROVAL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Draf",
  pending_approval: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/**
 * The posting `sourceType`s an approval request can be attached to — i.e. the
 * documents whose journal the gate can hold back. Deliberately the same literals
 * `PostingSourceType` uses, so `approval_requests.source_type` is the key the
 * posting engine already has in hand and no translation table is needed.
 */
export const APPROVAL_SOURCE_TYPES = [
  "contract",
  "invoice",
  "contract_payment",
  "invoice_payment",
  "supplier_transaction",
] as const;
export type ApprovalSourceType = (typeof APPROVAL_SOURCE_TYPES)[number];

/**
 * Which rule category a posting source falls under. The three payment shapes
 * (pelunasan faktur, pelunasan kontrak, pembayaran supplier) are all
 * "Pembayaran" for rule purposes — a Manager sets one ambang for money going
 * out/in, not three. Anything else (stock movement, depreciation, opening
 * balance…) has no approval category at all and is never gated.
 */
export function documentTypeForSource(
  sourceType: string | null | undefined
): ApprovalDocumentType | null {
  switch (sourceType) {
    case "contract":
      return "contract";
    case "invoice":
      return "invoice";
    case "contract_payment":
    case "invoice_payment":
    case "supplier_transaction":
      return "payment";
    default:
      return null;
  }
}

// ─── Decimal-safe comparison ────────────────────────────────────────────────

/**
 * Anything that carries a decimal value exactly in its text form: a Prisma
 * `Decimal`, a string from a form, or a plain number.
 */
export type DecimalLike = number | string | { toString(): string } | null | undefined;

interface ParsedDecimal {
  negative: boolean;
  /** Unscaled digits, no sign, no dot. Value = digits / 10^scale. */
  digits: string;
  scale: number;
}

const DECIMAL_PATTERN = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/**
 * Decimal text → sign + unscaled digits + scale. Returns null for anything that
 * is not a finite decimal (empty string, "abc", NaN, Infinity) so callers can
 * treat "no comparable value" as its own case rather than as zero.
 */
function parseDecimal(value: DecimalLike): ParsedDecimal | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const text = String(value).trim();
  if (text === "") return null;

  const match = DECIMAL_PATTERN.exec(text);
  if (!match) return null;

  const [, sign, intPart = "", fracPart = "", expPart] = match;
  if (intPart === "" && fracPart === "") return null; // "." / "+" / "e5"

  let digits = `${intPart}${fracPart}`;
  let scale = fracPart.length - (expPart ? parseInt(expPart, 10) : 0);

  // Negative scale means the exponent moved the point right past every digit;
  // pad with zeros so the value stays an integer count of units.
  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }

  const trimmed = digits.replace(/^0+/, "");
  return {
    negative: sign === "-" && trimmed !== "",
    digits: trimmed === "" ? "0" : trimmed,
    scale,
  };
}

/**
 * Unscaled digits of a parsed decimal restated at `targetScale` — i.e. the
 * integer count of 10^-targetScale units, as text. Digits, not Number: an
 * IDR base of 9,999,999,999,999.99 is 999,999,999,999,999 hundredths, past
 * `Number.MAX_SAFE_INTEGER`'s comfort and exactly the kind of value this
 * comparison must not fumble.
 */
function alignedDigits(parsed: ParsedDecimal, targetScale: number): string {
  return parsed.digits + "0".repeat(targetScale - parsed.scale);
}

/** −1 / 0 / 1 comparing two non-negative integers written as digit strings. */
function compareDigits(a: string, b: string): -1 | 0 | 1 {
  const x = a.replace(/^0+/, "") || "0";
  const y = b.replace(/^0+/, "") || "0";
  if (x.length !== y.length) return x.length > y.length ? 1 : -1;
  if (x === y) return 0;
  return x > y ? 1 : -1; // same length ⇒ lexicographic order is numeric order
}

/**
 * −1 / 0 / 1 for a < b, a === b, a > b — computed on aligned integer digits,
 * never on floats. Returns null when either side has no comparable value.
 */
export function compareDecimal(a: DecimalLike, b: DecimalLike): -1 | 0 | 1 | null {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (!left || !right) return null;

  const scale = Math.max(left.scale, right.scale);
  const x = alignedDigits(left, scale);
  const y = alignedDigits(right, scale);

  const magnitude = compareDigits(x, y);
  if (magnitude === 0 && left.negative === right.negative) return 0;
  if (left.negative === right.negative) {
    // Both negative: the bigger magnitude is the smaller number.
    return left.negative ? (magnitude === 1 ? -1 : 1) : magnitude;
  }
  // Different signs — but only if one of them is actually non-zero, since −0 is 0.
  if (magnitude === 0 && compareDigits(x, "0") === 0) return 0;
  return left.negative ? -1 : 1;
}

/**
 * `value >= threshold`, decimal-exact. The ambang is INCLUSIVE: a document
 * worth exactly the threshold needs approval. That is the reading a user
 * expects from "persetujuan untuk transaksi mulai dari Rp 500.000.000" and it
 * removes the one-rupiah ambiguity at the boundary.
 */
export function decimalAtLeast(value: DecimalLike, threshold: DecimalLike): boolean {
  const cmp = compareDecimal(value, threshold);
  return cmp !== null && cmp >= 0;
}

/** The magnitude of a decimal, as text — the number the ambang is measured on. */
export function absoluteDecimal(value: DecimalLike): string | null {
  const parsed = parseDecimal(value);
  if (!parsed) return null;
  if (parsed.scale === 0) return parsed.digits;
  const padded = parsed.digits.padStart(parsed.scale + 1, "0");
  const cut = padded.length - parsed.scale;
  return `${padded.slice(0, cut)}.${padded.slice(cut)}`;
}

// ─── Rule matching ──────────────────────────────────────────────────────────

/** The slice of an `approval_rules` row the matcher needs. */
export interface ApprovalRuleLike {
  id: number;
  documentType: string;
  /** Ambang nilai in IDR base. Inclusive. */
  minAmount: DecimalLike;
  approverRole: string;
  /** Absent is treated as active — a caller that already filtered need not say so. */
  isActive?: boolean;
}

export interface ApprovalMatchInput {
  documentType: ApprovalDocumentType | string;
  /** Nilai dokumen dalam IDR base. `null` = tak bisa dinilai (lihat header). */
  baseAmount: DecimalLike;
}

/**
 * The rule that governs a document, or null when none does.
 *
 * ── WHEN SEVERAL RULES MATCH ────────────────────────────────────────────────
 * Rules are bands: "≥ 100jt perlu persetujuan core, ≥ 1M perlu persetujuan
 * bos". A 2M document satisfies both, and the answer must be the STRICTEST band
 * it reaches — the highest `minAmount` — otherwise adding a tighter high-value
 * rule would be silently overridden by a looser low-value one. Ties (two rules
 * with the same ambang for the same jenis dokumen) fall to the LOWEST id, so the
 * outcome is deterministic and the older rule keeps its meaning.
 */
export function matchApprovalRule(
  rules: readonly ApprovalRuleLike[],
  input: ApprovalMatchInput
): ApprovalRuleLike | null {
  const magnitude = absoluteDecimal(input.baseAmount);
  if (magnitude === null) return null; // unvaluable document — see module header

  let best: ApprovalRuleLike | null = null;
  for (const rule of rules) {
    if (rule.isActive === false) continue;
    if (rule.documentType !== input.documentType) continue;
    if (!decimalAtLeast(magnitude, rule.minAmount)) continue;

    if (best === null) {
      best = rule;
      continue;
    }
    const cmp = compareDecimal(rule.minAmount, best.minAmount);
    if (cmp === 1 || (cmp === 0 && rule.id < best.id)) best = rule;
  }
  return best;
}

/** Does this document need somebody's signature before it can be posted? */
export function requiresApproval(
  rules: readonly ApprovalRuleLike[],
  input: ApprovalMatchInput
): boolean {
  return matchApprovalRule(rules, input) !== null;
}

// ─── State machine ──────────────────────────────────────────────────────────

/**
 * `draft` → `pending_approval` → `approved` | `rejected`, plus one edge back:
 * a REJECTED document may be revised and submitted again. `approved` is
 * terminal — a document whose journal is already in the ledger is un-approved
 * by reversing the journal (issue #9's rule), never by editing this status.
 */
const ALLOWED_TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: [],
  rejected: ["pending_approval"],
};

export class ApprovalTransitionError extends Error {
  readonly from: string;
  readonly to: string;
  constructor(from: string, to: string) {
    super(
      `Status persetujuan tidak bisa berpindah dari "${
        APPROVAL_STATUS_LABELS[from as ApprovalStatus] ?? from
      }" ke "${APPROVAL_STATUS_LABELS[to as ApprovalStatus] ?? to}".`
    );
    this.name = "ApprovalTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return APPROVAL_STATUSES.includes(value as ApprovalStatus);
}

export function canTransition(from: string, to: string): boolean {
  if (!isApprovalStatus(from) || !isApprovalStatus(to)) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) throw new ApprovalTransitionError(from, to);
}

/** Which status a decision produces. */
export function statusForDecision(decision: "approve" | "reject"): ApprovalStatus {
  return decision === "approve" ? "approved" : "rejected";
}

// ─── The posting gate (pure half) ───────────────────────────────────────────

/**
 * Must this document be kept OUT of the journal?
 *
 * `null`/`undefined` — no approval request exists — means NOT blocked, and that
 * single line is what makes the feature backward-compatible: every document that
 * predates issue #25, and every new document below the ambang, has no request
 * row and therefore posts exactly as it always did. Only a document that was
 * actually put in front of an approver can be held back, and only until they
 * say yes.
 */
export function blocksPosting(status: string | null | undefined): boolean {
  if (status === null || status === undefined) return false;
  return status !== "approved";
}

// ─── Penilaian ulang saat dokumen diedit (issue #45) ────────────────────────

/**
 * Pengajuan yang sudah melekat pada sebuah dokumen, sejauh yang dibutuhkan
 * penilaian ulang. Sengaja struktural (bukan tipe Prisma) agar modul ini tetap
 * murni dan bisa diuji tanpa basis data.
 */
export interface ExistingApprovalLike {
  status: string;
  /** Ambang yang berlaku saat pengajuan dibuat/terakhir dinilai. */
  thresholdAmount: DecimalLike;
  /**
   * Nilai IDR yang BENAR-BENAR disetujui. Diisi saat penyetuju menekan setuju.
   * `null` pada pengajuan lama (pra-#45) — lihat `coveredByApproval` di bawah
   * untuk sikap konservatif yang diambil dalam kasus itu.
   */
  approvedBaseAmount?: DecimalLike;
}

/**
 * Apa yang harus dilakukan pada pengajuan sebuah dokumen setelah dokumennya
 * diedit.
 *
 *  • `none`    — tak ada aturan yang cocok dan memang belum ada pengajuan;
 *  • `create`  — nilainya kini mencapai ambang padahal sebelumnya tidak;
 *  • `refresh` — pengajuan yang masih menunggu/ditolak: nilainya diperbarui;
 *  • `keep`    — sudah disetujui dan perubahannya masih tercakup;
 *  • `revoke`  — sudah disetujui tetapi nilainya melampaui yang disetujui (atau
 *                kini menyentuh band yang lebih ketat), jadi persetujuannya
 *                gugur dan dokumennya kembali menunggu keputusan.
 */
export type ReapprovalAction = "none" | "create" | "refresh" | "keep" | "revoke";

/**
 * Apakah nilai baru masih tercakup oleh persetujuan yang sudah diberikan?
 *
 * Dua syarat, dan keduanya harus benar:
 *  1. nilainya TIDAK NAIK melebihi yang disetujui — menyetujui Rp 500 juta tidak
 *     berarti menyetujui Rp 900 juta, sedangkan turun ke Rp 100 juta jelas masih
 *     tercakup (yang lebih besar sudah direstui);
 *  2. band-nya tidak menjadi lebih ketat — bila kini cocok dengan aturan
 *     ber-ambang lebih tinggi (mis. yang mengharuskan bos, bukan core), keputusan
 *     lama diberikan oleh peran yang mungkin tak berwenang untuk band itu.
 *
 * Pengajuan lama tanpa `approvedBaseAmount` (dibuat sebelum #45) dianggap
 * disetujui pada ambangnya sendiri — pilihan konservatif: kalau ragu, mintalah
 * persetujuan lagi, jangan diam-diam meloloskan nilai yang belum pernah dilihat
 * siapa pun.
 */
export function coveredByApproval(
  existing: ExistingApprovalLike,
  newBaseAmount: DecimalLike,
  matchedRuleMinAmount: DecimalLike
): boolean {
  const approvedAt =
    existing.approvedBaseAmount === null || existing.approvedBaseAmount === undefined
      ? existing.thresholdAmount
      : existing.approvedBaseAmount;

  const newMagnitude = absoluteDecimal(newBaseAmount);
  const approvedMagnitude = absoluteDecimal(approvedAt);
  if (newMagnitude === null || approvedMagnitude === null) return false;

  // (1) naik melebihi yang disetujui?
  if (compareDecimal(newMagnitude, approvedMagnitude) === 1) return false;

  // (2) band menjadi lebih ketat?
  if (compareDecimal(matchedRuleMinAmount, existing.thresholdAmount) === 1) return false;

  return true;
}

/**
 * Keputusan penilaian ulang untuk satu dokumen yang baru saja diedit.
 *
 * INI ADALAH LUBANG KONTROL YANG DITUTUP ISSUE #45: sebelum ini, pengajuan hanya
 * dibuat saat dokumen PERTAMA kali ditulis, sehingga dokumen kecil bisa diedit
 * menjadi besar — atau dokumen yang sudah disetujui pada nilai X diedit menjadi
 * jauh di atas X — dan tetap masuk jurnal tanpa pernah disetujui siapa pun.
 *
 * `rejected` sengaja dibiarkan `rejected` (nilainya tetap disegarkan): mengajukan
 * ulang setelah ditolak adalah alur tersendiri (#44), bukan efek samping edit.
 */
export function reapprovalAction(
  existing: ExistingApprovalLike | null,
  matchedRule: ApprovalRuleLike | null,
  newBaseAmount: DecimalLike
): ReapprovalAction {
  // Belum pernah ada pengajuan: dokumen kecil yang diedit menjadi besar HARUS
  // masuk antrean sekarang — inilah separuh pertama lubang #45.
  if (!existing) return matchedRule ? "create" : "none";

  // Masih menunggu / pernah ditolak: nilainya disegarkan, statusnya tidak
  // dipaksa maju. Mengajukan ulang setelah ditolak adalah alur #44.
  if (existing.status !== "approved") return "refresh";

  // Sudah disetujui, lalu nilainya turun di bawah semua ambang: tak ada yang
  // perlu diminta lagi.
  if (!matchedRule) return "keep";

  // Separuh kedua lubang #45: disetujui pada nilai X, diedit jauh di atas X.
  return coveredByApproval(existing, newBaseAmount, matchedRule.minAmount) ? "keep" : "revoke";
}

// ─── Pengajuan ulang setelah ditolak (issue #44) ────────────────────────────

/**
 * Bolehkah pengajuan ini diajukan ulang?
 *
 * Hanya dari `rejected` — satu-satunya sisi balik pada mesin status. Yang masih
 * `pending_approval` sudah di antrean (tak ada yang perlu diulang), dan yang
 * `approved` tidak diajukan ulang melainkan digugurkan oleh perubahan nilainya
 * sendiri (#45).
 */
export function canResubmit(status: string): boolean {
  return canTransition(status, "pending_approval") && status === "rejected";
}

/**
 * Apakah baris ini sedang menunggu keputusan SETELAH pernah ditolak?
 *
 * Diturunkan, bukan disimpan: pengajuan ulang mempertahankan jejak keputusan
 * sebelumnya (`decidedAt` + `decisionNote`) justru agar penyetuju melihat alasan
 * penolakan yang lalu saat menimbang yang baru. Pengajuan pertama punya
 * `decidedAt` kosong, dan persetujuan yang gugur karena dokumennya diedit (#45)
 * membersihkannya — jadi kombinasi "menunggu + pernah diputus" hanya mungkin
 * berarti diajukan ulang. Itu sebabnya #44 tidak butuh kolom baru.
 */
export function wasResubmitted(request: {
  status: string;
  decidedAt?: Date | string | null;
}): boolean {
  return request.status === "pending_approval" && !!request.decidedAt;
}

// ─── In-app notification (issue #25, "notifikasi sederhana") ────────────────

/**
 * A decided request the requester has not opened yet. No new table, no new
 * infrastructure: the notification IS the approval request, and `read_at` is
 * when its author saw the outcome. `pending_approval` is not a notification —
 * the requester is the one who raised it.
 */
export function isUnreadDecision(request: {
  status: string;
  readAt?: Date | string | null;
}): boolean {
  if (request.status !== "approved" && request.status !== "rejected") return false;
  return request.readAt === null || request.readAt === undefined;
}

/** Count of decided-but-unopened outcomes — the requester's navbar badge. */
export function countUnreadDecisions(
  requests: readonly { status: string; readAt?: Date | string | null }[]
): number {
  return requests.reduce((n, r) => n + (isUnreadDecision(r) ? 1 : 0), 0);
}

/** One line of plain Indonesian describing what happened to a request. */
export function decisionMessage(request: {
  status: string;
  documentType: string;
  documentNo?: string | null;
}): string {
  const jenis =
    APPROVAL_DOCUMENT_TYPE_LABELS[request.documentType as ApprovalDocumentType] ??
    request.documentType;
  const nomor = request.documentNo ? ` ${request.documentNo}` : "";
  switch (request.status) {
    case "approved":
      return `${jenis}${nomor} disetujui dan sudah masuk jurnal.`;
    case "rejected":
      return `${jenis}${nomor} ditolak — belum masuk jurnal.`;
    case "pending_approval":
      return `${jenis}${nomor} menunggu persetujuan.`;
    default:
      return `${jenis}${nomor} masih draf.`;
  }
}
