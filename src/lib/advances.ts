/**
 * Uang Muka (advance payments) — remaining balances and the compensation guard.
 *
 * Issue #26. SAI's export customers pay before the final invoice exists, so the
 * money arrives with nothing to settle. This module answers the two questions
 * that follow from that: *how much of an advance is still uncompensated*, and
 * *may this compensation be recorded*.
 *
 * ── Remaining balance is DERIVED, never stored ───────────────────────────────
 * `remaining = amount − Σ applications`, computed on read. `receivables.ts`
 * makes the same case for payment status: a stored copy drifts the instant a
 * compensation is added, edited or reversed, and there is no cheap way to notice
 * that it has. Nothing here writes a balance column because there isn't one.
 *
 * ── Two units, deliberately ─────────────────────────────────────────────────
 * An application is by construction a slice of ONE advance and shares its
 * currency, so unlike `supplier_payment_allocations` the advance's own currency
 * *does* have an honest remainder — that is the number a user recognises ("你还
 * 有 40,000 CNY"), and it is what the UI shows. Every CROSS-document comparison
 * is still IDR base, per the rule in the header of `receivables.ts`: the target
 * invoice may be in another currency, and two currencies are never compared raw.
 * A foreign advance with no rate has no IDR value at all — `remainingBase` is
 * null, it is excluded from IDR sums and surfaced, never folded in at 1:1.
 */
import { prisma } from "@/lib/prisma";
import { toBase, BASE_CURRENCY, type MoneyRow } from "@/lib/receivables";

/** Half a cent — money is Decimal(15,2), so anything below this is rounding noise. */
const MONEY_EPSILON = 0.005;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Which way an advance points. Mirrors `AdvanceDirection` in posting/rules. */
export type AdvanceType = "sales" | "purchase";

/** What a compensation can be applied to. */
export type AdvanceTargetKind = "invoice" | "purchase";

export const ADVANCE_TYPE_LABELS: Record<AdvanceType, string> = {
  sales: "Uang Muka Penjualan",
  purchase: "Uang Muka Pembelian",
};

/* ────────────────────────────── Pure arithmetic ────────────────────────────── */

export interface AdvanceBalanceInput {
  /** Advance value in its own currency. */
  amount: number;
  currency: string;
  /** Stored IDR base of the advance, if any. */
  baseAmount?: unknown;
  rate?: unknown;
  /** Compensations recorded against it, each a slice in the same currency. */
  applications: MoneyRow[];
}

export interface AdvanceBalance {
  amount: number;
  currency: string;
  /** Advance value in IDR base; null when a foreign advance carries no rate. */
  totalBase: number | null;
  /** Compensated so far, in the advance's own currency. */
  applied: number;
  /** Compensated so far, IDR base. Rows with no IDR value are excluded. */
  appliedBase: number;
  /** Still uncompensated, in the advance's own currency. Floored at 0. */
  remaining: number;
  /** Still uncompensated, IDR base. Null when `totalBase` is null. */
  remainingBase: number | null;
  /** Applications with no determinable IDR value, so excluded from the sums. */
  unratedApplications: number;
  /** True once the advance is compensated in full (within rounding noise). */
  isFullyApplied: boolean;
}

/**
 * Work out how much of one advance is left.
 *
 * The own-currency and IDR-base figures are tracked side by side rather than one
 * being derived from the other: an application whose IDR value is unknown still
 * consumes advance-currency balance (it is a real slice of the advance), and
 * folding it into the IDR total at face value is precisely the bug this codebase
 * has fixed twice. So it counts in `applied`, is skipped in `appliedBase`, and
 * is surfaced in `unratedApplications`.
 */
export function advanceBalance(input: AdvanceBalanceInput): AdvanceBalance {
  const amount = round2(input.amount);
  const currency = input.currency || BASE_CURRENCY;
  const totalBase = toBase({
    amount,
    currency,
    rate: input.rate ?? null,
    baseAmount: input.baseAmount ?? null,
  });

  let applied = 0;
  let appliedBase = 0;
  let unratedApplications = 0;

  for (const a of input.applications) {
    applied += num(a.amount);
    const base = toBase(a);
    if (base == null) {
      unratedApplications += 1;
      continue;
    }
    appliedBase += base;
  }

  applied = round2(applied);
  appliedBase = round2(appliedBase);
  const remaining = Math.max(0, round2(amount - applied));

  return {
    amount,
    currency,
    totalBase,
    applied,
    appliedBase,
    remaining,
    remainingBase: totalBase == null ? null : Math.max(0, round2(totalBase - appliedBase)),
    unratedApplications,
    isFullyApplied: remaining <= MONEY_EPSILON,
  };
}

