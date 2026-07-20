/**
 * Posting rules — PURE functions: resolved input → journal lines.
 *
 * No Prisma, no I/O, no clock. Everything these need (account ids, amounts,
 * currency, rate) is passed in, which is what makes the account mapping for each
 * transaction type unit-testable without a database.
 *
 * Every builder returns lines in *original currency* plus the `rate` that converts
 * them to IDR base; ledger.ts computes base_debit/base_credit and enforces
 * Σ base_debit = Σ base_credit.
 */
import type { JournalLineInput } from "@/lib/ledger";

/** Cents-accurate rounding — never trust raw float arithmetic on money. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Raised when a rule cannot build a correct journal from what it was given. */
export class PostingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostingRuleError";
  }
}

export interface CurrencyContext {
  currency: string;
  rate: number; // to IDR base; 1 for IDR
}

/**
 * Decide the rate to use, loudly.
 *
 * IDR is always 1. Otherwise the record's own rate wins, then an explicitly
 * supplied one. A foreign-currency amount with no rate anywhere is an error —
 * defaulting to 1 would book a USD invoice as if 1 USD = 1 IDR.
 */
export function resolveRate(
  currency: string,
  recordRate?: number | null,
  explicitRate?: number | null
): number {
  if (currency === "IDR") return 1;
  if (recordRate != null && recordRate > 0) return recordRate;
  if (explicitRate != null && explicitRate > 0) return explicitRate;
  throw new PostingRuleError(
    `Kurs untuk mata uang ${currency} tidak tersedia. ` +
      `Isi kurs pada transaksi atau kirim parameter "rate" saat posting. ` +
      `Jurnal tidak diposting agar nilai IDR tidak salah.`
  );
}

/** Drop zero-value lines so journals stay readable. */
function compact(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
}

// ─── Selisih kurs / FX difference (issue #23) ────────────

/**
 * One document being settled by a payment, at the rate the document was
 * originally booked at.
 *
 * A receivable booked when 1 USD = 15.000 sits in the ledger at that rate
 * forever. When the customer pays and the rate has moved, the cash is worth a
 * different number of rupiah than the receivable it clears. The gap is the
 * realized FX gain/loss — a real profit-and-loss event, not a rounding artefact.
 */
export interface SettlementLeg {
  /** Amount cleared, in the DOCUMENT's currency (not the payment's). */
  amount: number;
  /** The document's currency. */
  currency: string;
  /** Rate the document was booked at — NOT the settlement rate. */
  rate: number;
  memo?: string;
}

/** Base-IDR value of a line, rounded exactly as ledger.prepareLines will round it. */
const baseOf = (amount: number, rate: number) => round2(round2(amount) * rate);

/**
 * The FX line, derived as the plug that balances the entry in IDR base.
 *
 * Computing it as `Σ base debit − Σ base credit` rather than from a rate formula
 * is deliberate: it is balanced *by construction*, using the very same rounded
 * base amounts `prepareLines` will store, so no cent can ever escape between the
 * rule and `assertBalanced`. The only thing that can make these lines disagree is
 * a rate difference, which is precisely what belongs in the FX account.
 *
 * Booked in IDR at rate 1 — the difference is already a base-currency amount, and
 * re-rating it would double-convert.
 */
function fxPlugLines(
  lines: JournalLineInput[],
  fxAccountId: number | undefined,
  memo?: string
): JournalLineInput[] {
  const totalDebit = lines.reduce((s, l) => s + baseOf(l.debit ?? 0, l.rate ?? 1), 0);
  const totalCredit = lines.reduce((s, l) => s + baseOf(l.credit ?? 0, l.rate ?? 1), 0);
  const diff = round2(totalDebit - totalCredit);
  if (diff === 0) return [];

  if (!fxAccountId) {
    throw new PostingRuleError(
      `Pelunasan terjadi pada kurs berbeda dari kurs dokumen (selisih ` +
        `Rp ${Math.abs(diff).toLocaleString("id-ID")}), tetapi akun Laba/Rugi ` +
        `Selisih Kurs belum dipetakan (fx_gain_loss). Jurnal tidak diposting.`
    );
  }

  // diff > 0 → base debits exceed base credits, so the plug is a CREDIT.
  //   receivable settled: cash worth more rupiah than the piutang → gain (income).
  //   payable settled:    cash worth fewer rupiah than the hutang → gain (income).
  // diff < 0 → the mirror image: a DEBIT to the same account, i.e. a loss.
  return [
    diff > 0
      ? { accountId: fxAccountId, credit: diff, currency: "IDR", rate: 1, memo }
      : { accountId: fxAccountId, debit: -diff, currency: "IDR", rate: 1, memo },
  ];
}

