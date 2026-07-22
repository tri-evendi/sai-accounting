/**
 * Retur penjualan & pembelian (issue #27):
 *   • the pure over-return maths (`@/lib/returns`) — the acceptance criterion
 *     "tidak bisa meretur melebihi kuantitas/nilai dokumen asal";
 *   • the pure posting builders — the reversed legs, balanced, with proportional
 *     PPN and no VAT leg for a 0%/export return;
 *   • the posting engine end to end against the in-memory fake client — a sales
 *     return reduces AR + Penjualan + reverses PPN; a purchase return mirrors it;
 *     a foreign return inherits the origin's rate; a return into a closed period
 *     is refused.
 */
import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
  MAPPING_KEYS,
  postForSource,
  buildSalesReturnLines,
  buildPurchaseReturnLines,
  PostingRuleError,
} from "@/lib/posting";
import {
  returnableRemaining,
  isWithinReturnable,
  assertWithinReturnable,
  proportionalTax,
  stockDirectionForReturn,
  OverReturnError,
} from "@/lib/returns";
import { ClosedPeriodError } from "@/lib/period";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

const ACC = {
  arIdr: 101,
  arUsd: 102,
  sales: 201,
  vatOut: 202,
  vatIn: 203,
  ap: 204,
  inventory: 205,
};

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.arIdr, isActive: true },
  { key: MAPPING_KEYS.AR_DEFAULT, currency: "USD", accountId: ACC.arUsd, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.sales, isActive: true },
  { key: MAPPING_KEYS.VAT_OUT, currency: ANY_CURRENCY, accountId: ACC.vatOut, isActive: true },
  { key: MAPPING_KEYS.VAT_IN, currency: ANY_CURRENCY, accountId: ACC.vatIn, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ap, isActive: true },
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
];

const DATE = new Date("2026-03-15T00:00:00.000Z");

function expectBalancedIdr(journal: FakeJournal | null) {
  expect(journal).not.toBeNull();
  const debit = journal!.lines.reduce((s, l) => s + l.baseDebit, 0);
  const credit = journal!.lines.reduce((s, l) => s + l.baseCredit, 0);
  expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
  expect(debit).toBeGreaterThan(0);
  return journal!;
}

const debitOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);
const creditOn = (j: FakeJournal, accountId: number) =>
  j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.credit, 0);

// ─── Pure over-return maths ──────────────────────────────

describe("over-return maths (@/lib/returns)", () => {
  it("remaining = origin − already returned, clamped at zero", () => {
    expect(returnableRemaining(10, 3)).toBeCloseTo(7);
    expect(returnableRemaining(10, 10)).toBe(0);
    expect(returnableRemaining(10, 10.0000001)).toBe(0); // float noise, not a return
  });

  it("admits a return up to the remaining, rejects one past it", () => {
    expect(isWithinReturnable(10, 3, 7)).toBe(true);
    expect(isWithinReturnable(10, 3, 7.5)).toBe(false);
    // Money grain: a whole-cent overshoot is rejected, sub-cent noise admitted.
    expect(isWithinReturnable(100, 0, 100.004, 2)).toBe(true);
    expect(isWithinReturnable(100, 0, 100.01, 2)).toBe(false);
  });

  it("assertWithinReturnable throws OverReturnError past the cap (acceptance criterion)", () => {
    expect(() =>
      assertWithinReturnable({ label: "Kopi", origin: 10, alreadyReturned: 6, requested: 5 })
    ).toThrow(OverReturnError);
    // 10 − 6 = 4 remaining; returning 4 is fine.
    expect(() =>
      assertWithinReturnable({ label: "Kopi", origin: 10, alreadyReturned: 6, requested: 4 })
    ).not.toThrow();
  });

  it("assertWithinReturnable rejects a non-positive quantity", () => {
    expect(() =>
      assertWithinReturnable({ label: "Kopi", origin: 10, alreadyReturned: 0, requested: 0 })
    ).toThrow(OverReturnError);
  });

  it("proportionalTax reverses PPN in proportion to the returned value", () => {
    // Purchase net 10,000,000 with PPN 1,100,000 (11%). Return 2,500,000 net.
    expect(proportionalTax(2_500_000, 10_000_000, 1_100_000)).toBeCloseTo(275_000);
    // An untaxed origin reverses no PPN — no VAT leg.
    expect(proportionalTax(2_500_000, 10_000_000, 0)).toBe(0);
  });

  it("stock moves the correct direction per return kind", () => {
    expect(stockDirectionForReturn("sales")).toBe("in");
    expect(stockDirectionForReturn("purchase")).toBe("out");
  });
});

// ─── Pure posting builders ───────────────────────────────

