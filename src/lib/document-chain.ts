/**
 * Dokumen berantai — Kontrak → Surat Jalan → Faktur → Pembayaran (issue #15).
 *
 * Pure module: no Prisma and no I/O in the exported arithmetic — the same posture
 * as `@/lib/returns` and `@/lib/delivery-orders`, so the outstanding maths and the
 * over-invoice guard are unit-testable without a DATABASE_URL. The one
 * DB-touching helper (`loadContractChain`) sits at the bottom and takes a
 * type-only client, exactly like `nextDeliveryOrderNo`.
 *
 * ── WHAT "OUTSTANDING" MEANS HERE ───────────────────────────────────────────
 * A contract line promises BAGS × KG/BAG kilograms at PRICE/KG. Against that
 * promise two things accumulate:
 *   • dikirim  — kg on surat jalan yang menyebut kontrak ini (delivery_orders.contract_id);
 *   • difakturkan — kg on faktur yang menyebut kontrak ini (invoices.contract_id).
 * Sisa (remaining) is contracted − invoiced; belum dikirim is contracted − delivered.
 * Both are clamped at zero so a fully-drawn line reads 0, never a rounding blip.
 *
 * ── WHY THE JOIN KEY IS THE ITEM NAME, NOT A LINE ID ────────────────────────
 * `contract_items` is deleted and recreated wholesale on every contract edit
 * (PUT /api/contracts/[id]), so its row ids are not stable identities and a FK to
 * them would break editing. The identity of a line in this app is its NAME — the
 * convention `delivery_order_items.item_name` already snapshots (#14). Quantities
 * are therefore aggregated per NORMALISED item name (trim + lowercase + collapsed
 * whitespace), which also does the right thing when a contract repeats the same
 * item on two lines: the cap applies to their sum.
 *
 * ── UNIT ASSUMPTION ─────────────────────────────────────────────────────────
 * Quantities are compared in KILOGRAMS. That is the fungible unit of this app —
 * stock and HPP are costed per kg, contracts are priced per kg, and a surat jalan
 * moves kg (`@/lib/delivery-orders`). The "Ambil" pull therefore writes invoice
 * lines with `unit: "kg"` and a kg quantity, so pulled documents compare exactly.
 * A hand-typed invoice line in another unit is compared as if it were kg — the
 * guard can only be as honest as the numbers it is given.
 *
 * ── NO NEW ACCOUNTING ───────────────────────────────────────────────────────
 * Nothing in this file posts, values or reverses anything. A "pulled" faktur is
 * posted by the existing invoice rule, unchanged.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { round2 } from "@/lib/posting/rules";

/** Type-only client (no `@/lib/prisma` singleton) so the pure half stays importable. */
type Client = Prisma.TransactionClient | PrismaClient;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** A whole milli-unit is a real shortfall; smaller is float noise (see returns.ts). */
const EPSILON = 1e-6;

/** Round a quantity to 3 decimals (Decimal(15,3)), matching the DB grain. */
export const round3 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Clamp a "sisa" at zero — a fully-drawn line reads 0, never a tiny negative. */
const clamp = (n: number): number => (n > EPSILON ? round3(n) : 0);

/**
 * The join key of a chained line: trimmed, lower-cased, inner whitespace
 * collapsed. "Kopi  Arabika " and "kopi arabika" are the same contract line.
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── Inputs ──────────────────────────────────────────────

/** One `contract_items` row (bags/kg/price shape). */
export interface ContractLineInput {
  itemName: string;
  bags: number | string;
  kgPerBag: number | string;
  pricePerKg: number | string;
}

/** One `delivery_order_items` row of a surat jalan that names this contract. */
export interface DeliveredLineInput {
  itemName: string;
  /** Kg issued from stock (`delivery_order_items.quantity`). */
  quantity: number | string;
}