/**
 * Legs default to "settled at the payment's own rate", which is what every
 * caller did before issue #23 and yields no FX line at all.
 */
function resolveLegs(
  legs: SettlementLeg[] | undefined,
  amount: number,
  ctx: CurrencyContext,
  memo: string | undefined,
  label: string
): SettlementLeg[] {
  if (!legs || legs.length === 0) {
    return [{ amount, currency: ctx.currency, rate: ctx.rate, memo }];
  }
  for (const leg of legs) {
    if (round2(leg.amount) <= 0) {
      throw new PostingRuleError(`Nilai pelunasan ${label} harus lebih besar dari nol.`);
    }
    if (!(leg.rate > 0)) {
      throw new PostingRuleError(
        `Kurs dokumen untuk pelunasan ${label} tidak tersedia. ` +
          `Jurnal tidak diposting agar selisih kurs tidak salah hitung.`
      );
    }
  }

  // Sanity guard against the plug silently absorbing an AMOUNT error rather than
  // a RATE difference. Only checkable when every leg shares the payment's
  // currency; a cross-currency settlement has no common unit to compare in, and
  // reconciling it is the caller's job.
  const sameCurrency = legs.every((l) => l.currency === ctx.currency);
  if (sameCurrency) {
    const settled = round2(legs.reduce((s, l) => s + round2(l.amount), 0));
    if (settled !== round2(amount)) {
      throw new PostingRuleError(
        `Rincian pelunasan ${label} (${settled}) tidak sama dengan nilai pembayaran ` +
          `(${round2(amount)}) dalam mata uang ${ctx.currency}. ` +
          `Selisihnya bukan selisih kurs, jadi jurnal tidak diposting.`
      );
    }
  }
  return legs;
}

// ─── Sales ───────────────────────────────────────────────

export interface SalesInvoiceInput extends CurrencyContext {
  arAccountId: number;
  salesAccountId: number;
  vatOutAccountId?: number;
  /** Net sales value, excluding tax. */
  subtotal: number;
  /** Output VAT (PPN Keluaran). 0 / omitted = untaxed document. */
  taxAmount?: number;
  memo?: string;
}

/** Faktur Penjualan → D: Piutang Usaha, K: Penjualan (+ K: Hutang PPN Keluaran). */
export function buildSalesInvoiceLines(input: SalesInvoiceInput): JournalLineInput[] {
  const subtotal = round2(input.subtotal);
  const tax = round2(input.taxAmount ?? 0);
  if (subtotal < 0 || tax < 0) {
    throw new PostingRuleError("Nilai faktur penjualan tidak boleh negatif.");
  }
  if (tax > 0 && !input.vatOutAccountId) {
    throw new PostingRuleError(
      "Faktur kena PPN tetapi akun Hutang PPN Keluaran belum dipetakan (vat_out)."
    );
  }
  const { currency, rate, memo } = input;

  return compact([
    { accountId: input.arAccountId, debit: round2(subtotal + tax), currency, rate, memo },
    { accountId: input.salesAccountId, credit: subtotal, currency, rate, memo },
    ...(tax > 0
      ? [{ accountId: input.vatOutAccountId!, credit: tax, currency, rate, memo }]
      : []),
  ]);
}

export interface SalesReceiptInput extends CurrencyContext {
  cashAccountId: number;
  arAccountId: number;
  /** Cash received, in the PAYMENT's currency, valued at `rate`. */
  amount: number;
  /**
   * Receivable(s) cleared, each at the rate its invoice was booked at.
   * Omitted → cleared at the payment's own rate, i.e. no FX difference.
   */
  settles?: SettlementLeg[];
  /** Laba/Rugi Selisih Kurs. Required only when an FX difference arises. */
  fxAccountId?: number;
  memo?: string;
}

/**
 * Penerimaan penjualan → D: Kas/Bank, K: Piutang Usaha (+ selisih kurs).
 *
 * The cash lands at the settlement rate; the receivable is relieved at the rate
 * the invoice was booked at, so the piutang is cleared for exactly the rupiah it
 * was raised for. Any remainder is realized FX (issue #23).
 *
 * Partial payments need no proration: relieving `amount` document-units at the
 * document's own rate is inherently proportional, and once the instalments sum
 * to the invoice total the AR relieved sums to the original base value exactly.
 */
