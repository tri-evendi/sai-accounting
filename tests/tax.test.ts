/**
 * PPN (Indonesian VAT) as a first-class field (issue #16).
 *
 * Three layers, all here so they cross-check on one set of numbers:
 *   1. The pure computation (src/lib/tax): DPP / PPN / total, the 11% default,
 *      the 0%/export path, and the server-authoritative resolve.
 *   2. The Zod surface (invoice + customer schemas): the taxable/taxRate/exempt
 *      inputs the routes accept.
 *   3. The posting engine end to end: a taxable sale credits Hutang PPN Keluaran
 *      and a purchase debits PPN Masukan, both balanced in IDR base; a 0%/export
 *      invoice posts NO VAT line at all — never a zero one.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX_RATE,
  EXPORT_TAX_RATE,
  computeTax,
  resolveInvoiceTax,
  defaultInvoiceTax,
} from "@/lib/tax";
import { invoiceSchema } from "@/lib/validations/invoice";
import { customerSchema } from "@/lib/validations/finance";
import {
  ANY_CURRENCY,
  MAPPING_KEYS,
  postForSource,
} from "@/lib/posting";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

// ─── 1. Pure computation ─────────────────────────────────

describe("computeTax — DPP / PPN / total", () => {
  it("computes PPN 11% on the whole DPP", () => {
    const t = computeTax(10_000_000, DEFAULT_TAX_RATE);
    expect(t.dpp).toBe(10_000_000);
    expect(t.taxRate).toBe(11);
    expect(t.taxAmount).toBe(1_100_000);
    expect(t.total).toBe(11_100_000);
  });

  it("defaults to the statutory 11% when no rate is given", () => {
    expect(computeTax(2_000_000).taxAmount).toBe(220_000);
  });

  it("yields PPN 0 for a 0% / export rate", () => {
    const t = computeTax(50_000, EXPORT_TAX_RATE);
    expect(t.taxRate).toBe(0);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(50_000);
  });

  it("rounds PPN to cents, never a raw float", () => {
    // 333.33 × 11% = 36.6663 → 36.67.
    expect(computeTax(333.33, 11).taxAmount).toBe(36.67);
  });
});

describe("resolveInvoiceTax — the server is authoritative", () => {
  it("recomputes PPN from the rate, ignoring any client amount", () => {
    const r = resolveInvoiceTax(10_000_000, { taxable: true, taxRate: 11, taxAmount: 999 });
    expect(r.taxable).toBe(true);
    expect(r.taxRate).toBe(11);
    expect(r.taxAmount).toBe(1_100_000);
    expect(r.total).toBe(11_100_000);
    expect(r.dpp).toBe(10_000_000);
  });

  it("treats a non-taxable invoice as untaxed — PPN 0, rate NULL", () => {
    const r = resolveInvoiceTax(10_000_000, { taxable: false });
    expect(r.taxable).toBe(false);
    expect(r.taxAmount).toBe(0);
    expect(r.taxRate).toBeNull();
    expect(r.total).toBe(10_000_000);
  });

  it("treats an explicit 0% (export) as taxable-but-zero", () => {
    const r = resolveInvoiceTax(10_000_000, { taxable: true, taxRate: 0 });
    expect(r.taxable).toBe(true);
    expect(r.taxRate).toBe(0);
    expect(r.taxAmount).toBe(0);
  });

  it("honours a legacy amount-only input when taxable is unset", () => {
    const r = resolveInvoiceTax(10_000_000, { taxAmount: 1_100_000 });
    expect(r.taxable).toBe(true);
    expect(r.taxAmount).toBe(1_100_000);
    expect(r.taxRate).toBeNull(); // rate was never recorded, so it is not invented
  });
});

describe("defaultInvoiceTax — 0% default for export, 11% for domestic", () => {
  it("defaults a domestic IDR invoice to 11%", () => {
    expect(defaultInvoiceTax({ currency: "IDR" })).toEqual({ taxable: true, taxRate: 11 });
  });

  it("defaults a foreign-currency (export) invoice to 0%", () => {
    expect(defaultInvoiceTax({ currency: "USD" })).toEqual({ taxable: false, taxRate: 0 });
    expect(defaultInvoiceTax({ currency: "CNY" })).toEqual({ taxable: false, taxRate: 0 });
  });

  it("defaults a tax-exempt customer to 0%, even in IDR", () => {
    expect(defaultInvoiceTax({ currency: "IDR", customerTaxExempt: true })).toEqual({
      taxable: false,
      taxRate: 0,
    });
  });
});

// ─── 2. Zod surface ──────────────────────────────────────

describe("invoice schema — taxable + taxRate", () => {
  const base = {
    invoiceNo: "SI.2026.07.00001",
    date: "2026-07-20",
    items: [{ itemName: "Kopi", quantity: 4, price: 2_500 }],
  };

  it("defaults to non-taxable with no rate", () => {
    const result = invoiceSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxable).toBe(false);
      expect(result.data.taxRate).toBeUndefined();
    }
  });

  it("accepts an explicit taxable + rate", () => {
    const result = invoiceSchema.safeParse({ ...base, taxable: true, taxRate: 11 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxable).toBe(true);
      expect(result.data.taxRate).toBe(11);
    }
  });

  it("rejects a negative or absurd rate", () => {
    expect(invoiceSchema.safeParse({ ...base, taxRate: -1 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...base, taxRate: 101 }).success).toBe(false);
  });
});

describe("customer schema — tax exempt", () => {
  const base = { name: "PT Ekspor Jaya" };

  it("defaults to not exempt", () => {
    const result = customerSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.taxExempt).toBe(false);
  });

  it("accepts an exempt customer", () => {
    const result = customerSchema.safeParse({ ...base, taxExempt: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.taxExempt).toBe(true);
  });
});

// ─── 3. Posting engine end to end ────────────────────────

const ACC = {
  arIdr: 101,
  sales: 201,
  vatOut: 202,
  vatIn: 203,
  ap: 204,
  inventory: 205,
};

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.arIdr, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.sales, isActive: true },
  { key: MAPPING_KEYS.VAT_OUT, currency: ANY_CURRENCY, accountId: ACC.vatOut, isActive: true },
  { key: MAPPING_KEYS.VAT_IN, currency: ANY_CURRENCY, accountId: ACC.vatIn, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ap, isActive: true },
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
];

const DATE = new Date("2026-07-20T00:00:00.000Z");

function expectBalancedIdr(journal: FakeJournal | null) {
  expect(journal).not.toBeNull();
  const debit = journal!.lines.reduce((s, l) => s + l.baseDebit, 0);
  const credit = journal!.lines.reduce((s, l) => s + l.baseCredit, 0);
  expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
  return journal!;
}

const debitOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);
const creditOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.credit, 0);

describe("PPN posts to the right accounts, balanced in IDR base", () => {
  it("a domestic taxable sale: D Piutang (DPP+PPN) / K Penjualan (DPP) / K Hutang PPN Keluaran (PPN)", async () => {
    // DPP 10.000.000 at 11% → PPN 1.100.000, gross 11.100.000.
    const tax = resolveInvoiceTax(10_000_000, { taxable: true, taxRate: 11 });
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        1: {
          id: 1,
          invoiceNo: "SI.2026.07.00001",
          date: DATE,
          status: "pending",
          currency: "IDR",
          rate: null,
          taxAmount: tax.taxAmount,
          items: [{ quantity: 1, price: 10_000_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 1, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.arIdr)).toBe(11_100_000);
    expect(creditOn(j, ACC.sales)).toBe(10_000_000);
    expect(creditOn(j, ACC.vatOut)).toBe(1_100_000);
    expect(j.lines).toHaveLength(3);
  });

  it("a taxable purchase debits PPN Masukan and credits Hutang for the gross", async () => {
    const tax = resolveInvoiceTax(20_000_000, { taxable: true, taxRate: 11 });
    const tx = createFakeClient({
      mappings: MAPPINGS,
      supplierTransactions: {
        2: {
          id: 2,
          date: DATE,
          type: "purchase",
          amount: 20_000_000,
          taxAmount: tax.taxAmount,
          currency: "IDR",
          rate: null,
          supplier: { name: "PT Sumber Tani" },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 2,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.inventory)).toBe(20_000_000);
    expect(debitOn(j, ACC.vatIn)).toBe(2_200_000);
    expect(creditOn(j, ACC.ap)).toBe(22_200_000);
  });

  it("a 0% / export invoice posts NO VAT line at all — not a zero one", async () => {
    // An export invoice resolved at 0% carries PPN 0, so the engine emits exactly
    // two lines: AR and Sales. The Hutang PPN Keluaran account never appears.
    const tax = resolveInvoiceTax(10_000_000, { taxable: true, taxRate: 0 });
    expect(tax.taxAmount).toBe(0);

    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        3: {
          id: 3,
          invoiceNo: "SI.2026.07.00003",
          date: DATE,
          status: "pending",
          currency: "IDR",
          rate: null,
          taxAmount: tax.taxAmount,
          items: [{ quantity: 1, price: 10_000_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 3, tx })) as unknown as FakeJournal
    );
    expect(j.lines).toHaveLength(2);
    expect(j.lines.some((l) => l.accountId === ACC.vatOut)).toBe(false);
    expect(debitOn(j, ACC.arIdr)).toBe(10_000_000);
    expect(creditOn(j, ACC.sales)).toBe(10_000_000);
  });

  it("a tax-exempt customer's invoice (non-taxable) posts no VAT line", async () => {
    // The per-customer exempt path: defaultInvoiceTax marks the invoice
    // non-taxable, resolveInvoiceTax yields PPN 0, and no VAT line is posted.
    const def = defaultInvoiceTax({ currency: "IDR", customerTaxExempt: true });
    const tax = resolveInvoiceTax(5_000_000, def);
    expect(tax.taxAmount).toBe(0);

    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        4: {
          id: 4,
          invoiceNo: "SI.2026.07.00004",
          date: DATE,
          status: "pending",
          currency: "IDR",
          rate: null,
          taxAmount: tax.taxAmount,
          items: [{ quantity: 1, price: 5_000_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 4, tx })) as unknown as FakeJournal
    );
    expect(j.lines).toHaveLength(2);
    expect(j.lines.some((l) => l.accountId === ACC.vatOut)).toBe(false);
  });

  it("a foreign taxable invoice values AR, Sales and PPN at the same rate", async () => {
    // CNY DPP 10.000 at 11% → PPN 1.100, gross 11.100, at 2.250 IDR/CNY.
    const tax = resolveInvoiceTax(10_000, { taxable: true, taxRate: 11 });
    const tx = createFakeClient({
      mappings: [
        ...MAPPINGS,
        { key: MAPPING_KEYS.AR_DEFAULT, currency: "CNY", accountId: 103, isActive: true },
      ],
      invoices: {
        5: {
          id: 5,
          invoiceNo: "SI.2026.07.00005",
          date: DATE,
          status: "pending",
          currency: "CNY",
          rate: 2_250,
          taxAmount: tax.taxAmount,
          items: [{ quantity: 100, price: 100 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 5, tx })) as unknown as FakeJournal
    );
    expect(creditOn(j, ACC.vatOut)).toBe(1_100);
    const arLine = j.lines.find((l) => l.accountId === 103)!;
    expect(arLine.debit).toBe(11_100);
    expect(arLine.baseDebit).toBe(24_975_000); // 11.100 × 2.250
  });
});