/* ──────────────────────────────── Data access ──────────────────────────────── */

export interface AdvanceRow extends AdvanceBalance {
  id: number;
  advanceNo: string;
  type: AdvanceType;
  date: Date;
  status: string;
  /**
   * The advance's stored rate to IDR — the rate the ledger booked Uang Muka at,
   * and the one a compensation must be valued at. Carried verbatim rather than
   * re-derived from `totalBase / amount`, which would reintroduce exactly the
   * rounding drift `base_amount` exists to avoid. Null for an unrated foreign
   * advance; 1 for IDR.
   */
  rate: number | null;
  /** Customer for a sales advance, supplier for a purchase advance. */
  partyName: string;
  partyId: number | null;
  contractId: number | null;
  contractNo: string | null;
  note: string | null;
}

export interface AdvanceQuery {
  type?: AdvanceType;
  customerId?: number;
  supplierId?: number;
  contractId?: number;
  /** Keep only advances with balance left to compensate. */
  openOnly?: boolean;
  /**
   * Ignore this application when computing room, so a compensation being edited
   * does not count against its own replacement. Same reasoning as
   * `AllocationStateOptions.excludePaymentId` in receivables.ts (issue #38).
   */
  excludeApplicationId?: number;
}

const advanceInclude = {
  applications: true,
  customer: true,
  supplier: true,
  contract: true,
} as const;

/**
 * Advances with their balances worked out.
 *
 * Cancelled advances are excluded throughout: a cancelled advance has had its
 * journal reversed, so it holds no balance and must not be offered for
 * compensation.
 */