/** One `invoice_items` row of a faktur that names this contract. */
export interface InvoicedLineInput {
  itemName: string;
  /** Invoiced quantity, read as kg (see the unit assumption above). */
  quantity: number | string;
  price: number | string;
}

// ─── Per-line outstanding ────────────────────────────────

/** Progress of one stage of the chain. Always rendered with a text label. */
export type ChainStatus = "belum" | "sebagian" | "selesai";

/**
 * `done` against `target`, as a three-state progress. A target of zero is not a
 * completed stage but an absent one — unless something was nonetheless done,
 * which reads as "selesai" so an over-run is never hidden.
 */
export function chainStatus(done: number, target: number, grain: 2 | 3 = 3): ChainStatus {
  const round = grain === 2 ? round2 : round3;
  const d = round(done);
  const t = round(target);
  if (t <= EPSILON) return d > EPSILON ? "selesai" : "belum";
  if (d <= EPSILON) return "belum";
  return d + EPSILON >= t ? "selesai" : "sebagian";
}

/** How much of one contract line has been delivered / invoiced, and what is left. */
export interface ContractLineOutstanding {
  /** Normalised item name — the join key. */
  key: string;
  /** Display name, as written on the contract. */
  itemName: string;
  contractedBags: number;
  contractedKg: number;
  contractedValue: number;
  /** Value-weighted price per kg (contractedValue / contractedKg). */
  pricePerKg: number;
  deliveredKg: number;
  invoicedKg: number;
  invoicedValue: number;
  /** Contracted − invoiced, clamped. What "Ambil dari Kontrak" offers. */
  remainingKg: number;
  remainingValue: number;
  /** Contracted − delivered, clamped. Backorder: still to ship. */
  undeliveredKg: number;
  /** Delivered but not yet invoiced, never above the contract's own remainder. */
  readyToInvoiceKg: number;
  /** Delivery progress of this line. */
  deliveryStatus: ChainStatus;
  /** Invoicing progress of this line. */
  invoiceStatus: ChainStatus;
}

/** Chain-wide sums, plus what could not be attributed to any contract line. */
export interface ContractOutstandingTotals {
  contractedKg: number;
  contractedValue: number;
  deliveredKg: number;
  invoicedKg: number;
  invoicedValue: number;
  remainingKg: number;
  remainingValue: number;
  undeliveredKg: number;
  readyToInvoiceKg: number;
  /** Kg on surat jalan whose item is not on the contract at all. */
  unmatchedDeliveredKg: number;
  /** Kg/value on faktur whose item is not on the contract (e.g. ongkos kirim). */
  unmatchedInvoicedKg: number;
  unmatchedInvoicedValue: number;
}

export interface ContractOutstanding {
  lines: ContractLineOutstanding[];
  totals: ContractOutstandingTotals;
}

/** Sum a set of amounts per normalised item name. */
function sumByKey<T>(rows: T[], amount: (row: T) => number, name: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeItemName(name(row));
    map.set(key, num(map.get(key)) + amount(row));
  }
  return map;
}

/**
 * Per-line delivered / invoiced / remaining for one contract.
 *
 * Pure: the caller does the queries (or `loadContractChain` does), this only
 * compares numbers. Lines are returned in contract order, one entry per distinct
 * item name — repeated names are merged, so their cap is their sum.
 */
