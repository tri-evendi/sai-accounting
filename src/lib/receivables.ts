/**
 * Piutang (AR) & Utang (AP) — outstanding balances, aging and payment status.
 *
 * Read-only reporting over existing documents. Nothing here writes, and nothing
 * here touches the posting engine: the ledger remains the accounting truth, this
 * module answers "who owes what, and how old is it" from the source documents.
 *
 * ── The one rule that matters: never add two currencies ──────────────────────
 * A USD invoice paid partly in USD and partly in IDR has no meaningful total in
 * either currency alone. Every cross-document and cross-payment sum in this file
 * is therefore done in **IDR base** (`base_amount`, or `amount × rate`), which is
 * the same unit the ledger posts in. The document's own currency and amount are
 * carried alongside for display, never summed across documents. A foreign-currency
 * row with no rate has *no* IDR value — it is excluded from the sums and counted
 * in `unratedCount` so the UI can say so out loud, rather than being folded in at
 * face value (the bug issue #35 fixed on the invoice detail page).
 *
 * ── Payment status is derived, never stored ──────────────────────────────────
 * `deriveStatus` is a pure function of (total, paid, due date, as-of date). There
 * is deliberately no `payment_status` column: a denormalised copy would drift the
 * moment a payment is added, edited or deleted, and AC "status ter-update otomatis
 * saat ada pembayaran" is satisfied for free when the status is computed on read.
 *
 * ── Due dates ────────────────────────────────────────────────────────────────
 * `due_date` (migration 0007) is explicit, user-entered and NULLable. It is never
 * derived from `contracts.top1`/`top2`, which are free-text commercial terms
 * ("30% advance, 70% on B/L"), not dates. A document with no due date is aged
 * from its document date and is reported as age-since-issue; it can never be
 * `overdue`, because we do not know that it is.
 */
import { prisma } from "@/lib/prisma";

/** Half a cent — money is Decimal(15,2), so anything under this is rounding noise. */
const EPSILON = 0.005;

export const BASE_CURRENCY = "IDR";

/** Derived payment state of a document. Mutually exclusive; computed, not stored. */
export type PaymentStatus = "paid" | "partial" | "unpaid" | "overdue";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Lunas",
  partial: "Sebagian",
  unpaid: "Belum Bayar",
  overdue: "Jatuh Tempo",
};

/** Aging buckets required by issue #12: 0-30 / 31-60 / 61-90 / >90 days. */
export type AgingBucket = "b0_30" | "b31_60" | "b61_90" | "b90_plus";

export const AGING_BUCKETS: AgingBucket[] = ["b0_30", "b31_60", "b61_90", "b90_plus"];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  b0_30: "0–30 hari",
  b31_60: "31–60 hari",
  b61_90: "61–90 hari",
  b90_plus: "> 90 hari",
};

/** A money row as stored: original amount + currency, with optional IDR conversion. */
export interface MoneyRow {
  amount: unknown;
  currency?: string | null;
  rate?: unknown;
  baseAmount?: unknown;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * IDR-base value of a money row, or `null` when it genuinely has none.
 *
 * Order matters: a stored `base_amount` is the rate that was actually posted to
 * the ledger, so it wins over recomputing from `rate`. IDR rows are 1:1. A
 * foreign row with neither `base_amount` nor `rate` returns null — the caller
 * must exclude it rather than treat `amount` as if it were rupiah.
 */
export function toBase(row: MoneyRow): number | null {
  if (row.baseAmount != null) return num(row.baseAmount);
  const currency = row.currency || BASE_CURRENCY;
  if (currency === BASE_CURRENCY) return num(row.amount);
  if (row.rate != null) {
    const rate = num(row.rate);
    if (rate > 0) return num(row.amount) * rate;
  }
  return null;
}

/** Whole days between two dates, floored. Negative when `date` is in the future. */
export function ageInDays(date: Date, asOf: Date): number {
  const MS_PER_DAY = 86_400_000;
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return Math.floor((b - a) / MS_PER_DAY);
}

/** Map an age in days onto an aging bucket. Ages <= 0 land in the youngest bucket. */
export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90_plus";
}