describe("buildSalesReturnLines / buildPurchaseReturnLines", () => {
  it("sales return reverses the invoice: D Penjualan + D PPN, K Piutang", () => {
    const lines = buildSalesReturnLines({
      arAccountId: ACC.arIdr,
      salesAccountId: ACC.sales,
      vatOutAccountId: ACC.vatOut,
      subtotal: 10_000_000,
      taxAmount: 1_100_000,
      currency: "IDR",
      rate: 1,
    });
    const d = (id: number) => lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.debit ?? 0), 0);
    const c = (id: number) => lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(d(ACC.sales)).toBe(10_000_000);
    expect(d(ACC.vatOut)).toBe(1_100_000);
    expect(c(ACC.arIdr)).toBe(11_100_000);
  });

  it("a 0%/export sales return emits no VAT leg", () => {
    const lines = buildSalesReturnLines({
      arAccountId: ACC.arUsd,
      salesAccountId: ACC.sales,
      subtotal: 10_000,
      taxAmount: 0,
      currency: "USD",
      rate: 16_000,
    });
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.accountId === ACC.vatOut)).toBe(false);
  });

  it("purchase return mirrors the purchase: D Hutang, K Persediaan + K PPN Masukan", () => {
    const lines = buildPurchaseReturnLines({
      apAccountId: ACC.ap,
      inventoryAccountId: ACC.inventory,
      vatInAccountId: ACC.vatIn,
      subtotal: 5_000_000,
      taxAmount: 550_000,
      currency: "IDR",
      rate: 1,
    });
    const d = (id: number) => lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.debit ?? 0), 0);
    const c = (id: number) => lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(d(ACC.ap)).toBe(5_550_000);
    expect(c(ACC.inventory)).toBe(5_000_000);
    expect(c(ACC.vatIn)).toBe(550_000);
  });

  it("refuses a zero-value return", () => {
    expect(() =>
      buildSalesReturnLines({
        arAccountId: ACC.arIdr,
        salesAccountId: ACC.sales,
        subtotal: 0,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

// ─── Posting engine end to end ───────────────────────────

describe("postForSource — retur penjualan", () => {
  it("a taxable sales return reduces AR + Penjualan and reverses proportional PPN, balanced", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      salesReturns: {
        1: {
          id: 1,
          returnNo: "RSJ.2026.03.00001",
          date: DATE,
          status: "posted",
          currency: "IDR",
          rate: null,
          subtotal: 10_000_000,
          taxAmount: 1_100_000,
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "sales_return", sourceId: 1, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.sales)).toBe(10_000_000);
    expect(debitOn(j, ACC.vatOut)).toBe(1_100_000);
    expect(creditOn(j, ACC.arIdr)).toBe(11_100_000);
    expect(j.sourceType).toBe("sales_return");
    expect(j.type).toBe("sales_return");
    expect(j.lines).toHaveLength(3);
  });

  it("a 0%/export (foreign) sales return has no VAT leg and inherits the invoice rate", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      salesReturns: {
        2: {
          id: 2,
          returnNo: "RSJ.2026.03.00002",
          date: DATE,
          status: "posted",
          currency: "USD",
          rate: 16_000,
          subtotal: 10_000,
          taxAmount: 0,
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "sales_return", sourceId: 2, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.sales)).toBe(10_000);
    expect(creditOn(j, ACC.arUsd)).toBe(10_000);
    expect(j.lines.some((l) => l.accountId === ACC.vatOut)).toBe(false);
    // Valued at the invoice's own rate — USD 10,000 × 16,000 = IDR 160,000,000.
    const arLine = j.lines.find((l) => l.accountId === ACC.arUsd)!;
    expect(arLine.rate).toBe(16_000);
    expect(arLine.baseCredit).toBe(160_000_000);
  });

  it("a canceled sales return posts nothing", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      salesReturns: {
        3: { id: 3, returnNo: "RSJ.2026.03.00003", date: DATE, status: "canceled", currency: "IDR", subtotal: 1_000 },
      },
    });
    const j = await postForSource({ sourceType: "sales_return", sourceId: 3, tx });
    expect(j).toBeNull();
    expect(tx._journals).toHaveLength(0);
  });
});

describe("postForSource — retur pembelian", () => {
  it("a taxable purchase return reduces Utang + Persediaan and reverses PPN Masukan, balanced", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      purchaseReturns: {
        1: {
          id: 1,
          returnNo: "RSB.2026.03.00001",
          date: DATE,
          status: "posted",
          currency: "IDR",
          rate: null,
          subtotal: 5_000_000,
          taxAmount: 550_000,
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "purchase_return",
        sourceId: 1,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.ap)).toBe(5_550_000);
    expect(creditOn(j, ACC.inventory)).toBe(5_000_000);
    expect(creditOn(j, ACC.vatIn)).toBe(550_000);
    expect(j.type).toBe("purchase_return");
  });

  it("an untaxed purchase return has no VAT leg", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      purchaseReturns: {
        2: {
          id: 2,
          returnNo: "RSB.2026.03.00002",
          date: DATE,
          status: "posted",
          currency: "IDR",
          subtotal: 3_000_000,
          taxAmount: 0,
        },
      },
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "purchase_return",
        sourceId: 2,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.ap)).toBe(3_000_000);
    expect(creditOn(j, ACC.inventory)).toBe(3_000_000);
    expect(j.lines).toHaveLength(2);
  });
});

describe("period lock applies to returns (issue #13)", () => {
  it("refuses a return posting into a closed month", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      periods: [{ year: 2026, month: 3, status: "closed" }],
      salesReturns: {
        9: {
          id: 9,
          returnNo: "RSJ.2026.03.00009",
          date: DATE,
          status: "posted",
          currency: "IDR",
          subtotal: 1_000_000,
          taxAmount: 0,
        },
      },
    });
    await expect(
      postForSource({ sourceType: "sales_return", sourceId: 9, tx })
    ).rejects.toThrow(ClosedPeriodError);
    expect(tx._journals).toHaveLength(0);
  });
});