export function buildContractOutstanding(input: {
  lines: ContractLineInput[];
  delivered?: DeliveredLineInput[];
  invoiced?: InvoicedLineInput[];
}): ContractOutstanding {
  const { lines, delivered = [], invoiced = [] } = input;

  const deliveredByKey = sumByKey(delivered, (r) => num(r.quantity), (r) => r.itemName);
  const invoicedKgByKey = sumByKey(invoiced, (r) => num(r.quantity), (r) => r.itemName);
  const invoicedValueByKey = sumByKey(
    invoiced,
    (r) => num(r.quantity) * num(r.price),
    (r) => r.itemName
  );

  // Merge contract lines that name the same item, keeping contract order.
  const order: string[] = [];
  const merged = new Map<string, { itemName: string; bags: number; kg: number; value: number }>();
  for (const l of lines) {
    const key = normalizeItemName(l.itemName);
    const kg = num(l.bags) * num(l.kgPerBag);
    const value = kg * num(l.pricePerKg);
    const existing = merged.get(key);
    if (existing) {
      existing.bags += num(l.bags);
      existing.kg += kg;
      existing.value += value;
    } else {
      order.push(key);
      merged.set(key, { itemName: l.itemName.trim(), bags: num(l.bags), kg, value });
    }
  }

  const out: ContractLineOutstanding[] = order.map((key) => {
    const c = merged.get(key)!;
    const contractedKg = round3(c.kg);
    const contractedValue = round2(c.value);
    const pricePerKg = contractedKg > 0 ? round2(contractedValue / contractedKg) : 0;
    const deliveredKg = round3(num(deliveredByKey.get(key)));
    const invoicedKg = round3(num(invoicedKgByKey.get(key)));
    const invoicedValue = round2(num(invoicedValueByKey.get(key)));
    const remainingKg = clamp(contractedKg - invoicedKg);
    return {
      key,
      itemName: c.itemName,
      contractedBags: c.bags,
      contractedKg,
      contractedValue,
      pricePerKg,
      deliveredKg,
      invoicedKg,
      invoicedValue,
      remainingKg,
      remainingValue: round2(remainingKg * pricePerKg),
      undeliveredKg: clamp(contractedKg - deliveredKg),
      readyToInvoiceKg: Math.min(remainingKg, clamp(deliveredKg - invoicedKg)),
      deliveryStatus: chainStatus(deliveredKg, contractedKg),
      invoiceStatus: chainStatus(invoicedKg, contractedKg),
    };
  });

  // Anything shipped/invoiced under a name the contract never mentioned is not
  // silently dropped — it is reported so the page can say so out loud.
  const known = new Set(order);
  const unmatched = (map: Map<string, number>) =>
    [...map.entries()].reduce((s, [k, v]) => (known.has(k) ? s : s + v), 0);

  const totals: ContractOutstandingTotals = {
    contractedKg: round3(out.reduce((s, l) => s + l.contractedKg, 0)),
    contractedValue: round2(out.reduce((s, l) => s + l.contractedValue, 0)),
    deliveredKg: round3(out.reduce((s, l) => s + l.deliveredKg, 0)),
    invoicedKg: round3(out.reduce((s, l) => s + l.invoicedKg, 0)),
    invoicedValue: round2(out.reduce((s, l) => s + l.invoicedValue, 0)),
    remainingKg: round3(out.reduce((s, l) => s + l.remainingKg, 0)),
    remainingValue: round2(out.reduce((s, l) => s + l.remainingValue, 0)),
    undeliveredKg: round3(out.reduce((s, l) => s + l.undeliveredKg, 0)),
    readyToInvoiceKg: round3(out.reduce((s, l) => s + l.readyToInvoiceKg, 0)),
    unmatchedDeliveredKg: round3(unmatched(deliveredByKey)),
    unmatchedInvoicedKg: round3(unmatched(invoicedKgByKey)),
    unmatchedInvoicedValue: round2(unmatched(invoicedValueByKey)),
  };

  return { lines: out, totals };
}

// ─── Pola "Ambil" (pull) ─────────────────────────────────

/** Which remainder a pull draws on. */
export type PullSource = "contract" | "delivery";

/** A draft invoice line produced by "Ambil" — the shape `invoiceItemSchema` takes. */
export interface PulledInvoiceLine {
  itemName: string;
  quantity: number;
  price: number;
  unit: string;
}

