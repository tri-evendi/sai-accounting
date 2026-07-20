/**
 * Auto-posting engine (issue #9).
 *
 * Turns a source record (invoice, payment, cash entry, stock movement) into a
 * balanced double-entry journal, so staff keep using the simple forms while the
 * ledger stays correct behind the scenes.
 *
 * Usage from an API route — one line, inside the same transaction as the write:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const invoice = await tx.invoice.create({ data });
 *     await postForSource({ sourceType: "invoice", sourceId: invoice.id, tx });
 *     return invoice;
 *   });
 *
 * Guarantees:
 *   • Idempotent — a source that already has a live journal is never posted twice.
 *   • Atomic — pass `tx` and posting commits/rolls back with the source write.
 *   • Immutable — corrections go through reverseJournal(); lines are never edited.
 *
 * Selisih kurs (issue #23): settlement entries relieve the receivable/payable at
 * the rate its own document was booked at, not at the payment's rate, and post
 * the difference to `fx_gain_loss`. See `settlementLegs` below for where the two
 * rates come from and when the engine declines to compute a difference.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Journal } from "@/generated/prisma/client";
import { postJournal, reverseJournal, type JournalEntryInput } from "@/lib/ledger";
import {
  MAPPING_KEYS,
  cashKeyForType,
  resolveAccountIds,
  type MappingKey,
} from "./mapping";
import {
  PostingRuleError,
  buildCashTransactionLines,
  buildCogsLines,
  buildPurchaseLines,
  buildSalesInvoiceLines,
  buildSalesReceiptLines,
  buildSupplierPaymentLines,
  resolveRate,
  round2,
  type SettlementLeg,
} from "./rules";
import { averageUnitCostForItem, costOfMovement } from "./cogs";

export * from "./mapping";
export * from "./rules";
export * from "./cogs";

export type PostingSourceType =
  | "invoice"
  | "invoice_payment"
  | "contract"
  | "contract_payment"
  | "cash_account"
  | "supplier_transaction"
  | "stock_movement";

export interface PostingContext {
  sourceType: PostingSourceType;
  sourceId: number;
  /** Join an existing $transaction so posting is atomic with the source write. */
  tx?: Prisma.TransactionClient;
  /** Explicit FX rate to IDR, for sources whose model carries no rate column. */
  rate?: number;
  /** The user-chosen other side of a cash_account posting. Required for it. */
  counterAccountId?: number;
}

/** Raised when the source record referenced by a PostingContext doesn't exist. */
export class SourceNotFoundError extends Error {
  constructor(sourceType: string, sourceId: number) {
    super(`Data sumber ${sourceType} #${sourceId} tidak ditemukan. Jurnal tidak diposting.`);
    this.name = "SourceNotFoundError";
  }
}

type Client = Prisma.TransactionClient | typeof prisma;

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Journals still in force for a source: posted, not reversed, not themselves reversals. */
async function findLiveJournals(
  client: Client,
  sourceType: string,
  sourceId: number
): Promise<Journal[]> {
  return client.journal.findMany({
    where: { sourceType, sourceId, isReversed: false, type: { not: "reversal" } },
    orderBy: { id: "asc" },
  });
}

// ─── Selisih kurs (issue #23) ────────────────────────────

/**
 * Where the two rates come from.
 *
 * DOCUMENT rate — the rate stored on the invoice/contract/purchase itself
 * (migrations 0005/0008). That is the rate the receivable or payable was booked
 * into the ledger at, and it never moves afterwards.
 *
 * SETTLEMENT rate — the rate stored on the payment row. This is the rate the
 * money actually converted at on the bank advice, which is a better number than
 * any daily mid-rate table would hold.
 *
 * Both are already on the records, which is why issue #23 needs no
 * `exchange_rates` table: introducing one would create a second, disagreeing
 * source of truth for a fact the document already asserts, and would force a
 * policy for "no row on this date" — every version of which (nearest, previous,
 * interpolate) is a silent guess of exactly the kind `resolveRate` exists to
 * refuse.
 *
 * Returns `undefined` when no FX difference can be computed *without inventing a
 * number*, in which case the settlement is booked exactly as it was before #23:
 *   • the document carries no rate (legacy row) — its booked rate is unknown, so
 *     the difference from it is unknowable. `receivables.ts` surfaces these as
 *     `unresolvedCount`; we likewise decline rather than guess.
 *   • the payment is in a different currency from the document — how many
 *     document-currency units a foreign payment clears cannot be derived without
 *     a settlement-date rate for the document's currency, which nothing records.
 */