export interface StatusInput {
  /** Document value in IDR base, or null when the document has no usable rate. */
  totalBase: number | null;
  /** Payments received, in IDR base. */
  paidBase: number;
  /** Explicit due date, or null when unknown. */
  dueDate: Date | null;
  asOf: Date;
}

/**
 * Payment status of a document.
 *
 * Precedence: `paid` first — a settled document is never "overdue", however old.
 * Then `overdue`, which outranks partial/unpaid because it is the state that
 * needs action; the partially-paid detail is still visible in the outstanding
 * column. A null `dueDate` can never produce `overdue` (see file header).
 *
 * When `totalBase` is null the document value is unknown, so we cannot claim it
 * is settled — it degrades to unpaid/partial/overdue on the strength of payments
 * alone, never to `paid`.
 */
export function deriveStatus({ totalBase, paidBase, dueDate, asOf }: StatusInput): PaymentStatus {
  if (totalBase != null && paidBase >= totalBase - EPSILON) return "paid";
  if (dueDate != null && ageInDays(dueDate, asOf) > 0) return "overdue";
  if (paidBase > EPSILON) return "partial";
  return "unpaid";
}

/** One document (invoice / contract / supplier purchase) with its balance worked out. */
export interface OutstandingDocument {
  /** Document value in its own currency. */
  total: number;
  currency: string;
  /** Document value in IDR base; null when a foreign document carries no rate. */
  totalBase: number | null;
  /** Payments in IDR base. Rows with no determinable rate are excluded. */
  paidBase: number;
  /** Remaining in IDR base, floored at 0; null when `totalBase` is null. */
  outstandingBase: number | null;
  /**
   * Remaining in the document's own currency. Only populated when every payment
   * was made in that same currency — otherwise there is no honest single-currency
   * answer and this stays null.
   */
  outstanding: number | null;
  /** Foreign payments with no rate, so with no IDR value to count. */
  unratedCount: number;
  status: PaymentStatus;
  /** Days since due date if known, else days since document date. */
  ageDays: number;
  /** True when `ageDays` counts from the document date because no due date exists. */
  ageFromIssue: boolean;
  bucket: AgingBucket;
  dueDate: Date | null;
}

export interface SettleInput {
  /** Gross document value in `currency`. */
  total: number;
  currency: string;
  /** Stored IDR base of the document, if any. */
  totalBase?: number | null;
  /** Document rate, used to derive the IDR base when `totalBase` is absent. */
  rate?: number | null;
  date: Date;
  dueDate?: Date | null;
  payments: MoneyRow[];
  asOf: Date;
}

/**
 * Outstanding + aging + status for a single document.
 *
 * Aging keys on the due date when there is one (so the age is genuinely "days
 * overdue") and falls back to the document date otherwise (age since issue).
 * `ageFromIssue` tells the UI which of the two it is looking at, so the column
 * can be labelled honestly instead of implying every row is overdue.
 */
