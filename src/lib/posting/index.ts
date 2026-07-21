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
 * the difference to `fx_gain_loss`.
 *
 * Which account is relieved (issue #43) follows the DOCUMENT's currency, not the
 * payment's — a USD invoice settled by an IDR transfer clears the USD receivable.
 * See `settlementFor` below for where the three rates come from, and ./rates for
 * the settlement-date rate that makes a cross-currency settlement computable at
 * all rather than guessed.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Journal } from "@/generated/prisma/client";
import { postJournal, reverseJournal, type JournalEntryInput } from "@/lib/ledger";
import {
  MAPPING_KEYS,
  cashKeyForType,
  resolveAccountId,
  resolveAccountIds,
  type MappingKey,
} from "./mapping";
import { resolveSettlementRate } from "./rates";
import {
  PostingRuleError,
  buildAdvanceCompensationLines,
  buildAdvanceLines,
  buildCashTransactionLines,
  buildCogsLines,
  buildPurchaseLines,
  buildPurchaseReturnLines,
  buildSalesInvoiceLines,
  buildSalesReceiptLines,
  buildSalesReturnLines,
  buildSupplierPaymentLines,
  resolveRate,
  round2,
  type AdvanceDirection,
  type SettlementLeg,
} from "./rules";
import { averageUnitCostForItem, costOfMovement } from "./cogs";

export * from "./mapping";
export * from "./rules";
export * from "./cogs";
export * from "./rates";

export type PostingSourceType =
  | "invoice"
  | "invoice_payment"
  | "contract"
  | "contract_payment"
  | "cash_account"
  | "supplier_transaction"
  | "stock_movement"
  /** Uang muka received/paid before any invoice exists (issue #26). */
  | "advance_payment"
  /** One compensation of an advance into an invoice/purchase (issue #26). */
  | "advance_application"
  /** Retur penjualan — part of a sales invoice sent back (issue #27). */
  | "sales_return"
  /** Retur pembelian — part of a purchase returned to a supplier (issue #27). */
  | "purchase_return";

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

// ─── Selisih kurs (issues #23, #43) ──────────────────────

/**
 * Where the rates come from. There are three, and keeping them straight is the
 * whole of #23 and #43.
 *
 * DOCUMENT rate — the rate stored on the invoice/contract/purchase itself
 * (migrations 0005/0008). That is the rate the receivable or payable was booked
 * into the ledger at, and it never moves afterwards.
 *
 * PAYMENT rate — the rate stored on the payment row. This is the rate the money
 * actually converted at on the bank advice, which is a better number than any
 * daily mid-rate table would hold. For a payment these two are enough, which is
 * why #23 needed no `exchange_rates` table and refused to add one: it would
 * have been a second, disagreeing source of truth for a fact the document
 * already asserts.
 *
 * SETTLEMENT-DATE rate of the DOCUMENT's currency (issue #43) — read from
 * `exchange_rates` via ./rates, and ONLY when the payment is in a different
 * currency from the document. #23's objection is met by scope: this rate values
 * nothing, it only says how many document-currency units a foreign payment
 * covers, which is the one thing neither record above can answer and the reason
 * a USD invoice paid in rupiah used to relieve the IDR receivable. A missing
 * row fails loudly — nearest, previous and interpolate are all the silent guess
 * `resolveRate` exists to refuse.
 *
 * `legs` is `undefined` when no FX difference can be computed *without inventing
 * a number*, in which case the settlement is booked exactly as it was before #23:
 *   • the document carries no rate (legacy row) — its booked rate is unknown, so
 *     the difference from it is unknowable. `receivables.ts` surfaces these as
 *     `unresolvedCount`; we likewise decline rather than guess.
 */
interface Settlement {
  /**
   * Currency the receivable/payable is denominated in — i.e. WHICH AR/AP
   * account this settlement relieves (issue #43). Taken from the document, not
   * from the payment: a USD invoice raises 110202 Piutang Usaha (USD) and must
   * be relieved there whatever currency the money arrives in. Resolving it from
   * the payment left 110202 hanging forever while 110201 was eroded by a debt
   * that was never its own.
   */
  docCurrency: string;
  /** Legs to relieve, or undefined for "book flat at the payment's own rate". */
  legs?: SettlementLeg[];
}