function settlementLegs(
  doc: { currency: string | null; rate: unknown },
  payCurrency: string,
  payRate: number,
  amount: number,
  memo?: string
): SettlementLeg[] | undefined {
  const docCurrency = doc.currency || "IDR";
  if (docCurrency !== payCurrency) return undefined;

  const docRate = docCurrency === "IDR" ? 1 : num(doc.rate);
  if (!(docRate > 0)) return undefined;
  if (docRate === payRate) return undefined; // no difference to book

  return [{ amount, currency: docCurrency, rate: docRate, memo }];
}

/** Add the FX slot to a mapping batch only when a difference will actually arise. */
function withFxKey(keys: MappingKey[], legs: SettlementLeg[] | undefined): MappingKey[] {
  return legs ? [...keys, MAPPING_KEYS.FX_GAIN_LOSS] : keys;
}

interface AllocationRow {
  amount: unknown;
  purchase?: { currency: string | null; rate: unknown } | null;
}

/**
 * Payable legs for a supplier payment, one per allocated purchase.
 *
 * A supplier payment reaches its purchases through `supplier_payment_allocations`
 * (issue #37), so unlike a receipt it may settle several documents booked at
 * several different rates — hence a list rather than a single leg.
 *
 * NOTE ON THE COUPLING: that table's own docs describe it as reporting data that
 * does not touch the ledger. From #23 on, it does — for foreign-currency payments
 * it is what says which rate each slice of hutang was raised at. Editing an
 * allocation therefore changes the correct journal, and the existing remedy
 * applies: `repostForSource` reverses and re-posts. Allocation rows whose purchase
 * carries no rate, or is in another currency, contribute no FX rather than a
 * guessed one.
 *
 * The unallocated remainder is emitted as its own leg at the payment's own rate:
 * it clears hutang with zero difference, which keeps the legs summing to the full
 * payment so the FX plug can only ever absorb a rate gap, never an amount gap.
 */
function payableSettlementLegs(
  trx: { allocationsMade?: AllocationRow[] | null },
  currency: string,
  rate: number,
  amount: number,
  memo?: string
): SettlementLeg[] | undefined {
  const allocations = trx.allocationsMade ?? [];
  if (allocations.length === 0) return undefined;

  const legs: SettlementLeg[] = [];
  let allocated = 0;
  let anyDifference = false;

  for (const a of allocations) {
    const legAmount = round2(num(a.amount));
    if (legAmount <= 0) continue;
    allocated = round2(allocated + legAmount);

    // Allocation amounts are denominated in the PAYMENT's currency, so a
    // purchase in another currency gives no common unit to relieve in.
    const purchaseRate =
      a.purchase && (a.purchase.currency || "IDR") === currency
        ? currency === "IDR"
          ? 1
          : num(a.purchase.rate)
        : 0;
    const legRate = purchaseRate > 0 ? purchaseRate : rate;
    if (legRate !== rate) anyDifference = true;
    legs.push({ amount: legAmount, currency, rate: legRate, memo });
  }

  const remainder = round2(amount - allocated);
  if (remainder > 0) legs.push({ amount: remainder, currency, rate, memo });

  // Nothing to gain from restating a settlement that carries no rate difference.
  if (!anyDifference) return undefined;
  return legs;
}

// ─── Entry builders (source record → JournalEntryInput) ──