export async function getAdvances(
  query: AdvanceQuery = {},
  client = prisma
): Promise<AdvanceRow[]> {
  const rows = await client.advancePayment.findMany({
    where: {
      status: "open",
      ...(query.type ? { type: query.type } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
    },
    include: advanceInclude,
    orderBy: { date: "asc" },
  });

  const mapped = rows.map((a) => {
    const applications = (a.applications ?? []).filter(
      (ap) => query.excludeApplicationId == null || ap.id !== query.excludeApplicationId
    );
    const balance = advanceBalance({
      amount: num(a.amount),
      currency: a.currency || BASE_CURRENCY,
      baseAmount: a.baseAmount,
      rate: a.rate,
      applications,
    });
    const type = a.type as AdvanceType;
    const currency = a.currency || BASE_CURRENCY;
    return {
      ...balance,
      id: a.id,
      advanceNo: a.advanceNo,
      type,
      date: a.date,
      status: a.status,
      rate: currency === BASE_CURRENCY ? 1 : a.rate == null ? null : num(a.rate),
      partyName:
        (type === "sales" ? a.customer?.name : a.supplier?.name) ?? "Tanpa pihak",
      partyId: (type === "sales" ? a.customerId : a.supplierId) ?? null,
      contractId: a.contractId ?? null,
      contractNo: a.contract?.contractNo ?? null,
      note: a.note ?? null,
    };
  });

  return query.openOnly ? mapped.filter((a) => !a.isFullyApplied) : mapped;
}

/** Totals for the advances screen, in IDR base. Unrated rows are counted, not summed. */
export function summarizeAdvances(rows: AdvanceRow[]) {
  let outstandingBase = 0;
  let unresolvedCount = 0;
  for (const r of rows) {
    if (r.remainingBase == null) {
      unresolvedCount += 1;
      continue;
    }
    outstandingBase += r.remainingBase;
  }
  return {
    count: rows.length,
    outstandingBase: round2(outstandingBase),
    unresolvedCount,
  };
}

/* ─────────────────────────── The compensation target ───────────────────────── */

export interface AdvanceTargetState {
  kind: AdvanceTargetKind;
  id: number;
  label: string;
  date: Date;
  currency: string;
  /** Gross document value in its own currency. */
  amount: number;
  /** Gross document value in IDR base; null when it carries no rate. */
  totalBase: number | null;
  /** Settled by payments AND by advance compensations already recorded, IDR base. */
  settledBase: number;
  /** Room left for further compensation, IDR base. Null when `totalBase` is null. */
  remainingBase: number | null;
}

/**
 * How much of an invoice / supplier purchase is still open.
 *
 * Compensation is capped by BOTH sides — the advance's remaining balance and the
 * target's outstanding. The issue only demands the first, but omitting the second
 * lets a 100k advance be compensated into a 60k invoice, which drives Piutang
 * negative and invents a receivable the customer never owed. Both caps are IDR
 * base because the advance and the target may be in different currencies.
 */
export async function getAdvanceTargetState(
  kind: AdvanceTargetKind,
  id: number,
  client = prisma,
  options: { excludeApplicationId?: number } = {}
): Promise<AdvanceTargetState | null> {
  const keep = (applicationId: number) =>
    options.excludeApplicationId == null || applicationId !== options.excludeApplicationId;

  if (kind === "invoice") {
    const invoice = await client.invoice.findUnique({
      where: { id },
      include: { items: true, payments: true, advanceApplications: true },
    });
    if (!invoice || invoice.status === "canceled") return null;

    const amount = round2(
      invoice.items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0) +
        num(invoice.taxAmount)
    );
    const totalBase = toBase({
      amount,
      currency: invoice.currency || BASE_CURRENCY,
      rate: invoice.rate,
      baseAmount: invoice.baseAmount,
    });

    let settledBase = 0;
    for (const p of invoice.payments) settledBase += toBase(p) ?? 0;
    for (const a of invoice.advanceApplications) {
      if (keep(a.id)) settledBase += toBase(a) ?? 0;
    }
    settledBase = round2(settledBase);

    return {
      kind,
      id: invoice.id,
      label: invoice.invoiceNo,
      date: invoice.date,
      currency: invoice.currency || BASE_CURRENCY,
      amount,
      totalBase,
      settledBase,
      remainingBase: totalBase == null ? null : Math.max(0, round2(totalBase - settledBase)),
    };
  }

  const purchase = await client.supplierTransaction.findUnique({
    where: { id },
    include: { allocationsReceived: true, advanceApplications: true },
  });
  if (!purchase || purchase.type !== "purchase") return null;

  // The obligation is net + input VAT — the same figure `base_amount` holds.
  const amount = round2(num(purchase.amount) + num(purchase.taxAmount));
  const totalBase = toBase({
    amount,
    currency: purchase.currency || BASE_CURRENCY,
    rate: purchase.rate,
    baseAmount: purchase.baseAmount,
  });

  let settledBase = 0;
  for (const a of purchase.allocationsReceived) settledBase += toBase(a) ?? 0;
  for (const a of purchase.advanceApplications) {
    if (keep(a.id)) settledBase += toBase(a) ?? 0;
  }
  settledBase = round2(settledBase);

  return {
    kind,
    id: purchase.id,
    label: `TRX-${purchase.id}`,
    date: purchase.date,
    currency: purchase.currency || BASE_CURRENCY,
    amount,
    totalBase,
    settledBase,
    remainingBase: totalBase == null ? null : Math.max(0, round2(totalBase - settledBase)),
  };
}

/* ────────────────────────────── The write guard ────────────────────────────── */

/** One validated compensation line, ready to persist and to post. */
export interface ResolvedApplicationLine {
  advanceId: number;
  /** Portion of the advance applied, in the ADVANCE's currency. */
  amount: number;
  /** The advance's currency and rate — what the ledger relieves Uang Muka at. */
  currency: string;
  rate: number;
  /** The same portion in IDR, at the advance's own rate. */
  base: number;
}

export interface ResolveApplicationsInput {
  targetKind: AdvanceTargetKind;
  targetId: number;
  lines: { advanceId: number; amount: number }[];
  /** Set when editing an existing compensation, so it doesn't block itself. */
  excludeApplicationId?: number;
  client?: typeof prisma;
}

export type ResolveApplicationsResult =
  | { ok: true; lines: ResolvedApplicationLine[]; target: AdvanceTargetState }
  | { ok: false; error: string };

/**
 * Check every compensation line against the database, in IDR base.
 *
 * Shaped after `resolveAllocationLines` (issues #37/#38) on purpose — same
 * contract, same discriminated result, same "decrement the room as we go so two
 * lines in one payload cannot each fit alone but not together". What the Zod
 * schema cannot see is the other side of the link, and it is settled here, before
 * anything is written, so a rejected payload never leaves a half-applied state.
 *
 * Five things are checked per line: the advance exists, it is the right direction
 * for this target, it belongs to the same counterparty, it has a usable IDR value,
 * and it still has room — plus the target's own remaining, decremented across the
 * whole payload.
 */
