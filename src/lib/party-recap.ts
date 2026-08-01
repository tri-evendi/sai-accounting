/**
 * Rekap per pihak — "Penjualan per Pelanggan" & "Pembelian per Pemasok"
 * (report catalog: `sales-by-customer` / `purchases-by-supplier`).
 *
 * Read-only reporting over source documents; nothing here writes and nothing
 * touches the posting engine. The period filter is a document-date range
 * (inclusive on both ends — callers pass `resolvePeriod`'s bounds).
 *
 * ── Money discipline (same rule as lib/receivables.ts) ───────────────────────
 * Documents in different currencies must never be added raw, so every sum here
 * is in **IDR base** via `toBase` (stored `base_amount` first, then IDR 1:1,
 * then `amount × rate`). A foreign document with no usable rate has no IDR
 * value: it is EXCLUDED from the sums and counted in `unratedCount`, so the
 * page can say so out loud instead of folding it in at face value.
 *
 * Values are GROSS (net + PPN) — that is what `base_amount` stores on both
 * invoices (schema: "subtotal + tax") and supplier purchases
 * (`createSupplierTransactionInTx`: `amount + taxAmount`), so gross is the one
 * figure every row, legacy or new, can agree on. Returns in the period are
 * netted off in their own column, valued the same way.
 */
import { prisma } from "@/lib/prisma";
import { toBase, BASE_CURRENCY } from "@/lib/receivables";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One source document (or return) reduced to its party + IDR-base value. */
export interface PartyDoc {
  /** Party id, or null for legacy documents that carry none. */
  partyId: number | null;
  /** Party display name; null when `partyId` is null. */
  partyName: string | null;
  /** Gross value in IDR base, or null when the document has no usable rate. */
  grossBase: number | null;
}

export interface PartyRecapRow {
  partyId: number | null;
  /** Null = the "no party recorded" bucket; the page labels it. */
  partyName: string | null;
  /** Documents in the period (returns not included in this count). */
  docCount: number;
  /** Gross document value (incl. PPN), IDR base, rated documents only. */
  grossBase: number;
  /** Returns in the period against this party. */
  returnCount: number;
  /** Gross returned value, IDR base, rated returns only. */
  returnBase: number;
  /** grossBase − returnBase. */
  netBase: number;
  /** Documents + returns excluded from the sums for want of a usable rate. */
  unratedCount: number;
}

export interface PartyRecapResult {
  /** Sorted by netBase descending; the no-party bucket sorts with the rest. */
  rows: PartyRecapRow[];
  totals: {
    docCount: number;
    grossBase: number;
    returnCount: number;
    returnBase: number;
    netBase: number;
    unratedCount: number;
  };
}

/**
 * Pure aggregation: group documents and returns by party, sum IDR base,
 * surface unrated rows. Kept free of Prisma so the maths can be unit-tested.
 */
export function summarizeParties(docs: PartyDoc[], returns: PartyDoc[]): PartyRecapResult {
  interface Acc {
    partyId: number | null;
    partyName: string | null;
    docCount: number;
    grossBase: number;
    returnCount: number;
    returnBase: number;
    unratedCount: number;
  }
  const byParty = new Map<string, Acc>();
  const key = (id: number | null) => (id == null ? "none" : `p${id}`);

  const entry = (d: PartyDoc): Acc => {
    const k = key(d.partyId);
    let acc = byParty.get(k);
    if (!acc) {
      acc = {
        partyId: d.partyId,
        partyName: d.partyName,
        docCount: 0,
        grossBase: 0,
        returnCount: 0,
        returnBase: 0,
        unratedCount: 0,
      };
      byParty.set(k, acc);
    }
    // Legacy rows may miss the name on one document but carry it on another.
    if (acc.partyName == null && d.partyName != null) acc.partyName = d.partyName;
    return acc;
  };

  for (const d of docs) {
    const acc = entry(d);
    acc.docCount += 1;
    if (d.grossBase == null) acc.unratedCount += 1;
    else acc.grossBase += d.grossBase;
  }
  for (const r of returns) {
    const acc = entry(r);
    acc.returnCount += 1;
    if (r.grossBase == null) acc.unratedCount += 1;
    else acc.returnBase += r.grossBase;
  }

  const rows: PartyRecapRow[] = [...byParty.values()]
    .map((a) => ({
      partyId: a.partyId,
      partyName: a.partyName,
      docCount: a.docCount,
      grossBase: round2(a.grossBase),
      returnCount: a.returnCount,
      returnBase: round2(a.returnBase),
      netBase: round2(a.grossBase - a.returnBase),
      unratedCount: a.unratedCount,
    }))
    .sort((a, b) => b.netBase - a.netBase || (a.partyName ?? "").localeCompare(b.partyName ?? ""));

  const totals = rows.reduce(
    (t, r) => ({
      docCount: t.docCount + r.docCount,
      grossBase: round2(t.grossBase + r.grossBase),
      returnCount: t.returnCount + r.returnCount,
      returnBase: round2(t.returnBase + r.returnBase),
      netBase: round2(t.netBase + r.netBase),
      unratedCount: t.unratedCount + r.unratedCount,
    }),
    { docCount: 0, grossBase: 0, returnCount: 0, returnBase: 0, netBase: 0, unratedCount: 0 }
  );

  return { rows, totals };
}