/**
 * How much of a document a payment settles, and in which currency's account.
 *
 * Same-currency is untouched from #23. Cross-currency is #43: the payment's IDR
 * value is converted into document-currency units at the SETTLEMENT-date rate,
 * so the receivable falls by the number of dollars the transfer actually
 * covered, while still being relieved at the rate it was BOOKED at. The gap
 * between those two rates is realized FX and reaches the ledger through
 * `fxPlugLines` — the same single FX path #23 built, not a second one.
 */
async function settlementFor(
  doc: { currency: string | null; rate: unknown },
  payCurrency: string,
  payRate: number,
  amount: number,
  date: Date,
  client: Client,
  memo?: string
): Promise<Settlement> {
  const docCurrency = doc.currency || "IDR";
  const docRate = docCurrency === "IDR" ? 1 : num(doc.rate);

  if (docCurrency === payCurrency) {
    if (!(docRate > 0)) return { docCurrency }; // legacy rateless document
    if (docRate === payRate) return { docCurrency }; // no difference to book
    return { docCurrency, legs: [{ amount, currency: docCurrency, rate: docRate, memo }] };
  }

  // ── Cross-currency settlement (issue #43) ────────────────────────────────
  // A rateless foreign document cannot be relieved in its own currency at all:
  // we would know how many dollars to take off the receivable but not what they
  // were booked at, so the rupiah coming off 110202 would be a guess. Before
  // #43 this fell through to relieving the payment's account instead, which is
  // the defect. Refusing is the honest option, and the remedy is the same one
  // #35/#36 established: record the document's rate, then repost it.
  if (!(docRate > 0)) {
    throw new PostingRuleError(
      `Dokumen dalam mata uang ${docCurrency} ini tidak menyimpan kurs, ` +
        `sedangkan pembayarannya dalam ${payCurrency}. ` +
        `Nilai ${docCurrency} yang dilunasi bisa dihitung, tetapi nilai rupiah yang ` +
        `harus keluar dari piutang/hutang tidak — itu tergantung kurs dokumennya. ` +
        `Isi kurs pada dokumen tersebut lalu posting ulang. Jurnal tidak diposting.`
    );
  }

  const settlementRate = await resolveSettlementRate(docCurrency, date, client);
  // What the money is worth (IDR base), restated in the document's units.
  // Deliberately not short-circuited when this rounds to zero: falling back to
  // "no legs" would book flat against the *document's* account in the payment's
  // currency, which is incoherent. `resolveLegs` rejects a zero leg loudly.
  const docAmount = round2((round2(amount) * payRate) / settlementRate);

  return {
    docCurrency,
    legs: [{ amount: docAmount, currency: docCurrency, rate: docRate, settlementRate, memo }],
  };
}

/** Add the FX slot to a mapping batch only when a difference will actually arise. */
function withFxKey(keys: MappingKey[], legs: SettlementLeg[] | undefined): MappingKey[] {
  return legs ? [...keys, MAPPING_KEYS.FX_GAIN_LOSS] : keys;
}

/**
 * Cash at the PAYMENT's currency, receivable/payable at the DOCUMENT's (#43).
 *
 * The two used to be resolved in one batch at the payment's currency, which is
 * exactly how a USD receivable came to be credited in 110201. They agree for
 * every same-currency settlement — the overwhelming majority — so that case
 * still costs a single query.
 */
