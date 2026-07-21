/**
 * PPN (Indonesian VAT) — the single source of truth for the tax rate and for how
 * a document's DPP / PPN / total are derived from it (issue #16).
 *
 * Pure module: no Prisma, no I/O — safe to import into Zod schemas and client
 * components, exactly like ./validations/fx and ./posting/rules. Money is rounded
 * with the same `round2` the posting rules use, so a figure computed here and the
 * figure the ledger stores can never disagree by a cent.
 *
 * WHAT THIS MODULE IS NOT: it does not post anything. A taxable invoice stores the
 * PPN it computes here into `invoices.tax_amount`, and the auto-posting engine
 * (src/lib/posting) turns that into the Hutang PPN Keluaran leg. Purchases mirror
 * it through PPN Masukan. A 0% / non-taxable document computes PPN 0, and the
 * posting engine then emits NO VAT line at all — never a zero one.
 */
import { round2 } from "@/lib/posting/rules";

/**
 * The global default PPN rate, in percent. 11% in Indonesia since 1 April 2022
 * (UU HPP). This is the "global tax setting" issue #16 asks for: one authoritative
 * default that a per-invoice `taxRate` overrides and that a tax-exempt customer or
 * an export (foreign-currency) document switches off.
 *
 * Kept as a constant, not a settings table row, on purpose: the rate is a
 * statutory figure with exactly one correct value at a time, the same for every
 * user of the app — not per-tenant configuration. A document that needs a
 * different rate carries its own `taxRate`; if the statutory rate itself changes,
 * this one line changes with it and every default follows.
 */
export const DEFAULT_TAX_RATE = 11;

/** Export / non-VAT rate. The sensible default for foreign-currency invoices. */
export const EXPORT_TAX_RATE = 0;

export interface TaxBreakdown {
  /** DPP — Dasar Pengenaan Pajak (tax base), in the document's own currency. */
  dpp: number;
  /** Effective PPN rate applied, in percent (0 for export / non-VAT). */
  taxRate: number;
  /** PPN amount, in the document's own currency. */
  taxAmount: number;
  /** DPP + PPN, in the document's own currency. */
  total: number;
}

/**
 * DPP / PPN / total for a document at a given rate.
 *
 * A rate of 0 (export / non-VAT) yields PPN 0 — the posting engine then emits no
 * VAT line. PPN is `round2(DPP × rate ÷ 100)`, computed on the whole DPP the way
 * an Indonesian Faktur Pajak is (document-level, not per line item).
 */
export function computeTax(subtotal: number, taxRate: number = DEFAULT_TAX_RATE): TaxBreakdown {
  const dpp = round2(subtotal);
  const rate = taxRate > 0 ? taxRate : 0;
  const taxAmount = round2((dpp * rate) / 100);
  return { dpp, taxRate: rate, taxAmount, total: round2(dpp + taxAmount) };
}

export interface InvoiceTaxInput {
  /** Whether PPN applies to this document. */
  taxable?: boolean;
  /** Per-invoice rate override, in percent. Defaults to DEFAULT_TAX_RATE. */
  taxRate?: number | null;
  /**
   * Back-compat only: an explicit PPN amount from a caller that predates the
   * `taxable` + `taxRate` fields (the amount-only invoice API this issue
   * replaces). Consulted solely when `taxable` is not set.
   */
  taxAmount?: number | null;
}

export interface ResolvedInvoiceTax extends Omit<TaxBreakdown, "taxRate"> {
  taxable: boolean;
  /** NULL when no rate is known (a legacy amount-only entry, or an untaxed row). */
  taxRate: number | null;
}

/**
 * Resolve what actually gets stored on an invoice, from whatever the form/API
 * sent. The server is authoritative: when a document is `taxable`, PPN is
 * recomputed from the rate here, so a stale or tampered client amount can never
 * reach the ledger.
 *
 *   • taxable  → PPN = DPP × (taxRate ?? DEFAULT_TAX_RATE); rate stored as used
 *                (11 for the default, 0 for an explicit 0% export).
 *   • not taxable, but a raw taxAmount > 0 → honoured as-is (old amount-only
 *     callers), rate stored NULL because none was recorded.
 *   • otherwise → untaxed: PPN 0, rate NULL.
 */
export function resolveInvoiceTax(subtotal: number, input: InvoiceTaxInput): ResolvedInvoiceTax {
  if (input.taxable) {
    const b = computeTax(subtotal, input.taxRate ?? DEFAULT_TAX_RATE);
    return { dpp: b.dpp, taxRate: b.taxRate, taxAmount: b.taxAmount, total: b.total, taxable: true };
  }

  const explicit = round2(input.taxAmount ?? 0);
  const dpp = round2(subtotal);
  if (explicit > 0) {
    return { dpp, taxRate: null, taxAmount: explicit, total: round2(dpp + explicit), taxable: true };
  }
  return { dpp, taxRate: null, taxAmount: 0, total: dpp, taxable: false };
}

/**
 * The sensible tax default for a new invoice, given its currency and customer.
 *
 * Export / foreign-currency invoices are commonly PPN 0% (or not-VAT), and a
 * tax-exempt customer (non-PKP, or an export buyer) is never charged PPN — so
 * both default to non-taxable. Domestic IDR invoices default to the standard 11%.
 * This is only the DEFAULT: the form control lets the user override it either way.
 */
export function defaultInvoiceTax(opts: {
  currency?: string | null;
  customerTaxExempt?: boolean | null;
}): { taxable: boolean; taxRate: number } {
  if (opts.customerTaxExempt) return { taxable: false, taxRate: EXPORT_TAX_RATE };
  if (opts.currency && opts.currency !== "IDR") return { taxable: false, taxRate: EXPORT_TAX_RATE };
  return { taxable: true, taxRate: DEFAULT_TAX_RATE };
}