async function buildInvoiceEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const invoice = await client.invoice.findUnique({
    where: { id: ctx.sourceId },
    include: { items: true },
  });
  if (!invoice) throw new SourceNotFoundError("invoice", ctx.sourceId);
  if (invoice.status === "canceled") return null;

  // Issue #35: invoices now carry their own currency, rate and PPN Keluaran, so
  // a USD document is valued at its own rate and lands in the USD receivable.
  // Legacy rows default to IDR, which is how they were already being posted.
  const currency = invoice.currency || "IDR";
  const rate = resolveRate(currency, num(invoice.rate) || null, ctx.rate);
  const subtotal = round2(
    invoice.items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0)
  );
  const tax = round2(num(invoice.taxAmount));
  if (subtotal <= 0) return null;

  const keys: MappingKey[] = [MAPPING_KEYS.AR_DEFAULT, MAPPING_KEYS.SALES_DEFAULT];
  if (tax > 0) keys.push(MAPPING_KEYS.VAT_OUT);
  const acc = await resolveAccountIds(keys, currency, client);

  return {
    date: invoice.date,
    type: "sales",
    note: `Faktur Penjualan ${invoice.invoiceNo}`,
    sourceType: "invoice",
    sourceId: invoice.id,
    lines: buildSalesInvoiceLines({
      arAccountId: acc[MAPPING_KEYS.AR_DEFAULT],
      salesAccountId: acc[MAPPING_KEYS.SALES_DEFAULT],
      vatOutAccountId: tax > 0 ? acc[MAPPING_KEYS.VAT_OUT] : undefined,
      subtotal,
      taxAmount: tax,
      currency,
      rate,
      memo: invoice.invoiceNo,
    }),
  };
}

async function buildContractEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const contract = await client.contract.findUnique({
    where: { id: ctx.sourceId },
    include: { items: true },
  });
  if (!contract) throw new SourceNotFoundError("contract", ctx.sourceId);
  if (contract.status === "canceled") return null;

  // Issue #36: contracts now carry their own rate (migration 0008), so a USD
  // contract is valued at the rate stored on the document and no caller has to
  // hand one in. `ctx.rate` stays as a fallback for legacy rows whose rate was
  // never recorded — reposting one still needs an explicit rate, exactly as before.
  const currency = contract.currency || "IDR";
  const rate = resolveRate(currency, num(contract.rate) || null, ctx.rate);
  const subtotal = round2(
    contract.items.reduce(
      (s, i) => s + num(i.bags) * num(i.kgPerBag) * num(i.pricePerKg),
      0
    )
  );
  if (subtotal <= 0) return null;

  const acc = await resolveAccountIds(
    [MAPPING_KEYS.AR_DEFAULT, MAPPING_KEYS.SALES_DEFAULT],
    currency,
    client
  );

  return {
    date: contract.date,
    type: "sales",
    note: `Kontrak Penjualan ${contract.contractNo}`,
    sourceType: "contract",
    sourceId: contract.id,
    lines: buildSalesInvoiceLines({
      arAccountId: acc[MAPPING_KEYS.AR_DEFAULT],
      salesAccountId: acc[MAPPING_KEYS.SALES_DEFAULT],
      subtotal,
      currency,
      rate,
      memo: contract.contractNo,
    }),
  };
}

async function buildInvoicePaymentEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const payment = await client.invoicePayment.findUnique({
    where: { id: ctx.sourceId },
    include: { invoice: true },
  });
  if (!payment) throw new SourceNotFoundError("invoice_payment", ctx.sourceId);

  const currency = payment.currency || "IDR";
  const rate = resolveRate(currency, num(payment.rate) || null, ctx.rate);
  const amount = num(payment.amount);
  if (amount <= 0) return null;

  const memo = payment.invoice.invoiceNo;
  const settles = settlementLegs(payment.invoice, currency, rate, amount, memo);
  const acc = await resolveAccountIds(
    withFxKey([MAPPING_KEYS.CASH_DEFAULT, MAPPING_KEYS.AR_DEFAULT], settles),
    currency,
    client
  );

  return {
    date: payment.date,
    type: "cash",
    note: `Penerimaan Faktur ${payment.invoice.invoiceNo}`,
    sourceType: "invoice_payment",
    sourceId: payment.id,
    lines: buildSalesReceiptLines({
      cashAccountId: acc[MAPPING_KEYS.CASH_DEFAULT],
      arAccountId: acc[MAPPING_KEYS.AR_DEFAULT],
      fxAccountId: acc[MAPPING_KEYS.FX_GAIN_LOSS],
      amount,
      settles,
      currency,
      rate,
      memo,
    }),
  };
}