/**
 * Turn outstanding contract lines into ready-made faktur lines, so nothing is
 * re-typed and nothing is drawn twice: the quantity IS the remainder.
 *
 * `source: "contract"` pulls everything not yet invoiced; `"delivery"` pulls only
 * what has actually shipped and is not yet invoiced (`readyToInvoiceKg`), which is
 * the "Ambil dari Surat Jalan" flow. Zero-remainder lines are omitted — a fully
 * drawn contract yields an empty pull rather than a set of 0-kg lines.
 */
export function pullInvoiceLines(
  lines: ContractLineOutstanding[],
  source: PullSource = "contract"
): PulledInvoiceLine[] {
  return lines
    .map((l) => ({
      itemName: l.itemName,
      quantity: source === "delivery" ? l.readyToInvoiceKg : l.remainingKg,
      price: l.pricePerKg,
      unit: "kg",
    }))
    .filter((l) => l.quantity > 0);
}

// ─── Guard: tidak bisa memfakturkan melebihi yang dikontrak ──

/** One contract line a faktur would overdraw. */
export interface OverInvoiceDetail {
  itemName: string;
  contractedKg: number;
  alreadyInvoicedKg: number;
  requestedKg: number;
  remainingKg: number;
}

/** Raised when a faktur would invoice more of a contract line than was contracted. */
export class OverInvoiceError extends Error {
  readonly lines: OverInvoiceDetail[];
  constructor(lines: OverInvoiceDetail[]) {
    const detail = lines
      .map(
        (l) =>
          `${l.itemName} (diminta ${round3(l.requestedKg)} kg, sisa ${round3(l.remainingKg)} kg ` +
          `— kontrak ${round3(l.contractedKg)} kg dikurangi faktur sebelumnya ` +
          `${round3(l.alreadyInvoicedKg)} kg)`
      )
      .join("; ");
    super(
      `Faktur melebihi jumlah yang dikontrak: ${detail}. ` +
        `Faktur tidak dibuat dan jurnal tidak diposting.`
    );
    this.name = "OverInvoiceError";
    this.lines = lines;
  }
}

/**
 * Which requested lines exceed their contract line's remainder. Requested
 * quantities are summed per item name first, so two lines naming the same item
 * cannot slip past the cap one at a time.
 *
 * Requested items the contract never mentions are NOT capped — a faktur may
 * legitimately add a line the contract has no promise for (ongkos kirim, selisih
 * timbang). They surface separately as `unmatchedInvoiced*` in the totals.
 */
export function findOverInvoiced(
  outstanding: ContractLineOutstanding[],
  requested: { itemName: string; quantity: number | string }[]
): OverInvoiceDetail[] {
  const byKey = new Map(outstanding.map((l) => [l.key, l]));
  const requestedByKey = sumByKey(requested, (r) => num(r.quantity), (r) => r.itemName);

  const over: OverInvoiceDetail[] = [];
  for (const [key, qty] of requestedByKey) {
    const line = byKey.get(key);
    if (!line) continue;
    if (round3(qty) > line.remainingKg + EPSILON) {
      over.push({
        itemName: line.itemName,
        contractedKg: line.contractedKg,
        alreadyInvoicedKg: line.invoicedKg,
        requestedKg: round3(qty),
        remainingKg: line.remainingKg,
      });
    }
  }
  return over;
}

/**
 * Throw `OverInvoiceError` if any requested line overdraws its contract line.
 * The single choke point the invoice routes call INSIDE their transaction, so an
 * over-invoice never leaves a posted faktur (or a revenue journal) behind.
 */
export function assertWithinContract(
  outstanding: ContractLineOutstanding[],
  requested: { itemName: string; quantity: number | string }[]
): void {
  const over = findOverInvoiced(outstanding, requested);
  if (over.length > 0) throw new OverInvoiceError(over);
}

// ─── Timeline dokumen ────────────────────────────────────