export function settleDocument(input: SettleInput): OutstandingDocument {
  const { total, currency, date, asOf } = input;
  const dueDate = input.dueDate ?? null;

  const totalBase = toBase({
    amount: total,
    currency,
    rate: input.rate ?? null,
    baseAmount: input.totalBase ?? null,
  });

  let paidBase = 0;
  let unratedCount = 0;
  let paidSameCurrency = 0;
  let allPaymentsInDocCurrency = true;

  for (const p of input.payments) {
    const base = toBase(p);
    if (base == null) {
      unratedCount += 1;
      allPaymentsInDocCurrency = false;
      continue;
    }
    paidBase += base;
    if ((p.currency || BASE_CURRENCY) === currency) paidSameCurrency += num(p.amount);
    else allPaymentsInDocCurrency = false;
  }

  paidBase = round2(paidBase);

  const outstandingBase =
    totalBase == null ? null : Math.max(0, round2(totalBase - paidBase));
  const outstanding = allPaymentsInDocCurrency
    ? Math.max(0, round2(total - paidSameCurrency))
    : null;

  const status = deriveStatus({ totalBase, paidBase, dueDate, asOf });
  const ageFromIssue = dueDate == null;
  const ageDays = ageInDays(dueDate ?? date, asOf);

  return {
    total,
    currency,
    totalBase,
    paidBase,
    outstandingBase,
    outstanding,
    unratedCount,
    status,
    ageDays,
    ageFromIssue,
    bucket: agingBucket(ageDays),
    dueDate,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Totals per aging bucket, in IDR base. */
export type AgingTotals = Record<AgingBucket, number>;

export function emptyAgingTotals(): AgingTotals {
  return { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };
}

/**
 * Sum outstanding into aging buckets. Settled documents contribute nothing, and
 * documents with no determinable IDR value are skipped (they are surfaced via
 * `unresolved` instead of quietly distorting a bucket).
 */
export function summarizeAging(docs: Pick<OutstandingDocument, "outstandingBase" | "bucket">[]) {
  const buckets = emptyAgingTotals();
  let total = 0;
  let unresolved = 0;
  for (const d of docs) {
    if (d.outstandingBase == null) {
      unresolved += 1;
      continue;
    }
    if (d.outstandingBase <= EPSILON) continue;
    buckets[d.bucket] += d.outstandingBase;
    total += d.outstandingBase;
  }
  for (const k of AGING_BUCKETS) buckets[k] = round2(buckets[k]);
  return { buckets, total: round2(total), unresolved };
}

/* ─────────────────────────── Payables allocation ──────────────────────────── */

export interface FifoPurchase {
  id: number;
  date: Date;
  /** IDR-base value of the purchase, or null when it has no usable rate. */
  base: number | null;
}

export interface FifoResult {
  /** Payment applied to each purchase id, in IDR base. */
  applied: Map<number, number>;
  /** Payment left over after every purchase was covered (overpayment / prepayment). */
  unapplied: number;
}

/**
 * Allocate supplier payments across supplier purchases, oldest purchase first.
 *
 * `supplier_transactions` records purchases and payments as sibling rows with no
 * link between them — there is no allocation table and no `purchase_id` on a
 * payment. Per-document AP aging therefore requires an allocation *policy*, and
 * oldest-first (FIFO) is the standard one, matching how a supplier statement is
 * normally settled. This is an assumption, not recorded fact: if a supplier is
 * paid out of order the per-row split will differ from reality, though the
 * supplier's total outstanding is exact either way.
 *
 * Allocation runs in IDR base for the same reason every other sum here does —
 * purchases and payments may be in different currencies.
 */
export function allocatePaymentsFifo(purchases: FifoPurchase[], totalPaidBase: number): FifoResult {
  const applied = new Map<number, number>();
  let remaining = totalPaidBase;

  const ordered = [...purchases].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    return d !== 0 ? d : a.id - b.id;
  });

  for (const p of ordered) {
    if (p.base == null) continue; // no IDR value: cannot absorb payment
    if (remaining <= EPSILON) {
      applied.set(p.id, 0);
      continue;
    }
    const take = Math.min(p.base, remaining);
    applied.set(p.id, round2(take));
    remaining = round2(remaining - take);
  }

  return { applied, unapplied: Math.max(0, round2(remaining)) };
}

/**
 * One recorded `supplier_payment_allocations` row, already reduced to IDR base.
 *
 * `base` is null when the underlying payment carries no usable rate — such an
 * allocation states *which* purchase was settled but not *how much* in rupiah,
 * so it is counted and excluded rather than valued 1:1.
 */
export interface RecordedAllocation {
  purchaseId: number;
  base: number | null;
}

export interface AllocationResult extends FifoResult {
  /**
   * Purchases whose applied total includes a FIFO-estimated component. The UI
   * must label these as an assumption; purchases absent from this set are
   * settled by explicitly recorded allocations only.
   */
  estimated: Set<number>;
  /** Allocations with no determinable IDR value, so excluded from the sums. */
  unratedAllocations: number;
}