async function buildContractPaymentEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const payment = await client.contractPayment.findUnique({
    where: { id: ctx.sourceId },
    include: { contract: true },
  });
  if (!payment) throw new SourceNotFoundError("contract_payment", ctx.sourceId);

  const currency = payment.currency || "IDR";
  const rate = resolveRate(currency, num(payment.rate) || null, ctx.rate);
  const amount = num(payment.amount);
  if (amount <= 0) return null;

  const memo = payment.contract.contractNo;
  const settles = settlementLegs(payment.contract, currency, rate, amount, memo);
  const acc = await resolveAccountIds(
    withFxKey([MAPPING_KEYS.CASH_DEFAULT, MAPPING_KEYS.AR_DEFAULT], settles),
    currency,
    client
  );

  return {
    date: payment.date,
    type: "cash",
    note: `Penerimaan Kontrak ${payment.contract.contractNo}`,
    sourceType: "contract_payment",
    sourceId: payment.id,
    lines: buildSalesReceiptLines({
      cashAccountId: acc[MAPPING_KEYS.CASH_DEFAULT],
      arAccountId: acc[MAPPING_KEYS.AR_DEFAULT],
      fxAccountId: acc[MAPPING_KEYS.FX_GAIN_LOSS],
      amount,
      settles,
      currency,
      rate,
      memo,
    }),
  };
}

async function buildSupplierTransactionEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const trx = await client.supplierTransaction.findUnique({
    where: { id: ctx.sourceId },
    // Allocations (issue #37) name which purchase each slice of a payment
    // settles, and therefore at which rate that slice of hutang was booked.
    include: { supplier: true, allocationsMade: { include: { purchase: true } } },
  });
  if (!trx) throw new SourceNotFoundError("supplier_transaction", ctx.sourceId);

  const currency = trx.currency || "IDR";
  const rate = resolveRate(currency, num(trx.rate) || null, ctx.rate);
  const amount = num(trx.amount);
  if (amount <= 0) return null;
  const memo = trx.supplier.name;

  if (trx.type === "purchase") {
    const tax = num(trx.taxAmount);
    const keys: MappingKey[] = [MAPPING_KEYS.INVENTORY, MAPPING_KEYS.AP_DEFAULT];
    if (tax > 0) keys.push(MAPPING_KEYS.VAT_IN);
    const acc = await resolveAccountIds(keys, currency, client);

    return {
      date: trx.date,
      type: "purchase",
      note: `Pembelian ${trx.supplier.name}`,
      sourceType: "supplier_transaction",
      sourceId: trx.id,
      lines: buildPurchaseLines({
        debitAccountId: acc[MAPPING_KEYS.INVENTORY],
        apAccountId: acc[MAPPING_KEYS.AP_DEFAULT],
        vatInAccountId: tax > 0 ? acc[MAPPING_KEYS.VAT_IN] : undefined,
        // `amount` is the net purchase value; tax is carried separately.
        subtotal: amount,
        taxAmount: tax,
        currency,
        rate,
        memo,
      }),
    };
  }

  if (trx.type === "payment") {
    const settles = payableSettlementLegs(trx, currency, rate, amount, memo);
    const acc = await resolveAccountIds(
      withFxKey([MAPPING_KEYS.AP_DEFAULT, MAPPING_KEYS.CASH_DEFAULT], settles),
      currency,
      client
    );
    return {
      date: trx.date,
      type: "cash",
      note: `Pembayaran Supplier ${trx.supplier.name}`,
      sourceType: "supplier_transaction",
      sourceId: trx.id,
      lines: buildSupplierPaymentLines({
        apAccountId: acc[MAPPING_KEYS.AP_DEFAULT],
        cashAccountId: acc[MAPPING_KEYS.CASH_DEFAULT],
        fxAccountId: acc[MAPPING_KEYS.FX_GAIN_LOSS],
        amount,
        settles,
        currency,
        rate,
        memo,
      }),
    };
  }

  throw new PostingRuleError(
    `Jenis transaksi supplier "${trx.type}" belum punya aturan posting. ` +
      `Gunakan "purchase" atau "payment".`
  );
}

async function buildCashAccountEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const entry = await client.cashAccount.findUnique({ where: { id: ctx.sourceId } });
  if (!entry) throw new SourceNotFoundError("cash_account", ctx.sourceId);

  if (!ctx.counterAccountId) {
    throw new PostingRuleError(
      "Transaksi kas membutuhkan akun lawan. Kirim parameter \"counterAccountId\" saat posting."
    );
  }

  const currency = entry.currency || "IDR";
  const rate = resolveRate(currency, num(entry.rate) || null, ctx.rate);
  const debit = num(entry.debit);
  const credit = num(entry.credit);
  if (debit <= 0 && credit <= 0) return null;

  const cashAccountId = (
    await resolveAccountIds([cashKeyForType(entry.type)], currency, client)
  )[cashKeyForType(entry.type)];

  return {
    date: entry.date,
    type: "cash",
    note: entry.description,
    sourceType: "cash_account",
    sourceId: entry.id,
    lines: buildCashTransactionLines({
      cashAccountId,
      counterAccountId: ctx.counterAccountId,
      debit,
      credit,
      currency,
      rate,
      memo: entry.description,
    }),
  };
}

