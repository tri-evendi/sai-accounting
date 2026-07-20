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
  amount: number;
  memo?: string;
}

/** Penerimaan penjualan → D: Kas/Bank, K: Piutang Usaha. */
export function buildSalesReceiptLines(input: SalesReceiptInput): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingRuleError("Nilai penerimaan harus lebih besar dari nol.");
  const { currency, rate, memo } = input;

  return [
    { accountId: input.cashAccountId, debit: amount, currency, rate, memo },
    { accountId: input.arAccountId, credit: amount, currency, rate, memo },
  ];
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
  amount: number;
  memo?: string;
}

/** Pembayaran ke supplier → D: Hutang Usaha, K: Kas/Bank. */
export function buildSupplierPaymentLines(input: SupplierPaymentInput): JournalLineInput[] {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingRuleError("Nilai pembayaran harus lebih besar dari nol.");
  const { currency, rate, memo } = input;

  return [
    { accountId: input.apAccountId, debit: amount, currency, rate, memo },
    { accountId: input.cashAccountId, credit: amount, currency, rate, memo },
  ];
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