/** Gross value of an invoice in its own currency: Σ(qty × price) + PPN. */
function invoiceGross(inv: {
  items: { quantity: unknown; price: unknown }[];
  taxAmount: unknown;
}): number {
  return inv.items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0) + num(inv.taxAmount);
}

/**
 * Penjualan per pelanggan: sales invoices dated inside the period, grouped by
 * customer. Cancelled invoices are not sales; cancelled returns reversed
 * nothing — both are excluded, matching `getReceivables` / the posting rules.
 */
export async function getSalesByCustomer(
  from: Date,
  to: Date,
  client = prisma
): Promise<PartyRecapResult> {
  const [invoices, returns] = await Promise.all([
    client.invoice.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "canceled" } },
      include: { items: true, customer: { select: { id: true, name: true } } },
    }),
    client.salesReturn.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "canceled" } },
      include: { customer: { select: { id: true, name: true } } },
    }),
  ]);

  return summarizeParties(
    invoices.map((inv) => ({
      partyId: inv.customerId,
      partyName: inv.customer?.name ?? null,
      grossBase: toBase({
        amount: invoiceGross(inv),
        currency: inv.currency || BASE_CURRENCY,
        rate: inv.rate,
        baseAmount: inv.baseAmount,
      }),
    })),
    returns.map((r) => ({
      partyId: r.customerId,
      partyName: r.customer?.name ?? null,
      grossBase: toBase({
        amount: num(r.subtotal) + num(r.taxAmount),
        currency: r.currency || BASE_CURRENCY,
        rate: r.rate,
        baseAmount: r.baseAmount,
      }),
    }))
  );
}

/**
 * Pembelian per pemasok: `purchase` rows in `supplier_transactions` dated
 * inside the period, grouped by supplier. A purchase's gross obligation is
 * `amount + taxAmount` (the figure `base_amount` stores). A return that lost
 * its own `supplierId` falls back to the origin purchase's supplier.
 */
export async function getPurchasesBySupplier(
  from: Date,
  to: Date,
  client = prisma
): Promise<PartyRecapResult> {
  const [purchases, returns] = await Promise.all([
    client.supplierTransaction.findMany({
      where: { type: "purchase", date: { gte: from, lte: to } },
      include: { supplier: { select: { id: true, name: true } } },
    }),
    client.purchaseReturn.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "canceled" } },
      include: {
        supplier: { select: { id: true, name: true } },
        purchase: { select: { supplierId: true, supplier: { select: { name: true } } } },
      },
    }),
  ]);

  return summarizeParties(
    purchases.map((p) => ({
      partyId: p.supplierId,
      partyName: p.supplier.name,
      grossBase: toBase({
        amount: num(p.amount) + num(p.taxAmount),
        currency: p.currency || BASE_CURRENCY,
        rate: p.rate,
        baseAmount: p.baseAmount,
      }),
    })),
    returns.map((r) => ({
      partyId: r.supplierId ?? r.purchase.supplierId,
      partyName: r.supplier?.name ?? r.purchase.supplier.name,
      grossBase: toBase({
        amount: num(r.subtotal) + num(r.taxAmount),
        currency: r.currency || BASE_CURRENCY,
        rate: r.rate,
        baseAmount: r.baseAmount,
      }),
    }))
  );
}