/** One stage of Kontrak → Surat Jalan → Faktur → Pembayaran. */
export interface ContractChainStage {
  key: "contract" | "delivery" | "invoice" | "payment";
  label: string;
  status: ChainStatus;
  /** How much of the stage is done, in `unit`. */
  done: number;
  /** What the stage is measured against, in `unit`. */
  target: number;
  unit: "kg" | "IDR";
  /** How many documents exist at this stage. */
  count: number;
}

/**
 * A contract's own status as a chain stage. `signed` is a finished stage;
 * `pending` is a document that exists but is not agreed yet; `canceled` never
 * reads as progress.
 */
export function contractStageStatus(status: string): ChainStatus {
  if (status === "signed") return "selesai";
  if (status === "canceled") return "belum";
  return "sebagian";
}

/**
 * The four-stage timeline shown on the contract detail page. Pure: the page hands
 * in the numbers it already loaded, this decides only how far each stage got.
 *
 * The payment stage measures cash received FOR this contract — its own down
 * payments plus payments against the faktur drawn from it — against the
 * contract's IDR base value. `contractBase` may be null (a foreign contract whose
 * rate was never filled in, see Contract.rate): the stage then has no target and
 * reads from whether anything was paid at all.
 */
export function buildContractChain(input: {
  contractStatus: string;
  totals: ContractOutstandingTotals;
  deliveryOrderCount: number;
  invoiceCount: number;
  paymentCount: number;
  paidBase: number;
  contractBase: number | null;
}): ContractChainStage[] {
  const { totals } = input;
  const target = input.contractBase ?? 0;
  return [
    {
      key: "contract",
      label: "Kontrak",
      status: contractStageStatus(input.contractStatus),
      done: totals.contractedKg,
      target: totals.contractedKg,
      unit: "kg",
      count: 1,
    },
    {
      key: "delivery",
      label: "Surat Jalan",
      status: chainStatus(totals.deliveredKg, totals.contractedKg),
      done: totals.deliveredKg,
      target: totals.contractedKg,
      unit: "kg",
      count: input.deliveryOrderCount,
    },
    {
      key: "invoice",
      label: "Faktur",
      status: chainStatus(totals.invoicedKg, totals.contractedKg),
      done: totals.invoicedKg,
      target: totals.contractedKg,
      unit: "kg",
      count: input.invoiceCount,
    },
    {
      key: "payment",
      label: "Pembayaran",
      status: chainStatus(input.paidBase, target, 2),
      done: round2(input.paidBase),
      target: round2(target),
      unit: "IDR",
      count: input.paymentCount,
    },
  ];
}

// ─── DB side (thin) ──────────────────────────────────────

/** Everything the contract detail page and the "Ambil" picker need, in one read. */
export interface ContractChainData {
  outstanding: ContractOutstanding;
  deliveryOrders: {
    id: number;
    no: string;
    date: Date;
    status: string;
    totalKg: number;
  }[];
  invoices: {
    id: number;
    invoiceNo: string;
    date: Date;
    status: string;
    currency: string;
    total: number;
    baseAmount: number | null;
    paidBase: number;
  }[];
  /** IDR base of every payment against the faktur drawn from this contract. */
  invoicePaidBase: number;
  invoicePaymentCount: number;
}

/**
 * Read the chain of one contract: its surat jalan, its faktur, and the per-line
 * outstanding derived from them. Only DB-touching function in this file; takes a
 * type-only client so it can run inside a caller's `$transaction`.
 *
 * Canceled documents are excluded from the sums — a canceled faktur has drawn
 * nothing from the contract, and a canceled surat jalan has shipped nothing.
 */
