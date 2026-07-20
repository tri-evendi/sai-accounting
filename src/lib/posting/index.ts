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
 * OUT OF SCOPE: FX gain/loss on settlement — deferred to issue #23.
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

  const acc = await resolveAccountIds(
    [MAPPING_KEYS.CASH_DEFAULT, MAPPING_KEYS.AR_DEFAULT],
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
      amount,
      currency,
      rate,
      memo: payment.invoice.invoiceNo,
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

  const acc = await resolveAccountIds(
    [MAPPING_KEYS.CASH_DEFAULT, MAPPING_KEYS.AR_DEFAULT],
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
      amount,
      currency,
      rate,
      memo: payment.contract.contractNo,
    }),
  };
}

async function buildSupplierTransactionEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const trx = await client.supplierTransaction.findUnique({
    where: { id: ctx.sourceId },
    include: { supplier: true },
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
    const acc = await resolveAccountIds(
      [MAPPING_KEYS.AP_DEFAULT, MAPPING_KEYS.CASH_DEFAULT],
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
        amount,
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