async function resolveSettlementAccounts(
  client: Client,
  docKey: MappingKey,
  docCurrency: string,
  payCurrency: string,
  needFx: boolean
): Promise<{ cash: number; doc: number; fx?: number }> {
  const fxKeys = needFx ? [MAPPING_KEYS.FX_GAIN_LOSS] : [];

  if (docCurrency === payCurrency) {
    const acc = await resolveAccountIds(
      [MAPPING_KEYS.CASH_DEFAULT, docKey, ...fxKeys],
      payCurrency,
      client
    );
    return {
      cash: acc[MAPPING_KEYS.CASH_DEFAULT],
      doc: acc[docKey],
      fx: needFx ? acc[MAPPING_KEYS.FX_GAIN_LOSS] : undefined,
    };
  }

  // fx_gain_loss is currency-agnostic (the difference is already an IDR amount),
  // so it rides along with whichever batch; the cash one is always present.
  const pay = await resolveAccountIds([MAPPING_KEYS.CASH_DEFAULT, ...fxKeys], payCurrency, client);
  const docAccountId = await resolveAccountId(docKey, docCurrency, client);
  return {
    cash: pay[MAPPING_KEYS.CASH_DEFAULT],
    doc: docAccountId,
    fx: needFx ? pay[MAPPING_KEYS.FX_GAIN_LOSS] : undefined,
  };
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
 * NOTE ON THE COUPLING: that table was first documented as reporting data that
 * does not touch the ledger. From #23 on, it does — for foreign-currency payments
 * it is what says which rate each slice of hutang was raised at. Editing an
 * allocation therefore changes the correct journal, and issue #42 wires the remedy
 * in automatically: the supplier-transactions route reposts the payment
 * (`repostForSource`) whenever a foreign payment's allocation set changes, and its
 * docs/schema now say so. Allocation rows whose purchase carries no rate, or is in
 * another currency, contribute no FX rather than a guessed one.
 *
 * The unallocated remainder is emitted as its own leg at the payment's own rate:
 * it clears hutang with zero difference, which keeps the legs summing to the full
 * payment so the FX plug can only ever absorb a rate gap, never an amount gap.
 *
 * ── CROSS-CURRENCY ALLOCATIONS (issue #43) ──────────────────────────────────
 * Allocation amounts are denominated in the PAYMENT's currency. Before #43, an
 * allocation naming a purchase in another currency was relieved in the payment's
 * currency and therefore out of the payment currency's Hutang account — the same
 * defect as on the receivable side. Now it is restated into the purchase's own
 * currency at that currency's settlement-date rate and carries its own
 * `accountId`, so one payment can settle an IDR purchase and a USD purchase in
 * the same entry and each hutang falls in its own account. That is why
 * `SettlementLeg.accountId` exists per leg rather than one account per entry.
 *
 * This reads `supplier_payment_allocations` exactly as #37 defined it. Issue #42
 * changes nothing here — it aligns the docs with this behaviour, auto-reposts on
 * allocation edits at the write site, and tightens the purchase-side FK to
 * RESTRICT; the posting rule itself is unchanged.
 */
async function payableSettlementLegs(
  trx: { allocationsMade?: AllocationRow[] | null },
  currency: string,
  rate: number,
  amount: number,
  date: Date,
  client: Client,
  memo?: string
): Promise<SettlementLeg[] | undefined> {
  const allocations = trx.allocationsMade ?? [];
  if (allocations.length === 0) return undefined;

  const legs: SettlementLeg[] = [];
  let allocated = 0;
  let anyDifference = false;

  for (const a of allocations) {
    const legAmount = round2(num(a.amount));
    if (legAmount <= 0) continue;
    allocated = round2(allocated + legAmount);

    const purchaseCurrency = a.purchase ? a.purchase.currency || "IDR" : currency;
    const purchaseRate = purchaseCurrency === "IDR" ? 1 : num(a.purchase?.rate);

    if (purchaseCurrency === currency) {
      const legRate = purchaseRate > 0 ? purchaseRate : rate;
      if (legRate !== rate) anyDifference = true;
      legs.push({ amount: legAmount, currency, rate: legRate, memo });
      continue;
    }

    // A rateless foreign purchase cannot be relieved in its own currency: the
    // rupiah that should leave hutang depends on the rate it was booked at.
    if (!(purchaseRate > 0)) {
      throw new PostingRuleError(
        `Pembelian dalam mata uang ${purchaseCurrency} yang dilunasi pembayaran ini ` +
          `tidak menyimpan kurs. Isi kurs pada pembelian tersebut lalu posting ulang. ` +
          `Jurnal tidak diposting agar hutang tidak berkurang dengan nilai yang salah.`
      );
    }
    const settlementRate = await resolveSettlementRate(purchaseCurrency, date, client);
    legs.push({
      amount: round2((legAmount * rate) / settlementRate),
      currency: purchaseCurrency,
      rate: purchaseRate,
      settlementRate,
      accountId: await resolveAccountId(MAPPING_KEYS.AP_DEFAULT, purchaseCurrency, client),
      memo,
    });
    anyDifference = true;
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
  const { docCurrency, legs: settles } = await settlementFor(
    payment.invoice,
    currency,
    rate,
    amount,
    payment.date,
    client,
    memo
  );
  const acc = await resolveSettlementAccounts(
    client,
    MAPPING_KEYS.AR_DEFAULT,
    docCurrency,
    currency,
    !!settles
  );

  return {
    date: payment.date,
    type: "cash",
    note: `Penerimaan Faktur ${payment.invoice.invoiceNo}`,
    sourceType: "invoice_payment",
    sourceId: payment.id,
    lines: buildSalesReceiptLines({
      cashAccountId: acc.cash,
      arAccountId: acc.doc,
      fxAccountId: acc.fx,
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
  const { docCurrency, legs: settles } = await settlementFor(
    payment.contract,
    currency,
    rate,
    amount,
    payment.date,
    client,
    memo
  );
  const acc = await resolveSettlementAccounts(
    client,
    MAPPING_KEYS.AR_DEFAULT,
    docCurrency,
    currency,
    !!settles
  );

  return {
    date: payment.date,
    type: "cash",
    note: `Penerimaan Kontrak ${payment.contract.contractNo}`,
    sourceType: "contract_payment",
    sourceId: payment.id,
    lines: buildSalesReceiptLines({
      cashAccountId: acc.cash,
      arAccountId: acc.doc,
      fxAccountId: acc.fx,
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
    const settles = await payableSettlementLegs(
      trx,
      currency,
      rate,
      amount,
      trx.date,
      client,
      memo
    );
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

// ─── Uang muka / advances (issue #26) ────────────────────

/** The Uang Muka slot for a direction: liability for sales, asset for purchase. */
function advanceKeyFor(direction: AdvanceDirection): MappingKey {
  return direction === "sales" ? MAPPING_KEYS.ADVANCE_SALES : MAPPING_KEYS.ADVANCE_PURCHASE;
}

/**
 * Terima/bayar uang muka → cash against Uang Muka. No revenue, no expense.
 *
 * The cash slot is `cash_default`, the same one every other payment source uses.
 * A company banking foreign advances into dedicated accounts adds a
 * currency-specific `cash_default` mapping row (e.g. cash_default/CNY → 110105)
 * and `resolveAccountIds` prefers it automatically — the designed escape hatch,
 * rather than a second hardcoded rule here.
 */
async function buildAdvancePaymentEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const advance = await client.advancePayment.findUnique({ where: { id: ctx.sourceId } });
  if (!advance) throw new SourceNotFoundError("advance_payment", ctx.sourceId);
  if (advance.status === "canceled") return null;

  const direction = advance.type as AdvanceDirection;
  if (direction !== "sales" && direction !== "purchase") {
    throw new PostingRuleError(
      `Jenis uang muka "${advance.type}" belum punya aturan posting. ` +
        `Gunakan "sales" atau "purchase".`
    );
  }

  const currency = advance.currency || "IDR";
  const rate = resolveRate(currency, num(advance.rate) || null, ctx.rate);
  const amount = num(advance.amount);
  if (amount <= 0) return null;

  const advanceKey = advanceKeyFor(direction);
  const acc = await resolveAccountIds([MAPPING_KEYS.CASH_DEFAULT, advanceKey], currency, client);

  return {
    date: advance.date,
    type: "cash",
    note:
      direction === "sales"
        ? `Uang Muka Penjualan ${advance.advanceNo}`
        : `Uang Muka Pembelian ${advance.advanceNo}`,
    sourceType: "advance_payment",
    sourceId: advance.id,
    lines: buildAdvanceLines({
      direction,
      cashAccountId: acc[MAPPING_KEYS.CASH_DEFAULT],
      advanceAccountId: acc[advanceKey],
      amount,
      currency,
      rate,
      memo: advance.advanceNo,
    }),
  };
}

/**
 * Kompensasi uang muka → Uang Muka against Piutang/Hutang (+ selisih kurs).
 *
 * ── WHICH RATE, AND WHEN WE DECLINE TO GUESS ────────────────────────────────
 * The entry's own currency/rate are the ADVANCE's, because that is what Uang
 * Muka is relieved at. The target document's rate reaches the rule through
 * `settlementLegs` — the *same* helper issue #23 uses for cash settlements, not
 * a parallel one — which returns `undefined`, meaning "book flat, no FX", in
 * exactly the cases #23 already refuses to compute a difference for:
 *
 *   • the target invoice/purchase carries no rate (legacy row). Its booked rate
 *     is unknown, so the difference from it is unknowable.
 *   • the target is in a different currency from the advance. There is no
 *     common unit, and inventing a settlement-date cross rate is the guess
 *     `resolveRate` exists to refuse.
 *
 * A RATELESS LEGACY *ADVANCE* is the mirror case and is handled one line up, by
 * `resolveRate`: a foreign advance with no rate has no IDR value at all, so its
 * own receipt never posted either, and this refuses rather than invents one.
 * "Book flat" therefore always means "at the advance's known rate", which is
 * well-defined — never "at 1:1".
 */
async function buildAdvanceApplicationEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const application = await client.advanceApplication.findUnique({
    where: { id: ctx.sourceId },
    include: { advance: true, invoice: true, purchase: true },
  });
  if (!application) throw new SourceNotFoundError("advance_application", ctx.sourceId);

  const advance = application.advance;
  if (advance.status === "canceled") return null;

  const direction = advance.type as AdvanceDirection;
  if (direction !== "sales" && direction !== "purchase") {
    throw new PostingRuleError(
      `Jenis uang muka "${advance.type}" belum punya aturan posting. ` +
        `Gunakan "sales" atau "purchase".`
    );
  }

  // Uang Muka is relieved at the rate it was booked at — the advance's own.
  const currency = advance.currency || "IDR";
  const rate = resolveRate(currency, num(advance.rate) || null, ctx.rate);
  const amount = num(application.amount);
  if (amount <= 0) return null;

  const target = direction === "sales" ? application.invoice : application.purchase;
  if (!target) {
    throw new PostingRuleError(
      direction === "sales"
        ? "Kompensasi uang muka penjualan harus menunjuk sebuah faktur."
        : "Kompensasi uang muka pembelian harus menunjuk sebuah pembelian."
    );
  }

  const memo =
    direction === "sales"
      ? application.invoice!.invoiceNo
      : `TRX-${application.purchase!.id}`;

  // The very same helper cash settlements use (issue #23) — one FX path, not two.
  //
  // ── ISSUE #43 ON THE ADVANCE SIDE ────────────────────────────────────────
  // `settlementFor` needs the settlement-date rate of the currency the money is
  // coming FROM. For a cash payment that is the payment's own `rate` — a
  // payment's rate IS the rate on the day it moved. An advance is different:
  // its `rate` is what Uang Muka was booked at, possibly months before this
  // compensation. So when the target is in another currency, both sides are
  // valued at the COMPENSATION date and the advance's own settlement-date rate
  // is handed to the rule for its "legs sum to the amount" guard, while each
  // account is still relieved at the rate it was BOOKED at.
  const crossCurrency = (target.currency || "IDR") !== currency;
  const ownSettlementRate = crossCurrency
    ? await resolveSettlementRate(currency, application.date, client)
    : rate;
  const { docCurrency, legs: settles } = await settlementFor(
    target,
    currency,
    ownSettlementRate,
    amount,
    application.date,
    client,
    memo
  );

  const advanceKey = advanceKeyFor(direction);
  const counterKey = direction === "sales" ? MAPPING_KEYS.AR_DEFAULT : MAPPING_KEYS.AP_DEFAULT;
  // Uang Muka stays in the advance's currency; the receivable/payable is
  // relieved in the TARGET document's (issue #43).
  const acc = await resolveAccountIds(withFxKey([advanceKey], settles), currency, client);
  const counterAccountId = await resolveAccountId(counterKey, docCurrency, client);

  return {
    date: application.date,
    // A reclassification between balance-sheet accounts: no cash moves and no
    // sale is recognised here, so neither "cash" nor "sales" describes it.
    type: "adjustment",
    note: `Kompensasi ${advance.advanceNo} → ${memo}`,
    sourceType: "advance_application",
    sourceId: application.id,
    lines: buildAdvanceCompensationLines({
      direction,
      advanceAccountId: acc[advanceKey],
      counterAccountId,
      fxAccountId: acc[MAPPING_KEYS.FX_GAIN_LOSS],
      amount,
      settles,
      settlementRate: crossCurrency ? ownSettlementRate : undefined,
      currency,
      rate,
      memo,
    }),
  };
}

// ─── Retur penjualan / pembelian (issue #27) ─────────────

/**
 * Retur Penjualan → the sales invoice reversed proportionally:
 * D: Penjualan (+ D: Hutang PPN Keluaran), K: Piutang Usaha.
 *
 * The return carries its own `subtotal`, `taxAmount`, `currency` and `rate`,
 * copied from the origin invoice at creation and capped there against what was
 * invoiced (see `@/lib/returns`). Here we only turn those stored figures into the
 * reversed journal, valued at the INVOICE's rate — a return is a partial reversal
 * of the invoice, so there is no settlement and no FX leg. A 0%/export return has
 * `taxAmount` 0 and gets no VAT line, exactly like the untaxed invoice it mirrors.
 */
async function buildSalesReturnEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const ret = await client.salesReturn.findUnique({ where: { id: ctx.sourceId } });
  if (!ret) throw new SourceNotFoundError("sales_return", ctx.sourceId);
  if (ret.status === "canceled") return null;

  const currency = ret.currency || "IDR";
  const rate = resolveRate(currency, num(ret.rate) || null, ctx.rate);
  const subtotal = round2(num(ret.subtotal));
  const tax = round2(num(ret.taxAmount));
  if (subtotal <= 0) return null;

  const keys: MappingKey[] = [MAPPING_KEYS.AR_DEFAULT, MAPPING_KEYS.SALES_DEFAULT];
  if (tax > 0) keys.push(MAPPING_KEYS.VAT_OUT);
  const acc = await resolveAccountIds(keys, currency, client);

  return {
    date: ret.date,
    type: "sales_return",
    note: `Retur Penjualan ${ret.returnNo}`,
    sourceType: "sales_return",
    sourceId: ret.id,
    lines: buildSalesReturnLines({
      arAccountId: acc[MAPPING_KEYS.AR_DEFAULT],
      salesAccountId: acc[MAPPING_KEYS.SALES_DEFAULT],
      vatOutAccountId: tax > 0 ? acc[MAPPING_KEYS.VAT_OUT] : undefined,
      subtotal,
      taxAmount: tax,
      currency,
      rate,
      memo: ret.returnNo,
    }),
  };
}

/**
 * Retur Pembelian → the purchase reversed proportionally:
 * D: Hutang Usaha, K: Persediaan (+ K: PPN Masukan).
 *
 * Mirror of the sales return, inheriting the origin PURCHASE's currency/rate.
 * Persediaan is credited here at the returned net value; the accompanying stock
 * `out` movement is recorded for quantity only and posts no journal, so inventory
 * is never double-credited.
 */
async function buildPurchaseReturnEntry(
  client: Client,
  ctx: PostingContext
): Promise<JournalEntryInput | null> {
  const ret = await client.purchaseReturn.findUnique({ where: { id: ctx.sourceId } });
  if (!ret) throw new SourceNotFoundError("purchase_return", ctx.sourceId);
  if (ret.status === "canceled") return null;

  const currency = ret.currency || "IDR";
  const rate = resolveRate(currency, num(ret.rate) || null, ctx.rate);
  const subtotal = round2(num(ret.subtotal));
  const tax = round2(num(ret.taxAmount));
  if (subtotal <= 0) return null;

  const keys: MappingKey[] = [MAPPING_KEYS.AP_DEFAULT, MAPPING_KEYS.INVENTORY];
  if (tax > 0) keys.push(MAPPING_KEYS.VAT_IN);
  const acc = await resolveAccountIds(keys, currency, client);

  return {
    date: ret.date,
    type: "purchase_return",
    note: `Retur Pembelian ${ret.returnNo}`,
    sourceType: "purchase_return",
    sourceId: ret.id,
    lines: buildPurchaseReturnLines({
      apAccountId: acc[MAPPING_KEYS.AP_DEFAULT],
      inventoryAccountId: acc[MAPPING_KEYS.INVENTORY],
      vatInAccountId: tax > 0 ? acc[MAPPING_KEYS.VAT_IN] : undefined,
      subtotal,
      taxAmount: tax,
      currency,
      rate,
      memo: ret.returnNo,
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
    case "advance_payment":
      return buildAdvancePaymentEntry(client, ctx);
    case "advance_application":
      return buildAdvanceApplicationEntry(client, ctx);
    case "sales_return":
      return buildSalesReturnEntry(client, ctx);
    case "purchase_return":
      return buildPurchaseReturnEntry(client, ctx);
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