export async function loadContractChain(
  client: Client,
  contractId: number
): Promise<ContractChainData> {
  const [items, deliveryOrders, invoices] = await Promise.all([
    client.contractItem.findMany({ where: { contractId }, orderBy: { id: "asc" } }),
    client.deliveryOrder.findMany({
      where: { contractId, status: { not: "canceled" } },
      orderBy: { date: "asc" },
      include: { items: true },
    }),
    client.invoice.findMany({
      where: { contractId, status: { not: "canceled" } },
      orderBy: { date: "asc" },
      include: { items: true, payments: true },
    }),
  ]);

  const outstanding = buildContractOutstanding({
    lines: items.map((i) => ({
      itemName: i.itemName,
      bags: num(i.bags),
      kgPerBag: num(i.kgPerBag),
      pricePerKg: num(i.pricePerKg),
    })),
    delivered: deliveryOrders.flatMap((d) =>
      d.items.map((i) => ({ itemName: i.itemName, quantity: num(i.quantity) }))
    ),
    invoiced: invoices.flatMap((inv) =>
      inv.items.map((i) => ({
        itemName: i.itemName,
        quantity: num(i.quantity),
        price: num(i.price),
      }))
    ),
  });

  // A payment only adds up in IDR base; a foreign one with no rate has no IDR
  // value and is left out rather than folded in at face value (see the contract
  // detail page, which applies the same rule to contract payments).
  const paidBaseOf = (payments: { amount: unknown; baseAmount: unknown; currency: string }[]) =>
    payments.reduce((s, p) => {
      if (p.baseAmount != null) return s + num(p.baseAmount);
      return (p.currency || "IDR") === "IDR" ? s + num(p.amount) : s;
    }, 0);

  return {
    outstanding,
    deliveryOrders: deliveryOrders.map((d) => ({
      id: d.id,
      no: d.no,
      date: d.date,
      status: d.status,
      totalKg: round3(d.items.reduce((s, i) => s + num(i.quantity), 0)),
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      status: inv.status,
      currency: inv.currency || "IDR",
      total: round2(
        inv.items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0) + num(inv.taxAmount)
      ),
      baseAmount: inv.baseAmount != null ? num(inv.baseAmount) : null,
      paidBase: round2(paidBaseOf(inv.payments)),
    })),
    invoicePaidBase: round2(invoices.reduce((s, inv) => s + paidBaseOf(inv.payments), 0)),
    invoicePaymentCount: invoices.reduce((s, inv) => s + inv.payments.length, 0),
  };
}

/**
 * Outstanding as the invoice routes need it: the contract's per-line remainder,
 * optionally EXCLUDING one faktur's own lines.
 *
 * The exclusion is what makes editing a pulled faktur safe (PUT): without it the
 * document being edited would be counted as "already invoiced" against itself and
 * every save would fail. Runs inside the caller's transaction, so the numbers it
 * guards against are the ones being committed.
 */
export async function contractOutstandingForInvoice(
  client: Client,
  contractId: number,
  excludeInvoiceId?: number
): Promise<ContractOutstanding> {
  const [items, deliveryOrders, invoices] = await Promise.all([
    client.contractItem.findMany({ where: { contractId }, orderBy: { id: "asc" } }),
    client.deliveryOrder.findMany({
      where: { contractId, status: { not: "canceled" } },
      select: { items: { select: { itemName: true, quantity: true } } },
    }),
    client.invoice.findMany({
      where: {
        contractId,
        status: { not: "canceled" },
        ...(excludeInvoiceId != null ? { id: { not: excludeInvoiceId } } : {}),
      },
      select: { items: { select: { itemName: true, quantity: true, price: true } } },
    }),
  ]);

  return buildContractOutstanding({
    lines: items.map((i) => ({
      itemName: i.itemName,
      bags: num(i.bags),
      kgPerBag: num(i.kgPerBag),
      pricePerKg: num(i.pricePerKg),
    })),
    delivered: deliveryOrders.flatMap((d) =>
      d.items.map((i) => ({ itemName: i.itemName, quantity: num(i.quantity) }))
    ),
    invoiced: invoices.flatMap((inv) =>
      inv.items.map((i) => ({
        itemName: i.itemName,
        quantity: num(i.quantity),
        price: num(i.price),
      }))
    ),
  });
}