export function buildSalesReceiptLines(input: SalesReceiptInput): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingRuleError("Nilai penerimaan harus lebih besar dari nol.");
  const { currency, rate, memo } = input;
  const legs = resolveLegs(input.settles, amount, input, memo, "piutang");

  const lines: JournalLineInput[] = [
    { accountId: input.cashAccountId, debit: amount, currency, rate, memo },
    ...legs.map((leg) => ({
      accountId: input.arAccountId,
      credit: round2(leg.amount),
      currency: leg.currency,
      rate: leg.rate,
      memo: leg.memo ?? memo,
    })),
  ];
  return [...lines, ...fxPlugLines(lines, input.fxAccountId, memo)];
}

// ─── Purchases ───────────────────────────────────────────

export interface PurchaseInput extends CurrencyContext {
  /** Persediaan for goods, or an expense account for services/overheads. */
  debitAccountId: number;
  apAccountId: number;
  vatInAccountId?: number;
  /** Net purchase value, excluding tax. */
  subtotal: number;
  /** Input VAT (PPN Masukan). */
  taxAmount?: number;
  memo?: string;
}

/** Pembelian → D: Persediaan/Beban (+ D: PPN Masukan), K: Hutang Usaha. */
export function buildPurchaseLines(input: PurchaseInput): JournalLineInput[] {
  const subtotal = round2(input.subtotal);
  const tax = round2(input.taxAmount ?? 0);
  if (subtotal < 0 || tax < 0) {
    throw new PostingRuleError("Nilai pembelian tidak boleh negatif.");
  }
  if (tax > 0 && !input.vatInAccountId) {
    throw new PostingRuleError(
      "Pembelian kena PPN tetapi akun PPN Masukan belum dipetakan (vat_in)."
    );
  }
  const { currency, rate, memo } = input;

  return compact([
    { accountId: input.debitAccountId, debit: subtotal, currency, rate, memo },
    ...(tax > 0 ? [{ accountId: input.vatInAccountId!, debit: tax, currency, rate, memo }] : []),
    { accountId: input.apAccountId, credit: round2(subtotal + tax), currency, rate, memo },
  ]);
}

export interface SupplierPaymentInput extends CurrencyContext {
  apAccountId: number;
  cashAccountId: number;
  /** Cash paid, in the PAYMENT's currency, valued at `rate`. */
  amount: number;
  /**
   * Payable(s) cleared, each at the rate its purchase was booked at. One leg per
   * allocated purchase (issue #37). Omitted → cleared at the payment's own rate.
   */
  settles?: SettlementLeg[];
  /** Laba/Rugi Selisih Kurs. Required only when an FX difference arises. */
  fxAccountId?: number;
  memo?: string;
}

/**
 * Pembayaran ke supplier → D: Hutang Usaha, K: Kas/Bank (+ selisih kurs).
 *
 * Mirror of the receipt: the hutang is relieved at the rate the purchase was
 * booked at, cash leaves at the settlement rate, and the gap is realized FX.
 * Paying more rupiah than the liability was raised for is a LOSS — the plug
 * lands on the debit side on its own, without a separate sign rule.
 */
export function buildSupplierPaymentLines(input: SupplierPaymentInput): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingRuleError("Nilai pembayaran harus lebih besar dari nol.");
  const { currency, rate, memo } = input;
  const legs = resolveLegs(input.settles, amount, input, memo, "hutang");

  const lines: JournalLineInput[] = [
    ...legs.map((leg) => ({
      accountId: input.apAccountId,
      debit: round2(leg.amount),
      currency: leg.currency,
      rate: leg.rate,
      memo: leg.memo ?? memo,
    })),
    { accountId: input.cashAccountId, credit: amount, currency, rate, memo },
  ];
  return [...lines, ...fxPlugLines(lines, input.fxAccountId, memo)];
}

// ─── Cash ────────────────────────────────────────────────

export interface CashTransactionInput extends CurrencyContext {
  cashAccountId: number;
  /** The other side, chosen by the user (income, expense, AR, AP, …). */
  counterAccountId: number;
  /** Money in. */
  debit?: number;
  /** Money out. */
  credit?: number;
  memo?: string;
}