/**
 * Allocate supplier payments across purchases using recorded allocations first,
 * then FIFO for whatever is left over (issue #37).
 *
 * Since migration 0009 a payment may name the purchase(s) it settles. Those rows
 * are fact and are applied verbatim. But allocation was introduced into a live
 * table: every payment recorded before it has no allocation and never will, its
 * true target being nowhere on record. So the two mechanisms run side by side
 * rather than one replacing the other — recorded allocations bind, and only the
 * *unallocated remainder* (whole legacy payments, plus the unapplied part of a
 * partially-allocated new one) is spread oldest-first as before. Purchases that
 * absorb any of that remainder come back in `estimated` so the page can say the
 * split is a guess instead of presenting it as data.
 *
 * THE INVARIANT: total applied is `min(total paid, total purchase value)` under
 * every input, so a supplier's outstanding balance is byte-identical whether its
 * payments are allocated or not — allocation redistributes the split across rows
 * and never creates or destroys money. Two rules keep that true: an allocation is
 * capped at its purchase's own value, and any excess spills back into the FIFO
 * pool instead of vanishing.
 *
 * Everything here is IDR base, for the reason given in the file header: purchases
 * and payments may be in different currencies and must never be added raw.
 */
export function allocatePayments(
  purchases: FifoPurchase[],
  recorded: RecordedAllocation[],
  unallocatedPoolBase: number
): AllocationResult {
  const applied = new Map<number, number>();
  const byId = new Map<number, FifoPurchase>();
  for (const p of purchases) {
    applied.set(p.id, 0);
    byId.set(p.id, p);
  }

  let unratedAllocations = 0;
  let pool = round2(unallocatedPoolBase);

  // Phase 1 — recorded allocations. These are what the user actually said.
  for (const a of recorded) {
    const purchase = byId.get(a.purchaseId);
    if (a.base == null || purchase == null || purchase.base == null) {
      // No IDR value (or the purchase is not this supplier's / has no rate):
      // cannot be summed, so it is surfaced instead of guessed at.
      unratedAllocations += 1;
      continue;
    }
    const already = applied.get(a.purchaseId) ?? 0;
    const room = Math.max(0, round2(purchase.base - already));
    const take = Math.min(a.base, room);
    applied.set(a.purchaseId, round2(already + take));
    // Allocated beyond what this document is worth: the excess did not settle
    // this purchase, so it rejoins the pool. The API rejects over-allocation at
    // write time; this keeps the supplier total exact even if data slips past.
    if (a.base > take + EPSILON) pool = round2(pool + (a.base - take));
  }

  // Phase 2 — FIFO for the remainder, oldest purchase first.
  const estimated = new Set<number>();
  const ordered = [...purchases].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    return d !== 0 ? d : a.id - b.id;
  });

  let remaining = pool;
  for (const p of ordered) {
    if (p.base == null) continue; // no IDR value: cannot absorb payment
    if (remaining <= EPSILON) break;
    const already = applied.get(p.id) ?? 0;
    const room = Math.max(0, round2(p.base - already));
    if (room <= EPSILON) continue;
    const take = Math.min(room, remaining);
    applied.set(p.id, round2(already + take));
    estimated.add(p.id);
    remaining = round2(remaining - take);
  }

  return {
    applied,
    estimated,
    unapplied: Math.max(0, round2(remaining)),
    unratedAllocations,
  };
}

/* ──────────────────────────── Data access (AR) ─────────────────────────────── */

export interface ReceivableRow extends OutstandingDocument {
  kind: "invoice" | "contract";
  id: number;
  documentNo: string;
  partyName: string;
  date: Date;
  /** Free-text payment terms, shown verbatim. Never parsed into a due date. */
  terms: string | null;
  href: string;
}

export interface LedgerQuery {
  asOf?: Date;
  /** Keep only documents past their due date. Rows with no due date are excluded. */
  overdueOnly?: boolean;
}

/** Line value of an invoice in its own currency, before tax. */
function invoiceSubtotal(items: { quantity: unknown; price: unknown }[]): number {
  return items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0);
}

function contractSubtotal(items: { bags: unknown; kgPerBag: unknown; pricePerKg: unknown }[]): number {
  return items.reduce((s, i) => s + num(i.bags) * num(i.kgPerBag) * num(i.pricePerKg), 0);
}