async function buildStockMovementEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const movement = await client.stock.findUnique({
    where: { id: ctx.sourceId },
    include: { item: true },
  });
  if (!movement) throw new SourceNotFoundError("stock_movement", ctx.sourceId);

  // Incoming stock is capitalised by the purchase posting (D: Persediaan),
  // so only outgoing movements produce a COGS journal here.
  if (movement.type !== "out") return null;

  const unitCost = await averageUnitCostForItem(movement.itemId, movement.date, client);
  // No costed purchase history yet → nothing meaningful to post. Posting a zero
  // or guessed cost would understate COGS silently.
  if (unitCost <= 0) return null;

  const cost = costOfMovement(num(movement.quantity), unitCost);
  if (cost <= 0) return null;

  const acc = await resolveAccountIds(
    [MAPPING_KEYS.COGS, MAPPING_KEYS.INVENTORY],
    "IDR",
    client
  );

  return {
    date: movement.date,
    type: "adjustment",
    note: `HPP ${movement.item.name}`,
    sourceType: "stock_movement",
    sourceId: movement.id,
    lines: buildCogsLines({
      cogsAccountId: acc[MAPPING_KEYS.COGS],
      inventoryAccountId: acc[MAPPING_KEYS.INVENTORY],
      cost,
      memo: movement.item.name,
    }),
  };
}

async function buildEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  switch (ctx.sourceType) {
    case "invoice":
      return buildInvoiceEntry(client, ctx);
    case "contract":
      return buildContractEntry(client, ctx);
    case "invoice_payment":
      return buildInvoicePaymentEntry(client, ctx);
    case "contract_payment":
      return buildContractPaymentEntry(client, ctx);
    case "supplier_transaction":
      return buildSupplierTransactionEntry(client, ctx);
    case "cash_account":
      return buildCashAccountEntry(client, ctx);
    case "stock_movement":
      return buildStockMovementEntry(client, ctx);
    default: {
      const exhaustive: never = ctx.sourceType;
      throw new PostingRuleError(`Jenis sumber tidak dikenal: ${String(exhaustive)}`);
    }
  }
}

/** Run against the caller's transaction if given, otherwise open our own. */
function withClient<T>(
  ctx: PostingContext,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  if (ctx.tx) return fn(ctx.tx);
  return prisma.$transaction((tx) => fn(tx));
}

// ─── Public API ──────────────────────────────────────────

/**
 * Post the journal for a source record.
 * Idempotent: returns the existing journal if the source was already posted.
 * Returns null when the source has nothing to post (zero value, cancelled,
 * incoming stock, uncosted inventory).
 */
export async function postForSource(ctx: PostingContext): Promise<Journal | null> {
  return withClient(ctx, async (client) => {
    const live = await findLiveJournals(client, ctx.sourceType, ctx.sourceId);
    if (live.length > 0) return live[0];

    const entry = await buildEntry(client, ctx);
    if (!entry) return null;
    return postJournal(entry, client);
  });
}

/**
 * Reverse existing journal(s) for the source, then post fresh. Use on edit.
 * The original journals are never mutated — reversal entries are added, keeping
 * the audit trail intact.
 */
export async function repostForSource(ctx: PostingContext): Promise<Journal | null> {
  return withClient(ctx, async (client) => {
    const live = await findLiveJournals(client, ctx.sourceType, ctx.sourceId);
    for (const journal of live) {
      await reverseJournal(journal.id, client);
    }
    const entry = await buildEntry(client, ctx);
    if (!entry) return null;
    return postJournal(entry, client);
  });
}

/** Reverse without reposting. Use on delete. No-op if nothing is posted. */
export async function unpostForSource(ctx: PostingContext): Promise<void> {
  await withClient(ctx, async (client) => {
    const live = await findLiveJournals(client, ctx.sourceType, ctx.sourceId);
    for (const journal of live) {
      await reverseJournal(journal.id, client);
    }
  });
}