/**
 * Transaksi kas → cash account against the chosen counter-account.
 * debit  (uang masuk): D: Kas/Bank, K: akun lawan
 * credit (uang keluar): D: akun lawan, K: Kas/Bank
 */
export function buildCashTransactionLines(input: CashTransactionInput): JournalLineInput[] {
  const debit = round2(input.debit ?? 0);
  const credit = round2(input.credit ?? 0);
  if (debit > 0 && credit > 0) {
    throw new PostingRuleError("Transaksi kas tidak boleh berisi debit dan kredit sekaligus.");
  }
  if (debit <= 0 && credit <= 0) {
    throw new PostingRuleError("Transaksi kas harus berisi debit atau kredit.");
  }
  if (input.cashAccountId === input.counterAccountId) {
    throw new PostingRuleError("Akun lawan tidak boleh sama dengan akun kas.");
  }
  const { currency, rate, memo } = input;

  return debit > 0
    ? [
        { accountId: input.cashAccountId, debit, currency, rate, memo },
        { accountId: input.counterAccountId, credit: debit, currency, rate, memo },
      ]
    : [
        { accountId: input.counterAccountId, debit: credit, currency, rate, memo },
        { accountId: input.cashAccountId, credit, currency, rate, memo },
      ];
}

// ─── Uang muka / advance payments (issue #26) ────────────

/**
 * Which way an advance points.
 *
 * `sales`    — the customer paid us early. We hold their money and owe them
 *              goods, so Uang Muka Penjualan is a LIABILITY.
 * `purchase` — we paid the supplier early. They hold our money and owe us
 *              goods, so Uang Muka Pembelian is an ASSET.
 */
export type AdvanceDirection = "sales" | "purchase";

export interface AdvanceInput extends CurrencyContext {
  direction: AdvanceDirection;
  cashAccountId: number;
  /** Uang Muka Penjualan (sales) or Uang Muka Pembelian (purchase). */
  advanceAccountId: number;
  /** Cash moved, in the advance's own currency, valued at `rate`. */
  amount: number;
  memo?: string;
}

/**
 * Terima/bayar uang muka — the first leg, before any invoice exists.
 *
 *   sales:    D: Kas/Bank            K: Uang Muka Penjualan (liability)
 *   purchase: D: Uang Muka Pembelian K: Kas/Bank            (asset)
 *
 * THE POINT OF THIS RULE IS WHAT IT DOES NOT TOUCH. No revenue account appears
 * on the sales side and no expense account on the purchase side, because nothing
 * has been earned or consumed — only cash has moved against a promise. Revenue
 * is recognised once, by the invoice; recognising it here as well would double
 * the income the moment the invoice is raised. That is the single most important
 * property of issue #26 and `tests/posting-rules.test.ts` asserts it directly.
 *
 * Both lines sit at the same rate, so no FX difference can arise on receipt:
 * there is only one document and therefore only one rate. The difference appears
 * later, at compensation, when the advance's rate meets the invoice's.
 */
export function buildAdvanceLines(input: AdvanceInput): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) {
    throw new PostingRuleError("Nilai uang muka harus lebih besar dari nol.");
  }
  if (input.cashAccountId === input.advanceAccountId) {
    throw new PostingRuleError("Akun uang muka tidak boleh sama dengan akun kas.");
  }
  const { currency, rate, memo } = input;

  return input.direction === "sales"
    ? [
        { accountId: input.cashAccountId, debit: amount, currency, rate, memo },
        { accountId: input.advanceAccountId, credit: amount, currency, rate, memo },
      ]
    : [
        { accountId: input.advanceAccountId, debit: amount, currency, rate, memo },
        { accountId: input.cashAccountId, credit: amount, currency, rate, memo },
      ];
}

export interface AdvanceCompensationInput extends CurrencyContext {
  direction: AdvanceDirection;
  advanceAccountId: number;
  /** Piutang Usaha for a sales advance, Hutang Usaha for a purchase advance. */
  counterAccountId: number;
  /**
   * Amount compensated, in the ADVANCE's currency. `currency`/`rate` on this
   * input are the advance's own — the rate Uang Muka was booked at.
   */
  amount: number;
  /**
   * The invoice/purchase being compensated, at the rate THAT document was
   * booked at. Omitted → compensated at the advance's own rate, i.e. flat, no
   * FX difference. That is the honest fallback when the target document carries
   * no rate (see `advanceSettlementLegs` in ./index.ts).
   */
  settles?: SettlementLeg[];
  /** Laba/Rugi Selisih Kurs. Required only when an FX difference arises. */
  fxAccountId?: number;
  memo?: string;
}