export async function resolveApplicationLines(
  input: ResolveApplicationsInput
): Promise<ResolveApplicationsResult> {
  const { targetKind, targetId, lines, excludeApplicationId } = input;
  const client = input.client ?? prisma;

  const target = await getAdvanceTargetState(targetKind, targetId, client, {
    excludeApplicationId,
  });
  if (!target) {
    return {
      ok: false,
      error:
        targetKind === "invoice"
          ? `Faktur #${targetId} tidak ditemukan atau sudah dibatalkan.`
          : `Pembelian #${targetId} tidak ditemukan.`,
    };
  }
  if (lines.length === 0) return { ok: true, lines: [], target };

  if (target.remainingBase == null) {
    return {
      ok: false,
      error:
        `${target.label} belum punya kurs, sehingga sisa tagihannya dalam IDR ` +
        `tidak diketahui. Isi kurs dokumen tersebut lebih dulu.`,
    };
  }

  const wantedType: AdvanceType = targetKind === "invoice" ? "sales" : "purchase";
  const advances = await getAdvances(
    { type: wantedType, excludeApplicationId },
    client
  );
  const byId = new Map(advances.map((a) => [a.id, a]));

  // Both caps are decremented as we walk the payload.
  let targetRoom = target.remainingBase;
  const resolved: ResolvedApplicationLine[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    if (seen.has(line.advanceId)) {
      return {
        ok: false,
        error: `Uang muka #${line.advanceId} dikompensasi lebih dari sekali dalam satu permintaan.`,
      };
    }
    seen.add(line.advanceId);

    const advance = byId.get(line.advanceId);
    if (!advance) {
      return {
        ok: false,
        error:
          `Uang muka #${line.advanceId} tidak ditemukan, sudah dibatalkan, ` +
          `atau bukan ${ADVANCE_TYPE_LABELS[wantedType]}.`,
      };
    }
    if (advance.remainingBase == null || advance.rate == null) {
      // Foreign advance with no rate: it has no IDR value, so "how much is left"
      // has no answer and no compensation against it can be checked.
      return {
        ok: false,
        error:
          `Uang muka ${advance.advanceNo} belum punya kurs, sehingga sisanya ` +
          `dalam IDR tidak diketahui. Isi kurs uang muka tersebut lebih dulu.`,
      };
    }

    const amount = round2(line.amount);
    if (amount <= 0) {
      return { ok: false, error: `Nilai kompensasi ${advance.advanceNo} harus lebih besar dari nol.` };
    }

    // Cap 1 — the advance's own remaining, in its OWN currency. Exact here (an
    // application is always a slice of one advance) and the message a user can
    // act on, so it is checked before the IDR comparison.
    if (amount > advance.remaining + MONEY_EPSILON) {
      return {
        ok: false,
        error:
          `Kompensasi ${advance.advanceNo} (${amount.toLocaleString("id-ID")} ` +
          `${advance.currency}) melebihi sisa uang muka ` +
          `(${advance.remaining.toLocaleString("id-ID")} ${advance.currency}).`,
      };
    }

    // Convert at the ADVANCE's own stored rate — the rate the ledger will
    // relieve Uang Muka at — then compare like with like. Both sides: IDR base.
    const rate = advance.rate;
    const base = round2(amount * rate);

    // Cap 2 — the target document's remaining. Without this a 100k advance could
    // be compensated into a 60k invoice and drive Piutang negative.
    if (base > targetRoom + MONEY_EPSILON) {
      return {
        ok: false,
        error:
          `Kompensasi ke ${target.label} (Rp ${base.toLocaleString("id-ID")}) ` +
          `melebihi sisa tagihannya (Rp ${targetRoom.toLocaleString("id-ID")}).`,
      };
    }

    resolved.push({ advanceId: advance.id, amount, currency: advance.currency, rate, base });

    targetRoom = round2(targetRoom - base);
    byId.set(advance.id, {
      ...advance,
      remaining: round2(advance.remaining - amount),
      remainingBase: round2(advance.remainingBase - base),
    });
  }

  return { ok: true, lines: resolved, target };
}