/**
 * Every open receivable: sales invoices plus contracts that carry payments.
 *
 * Both document types land in one list because both create a claim on a customer
 * and both are settled by their own payment rows. Cancelled documents are left
 * out — they are not receivable.
 */
export async function getReceivables(query: LedgerQuery = {}, client = prisma) {
  const asOf = query.asOf ?? new Date();

  const [invoices, contracts] = await Promise.all([
    client.invoice.findMany({
      where: { status: { not: "canceled" } },
      include: { items: true, payments: true, customer: true },
      orderBy: { date: "desc" },
    }),
    client.contract.findMany({
      where: { status: { not: "canceled" } },
      include: { items: true, payments: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const rows: ReceivableRow[] = [];

  for (const inv of invoices) {
    const total = invoiceSubtotal(inv.items) + num(inv.taxAmount);
    if (total <= EPSILON) continue;
    const doc = settleDocument({
      total,
      currency: inv.currency || BASE_CURRENCY,
      totalBase: inv.baseAmount == null ? null : num(inv.baseAmount),
      rate: inv.rate == null ? null : num(inv.rate),
      date: inv.date,
      dueDate: inv.dueDate,
      payments: inv.payments,
      asOf,
    });
    rows.push({
      ...doc,
      kind: "invoice",
      id: inv.id,
      documentNo: inv.invoiceNo,
      partyName: inv.customer?.name ?? "Tanpa pelanggan",
      date: inv.date,
      terms: null,
      href: `/invoices/${inv.id}`,
    });
  }

  for (const c of contracts) {
    const total = contractSubtotal(c.items);
    if (total <= EPSILON) continue;
    // Contracts carry their own rate + IDR base since migration 0008 (issue #36),
    // so a rated foreign contract now counts toward the IDR totals. Legacy rows
    // predate the column and keep a NULL rate: `toBase` returns null for them and
    // they stay listed-but-excluded, rather than being silently valued 1:1.
    const doc = settleDocument({
      total,
      currency: c.currency || BASE_CURRENCY,
      totalBase: c.baseAmount == null ? null : num(c.baseAmount),
      rate: c.rate == null ? null : num(c.rate),
      date: c.date,
      dueDate: c.dueDate,
      payments: c.payments,
      asOf,
    });
    rows.push({
      ...doc,
      kind: "contract",
      id: c.id,
      documentNo: c.contractNo,
      partyName: c.buyer,
      date: c.date,
      terms: [c.top1, c.top2].filter(Boolean).join(" · ") || null,
      href: `/contracts/${c.id}`,
    });
  }

  return finishLedger(rows, query);
}

/* ──────────────────────────── Data access (AP) ─────────────────────────────── */

export interface PayableRow extends OutstandingDocument {
  kind: "purchase";
  id: number;
  documentNo: string;
  partyName: string;
  date: Date;
  terms: string | null;
  href: string;
  /**
   * True when part of this row's paid amount comes from the FIFO fallback rather
   * than a recorded allocation — i.e. the per-row split is an assumption. The UI
   * must mark these; see the note on `allocatePayments`.
   */
  allocationEstimated: boolean;
}

/**
 * Every open payable: `purchase` rows in `supplier_transactions`, settled by the
 * payments explicitly allocated to them (migration 0009) and, for the payment
 * volume that carries no allocation, by an oldest-first FIFO estimate.
 *
 * See `allocatePayments` for why both mechanisms run at once and why the
 * supplier's total is unaffected by which one does the work.
 */
export async function getPayables(query: LedgerQuery = {}, client = prisma) {
  const asOf = query.asOf ?? new Date();

  const transactions = await client.supplierTransaction.findMany({
    include: { supplier: true, allocationsMade: true },
    orderBy: { date: "desc" },
  });

  const bySupplier = new Map<number, typeof transactions>();
  for (const t of transactions) {
    const list = bySupplier.get(t.supplierId);
    if (list) list.push(t);
    else bySupplier.set(t.supplierId, [t]);
  }

  const rows: PayableRow[] = [];

  for (const [, txs] of bySupplier) {
    const purchases = txs.filter((t) => t.type === "purchase");
    const payments = txs.filter((t) => t.type === "payment");

    // Split every payment into the part it explicitly settles and the part it
    // does not. Only the latter is guessed at.
    const recorded: RecordedAllocation[] = [];
    let unallocatedPool = 0;
    let unratedPayments = 0;

    for (const p of payments) {
      const paymentBase = toBase(p);
      const allocations = p.allocationsMade ?? [];

      if (paymentBase == null) {
        // Foreign payment with no rate: it has no IDR value at all, so neither
        // its allocations nor its remainder can be counted. Surfaced, not folded
        // in at face value (file header).
        unratedPayments += 1;
        for (const a of allocations) {
          recorded.push({ purchaseId: a.purchaseId, base: null });
        }
        continue;
      }

      let allocatedBase = 0;
      for (const a of allocations) {
        const base = toBase(a);
        recorded.push({ purchaseId: a.purchaseId, base });
        if (base != null) allocatedBase += base;
      }

      // A payment allocated in part still leaves a remainder to estimate; a
      // payment with no allocations at all (every legacy row) is all remainder.
      const remainder = round2(paymentBase - allocatedBase);
      if (remainder > EPSILON) unallocatedPool += remainder;
    }

    const allocation = allocatePayments(
      purchases.map((p) => ({ id: p.id, date: p.date, base: toBase(p) })),
      recorded,
      round2(unallocatedPool)
    );

    for (const p of purchases) {
      const total = num(p.amount);
      if (total <= EPSILON) continue;
      const currency = p.currency || BASE_CURRENCY;
      const totalBase = toBase(p);
      const applied = allocation.applied.get(p.id) ?? 0;

      const status = deriveStatus({
        totalBase,
        paidBase: applied,
        dueDate: p.dueDate,
        asOf,
      });
      const ageFromIssue = p.dueDate == null;
      const ageDays = ageInDays(p.dueDate ?? p.date, asOf);

      rows.push({
        kind: "purchase",
        id: p.id,
        documentNo: `TRX-${p.id}`,
        partyName: p.supplier.name,
        date: p.date,
        terms: p.note ?? null,
        href: `/suppliers/${p.supplierId}`,
        total,
        currency,
        totalBase,
        paidBase: applied,
        outstandingBase: totalBase == null ? null : Math.max(0, round2(totalBase - applied)),
        // Payments are allocated in IDR base — a purchase may be settled partly
        // by a recorded allocation and partly by the FIFO estimate, in different
        // currencies — so there is no defensible original-currency remainder.
        outstanding: null,
        unratedCount: unratedPayments + allocation.unratedAllocations,
        status,
        ageDays,
        ageFromIssue,
        bucket: agingBucket(ageDays),
        dueDate: p.dueDate,
        allocationEstimated: allocation.estimated.has(p.id),
      });
    }
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return finishLedger(rows, query);
}

/**
 * A supplier purchase with the payment volume explicitly allocated to it.
 *
 * This is the *recorded* picture only — the FIFO estimate is deliberately not
 * folded in. FIFO is a reporting assumption about rows nobody allocated; letting
 * it consume a purchase's remaining room would stop a user from recording the
 * truth ("this transfer paid invoice #3") merely because a guess had already
 * spoken for it. The allocation form and the over-allocation guard therefore
 * both work from recorded facts, and `getPayables` layers the estimate on top
 * for display.
 */
export interface PurchaseAllocationState {
  id: number;
  date: Date;
  dueDate: Date | null;
  /** Purchase value in its own currency (net + tax, as posted). */
  amount: number;
  currency: string;
  /** Purchase value in IDR base; null when a foreign purchase carries no rate. */
  totalBase: number | null;
  /** Sum of recorded allocations against this purchase, in IDR base. */
  allocatedBase: number;
  /** Room left for further allocation, IDR base. Null when `totalBase` is null. */
  remainingBase: number | null;
  note: string | null;
}

export interface AllocationStateOptions {
  /**
   * Ignore allocations belonging to this payment when working out how much room
   * each purchase has left (issue #38).
   *
   * This is what makes *editing* an allocation possible at all. When a user
   * reopens a payment that already put 400k on purchase #2, that 400k is not a
   * constraint on the new figure — it is the very thing being replaced. Counting
   * it would leave the purchase looking 400k fuller than it is and reject any
   * edit that keeps or raises the amount, the classic off-by-one of edit flows.
   * Excluding the payment's own rows measures the room against *everyone else's*
   * allocations, which is the only honest ceiling for a full-set replacement.
   */
  excludePaymentId?: number;
}

/**
 * Recorded allocation state of every purchase belonging to one supplier.
 *
 * Used by the payment form (to show what is still outstanding per document) and
 * by the API's over-allocation guard. Both need the same numbers, so they share
 * one query rather than each reimplementing the arithmetic.
 */
export async function getSupplierPurchaseAllocations(
  supplierId: number,
  client = prisma,
  options: AllocationStateOptions = {}
): Promise<PurchaseAllocationState[]> {
  const purchases = await client.supplierTransaction.findMany({
    where: { supplierId, type: "purchase" },
    include: { allocationsReceived: true },
    orderBy: { date: "asc" },
  });

  return purchases.map((p) => {
    const totalBase = toBase(p);
    let allocatedBase = 0;
    for (const a of p.allocationsReceived ?? []) {
      // The payment being edited does not compete with itself for room.
      if (options.excludePaymentId != null && a.paymentId === options.excludePaymentId) continue;
      const base = toBase(a);
      // An allocation with no IDR value cannot reduce an IDR remainder.
      if (base != null) allocatedBase += base;
    }
    allocatedBase = round2(allocatedBase);
    return {
      id: p.id,
      date: p.date,
      dueDate: p.dueDate,
      // The obligation is net + input VAT — the same figure `base_amount` holds.
      amount: round2(num(p.amount) + num(p.taxAmount)),
      currency: p.currency || BASE_CURRENCY,
      totalBase,
      allocatedBase,
      remainingBase: totalBase == null ? null : Math.max(0, round2(totalBase - allocatedBase)),
      note: p.note ?? null,
    };
  });
}

/* ────────────────────────────── Shared shaping ─────────────────────────────── */

export interface LedgerResult<T extends OutstandingDocument> {
  rows: T[];
  aging: ReturnType<typeof summarizeAging>;
  /** Outstanding per counterparty, IDR base, biggest first. */
  byParty: { name: string; outstandingBase: number; count: number }[];
  /** Documents excluded from the sums for want of a usable exchange rate. */
  unresolvedCount: number;
  overdueCount: number;
  asOf: Date;
}

function finishLedger<T extends ReceivableRow | PayableRow>(
  all: T[],
  query: LedgerQuery
): LedgerResult<T> {
  const asOf = query.asOf ?? new Date();

  // Settled documents drop out of the ledger — this is an *outstanding* report.
  // A document whose IDR value is unknown is kept: it is precisely the row a user
  // needs to see and fix, and hiding it would understate the balance silently.
  let rows = all.filter((r) => r.outstandingBase == null || r.outstandingBase > EPSILON);
  if (query.overdueOnly) rows = rows.filter((r) => r.status === "overdue");

  const partyTotals = new Map<string, { outstandingBase: number; count: number }>();
  for (const r of rows) {
    const entry = partyTotals.get(r.partyName) ?? { outstandingBase: 0, count: 0 };
    entry.outstandingBase += r.outstandingBase ?? 0;
    entry.count += 1;
    partyTotals.set(r.partyName, entry);
  }

  return {
    rows,
    aging: summarizeAging(rows),
    byParty: [...partyTotals.entries()]
      .map(([name, v]) => ({ name, outstandingBase: round2(v.outstandingBase), count: v.count }))
      .sort((a, b) => b.outstandingBase - a.outstandingBase),
    unresolvedCount: rows.filter((r) => r.outstandingBase == null).length,
    overdueCount: rows.filter((r) => r.status === "overdue").length,
    asOf,
  };
}