/**
 * Kompensasi uang muka — the second leg, when the invoice finally exists.
 *
 *   sales:    D: Uang Muka Penjualan  K: Piutang Usaha
 *   purchase: D: Hutang Usaha         K: Uang Muka Pembelian
 *
 * The advance is *moved*, not spent: value leaves Uang Muka and lands against
 * the receivable/payable, reducing what is still owed. No cash moves — it moved
 * when the advance was received — and no revenue or expense is touched, because
 * the invoice's own journal already recognised that in full. This is why the
 * compensation is a posting source of its own rather than extra lines inside the
 * invoice's entry: the invoice recognises the sale, this entry settles part of
 * it, and keeping them separate means applying an advance to an already-posted
 * invoice never has to rewrite the invoice's journal.
 *
 * ── SELISIH KURS (reuses issue #23, deliberately not a second FX path) ───────
 * A CNY advance is booked at the advance's rate; the invoice is raised at the
 * invoice's rate. Uang Muka is relieved at the rate it was booked at and the
 * receivable at the rate IT was booked at, so each account is cleared for
 * exactly the rupiah it was raised for — and the gap between the two is realized
 * FX, exactly as when cash settles a receivable. It is derived by the very same
 * `fxPlugLines` used by `buildSalesReceiptLines` and `buildSupplierPaymentLines`,
 * so it is balanced by construction against the same rounded base amounts
 * `prepareLines` will store.
 *
 * `resolveLegs` carries over #23's guard unchanged: the legs must sum to
 * `amount` in the document currency, so the plug can only ever absorb a RATE
 * gap, never an amount error. Partial compensation needs no proration for the
 * same reason a partial payment does not — relieving `amount` document-units at
 * the document's own rate is inherently proportional.
 */
export function buildAdvanceCompensationLines(
  input: AdvanceCompensationInput
): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) {
    throw new PostingRuleError("Nilai kompensasi uang muka harus lebih besar dari nol.");
  }
  if (input.advanceAccountId === input.counterAccountId) {
    throw new PostingRuleError(
      "Akun uang muka tidak boleh sama dengan akun piutang/hutang."
    );
  }
  const { currency, rate, memo } = input;
  const label = input.direction === "sales" ? "piutang" : "hutang";
  const legs = resolveLegs(input.settles, amount, input, memo, label);

  const advanceLine = {
    accountId: input.advanceAccountId,
    currency,
    rate,
    memo,
  };
  const counterLines = legs.map((leg) => ({
    accountId: input.counterAccountId,
    currency: leg.currency,
    rate: leg.rate,
    memo: leg.memo ?? memo,
  }));

  const lines: JournalLineInput[] =
    input.direction === "sales"
      ? [
          // Liability down (debit), receivable down (credit).
          { ...advanceLine, debit: amount },
          ...counterLines.map((l, i) => ({ ...l, credit: round2(legs[i].amount) })),
        ]
      : [
          // Payable down (debit), asset down (credit).
          ...counterLines.map((l, i) => ({ ...l, debit: round2(legs[i].amount) })),
          { ...advanceLine, credit: amount },
        ];

  return [...lines, ...fxPlugLines(lines, input.fxAccountId, memo)];
}

// ─── Inventory / COGS ────────────────────────────────────

export interface CogsInput {
  cogsAccountId: number;
  inventoryAccountId: number;
  /** Total cost in IDR (quantity × weighted-average unit cost). */
  cost: number;
  memo?: string;
}

/**
 * Stok keluar (penjualan) → D: HPP, K: Persediaan.
 * Always IDR: inventory is carried at IDR base cost, so no rate applies.
 */
export function buildCogsLines(input: CogsInput): JournalLineInput[] {
  const cost = round2(input.cost);
  if (cost <= 0) throw new PostingRuleError("Nilai HPP harus lebih besar dari nol.");

  return [
    { accountId: input.cogsAccountId, debit: cost, currency: "IDR", rate: 1, memo: input.memo },
    {
      accountId: input.inventoryAccountId,
      credit: cost,
      currency: "IDR",
      rate: 1,
      memo: input.memo,
    },
  ];
}
