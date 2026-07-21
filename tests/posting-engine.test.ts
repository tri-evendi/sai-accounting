/**
 * The posting engine end to end, against an in-memory fake client:
 * account mapping resolution, per-source-type journals, the IDR balance
 * invariant, and idempotency / repost / unpost.
 */
import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
  DEFAULT_MAPPINGS,
  MAPPING_KEYS,
  MissingMappingError,
  cashKeyForType,
  postForSource,
  repostForSource,
  resolveAccountId,
  resolveAccountIds,
  unpostForSource,
  weightedAverageUnitCost,
  costOfMovement,
  PostingRuleError,
  MissingSettlementRateError,
} from "@/lib/posting";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

// Account ids as they might exist after seeding the COA.
const ACC = {
  arIdr: 101,
  arUsd: 102,
  arCny: 103,
  sales: 201,
  vatOut: 202,
  vatIn: 203,
  ap: 204,
  inventory: 205,
  cogs: 206,
  cashDefault: 301,
  cashBankUsd: 302,
  counter: 999,
};

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.arIdr, isActive: true },
  { key: MAPPING_KEYS.AR_DEFAULT, currency: "USD", accountId: ACC.arUsd, isActive: true },
  { key: MAPPING_KEYS.AR_DEFAULT, currency: "CNY", accountId: ACC.arCny, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.sales, isActive: true },
  { key: MAPPING_KEYS.VAT_OUT, currency: ANY_CURRENCY, accountId: ACC.vatOut, isActive: true },
  { key: MAPPING_KEYS.VAT_IN, currency: ANY_CURRENCY, accountId: ACC.vatIn, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ap, isActive: true },
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
  { key: MAPPING_KEYS.COGS, currency: ANY_CURRENCY, accountId: ACC.cogs, isActive: true },
  {
    key: MAPPING_KEYS.CASH_DEFAULT,
    currency: ANY_CURRENCY,
    accountId: ACC.cashDefault,
    isActive: true,
  },
  { key: MAPPING_KEYS.CASH_BANK, currency: ANY_CURRENCY, accountId: ACC.cashDefault, isActive: true },
  { key: MAPPING_KEYS.CASH_BANK, currency: "USD", accountId: ACC.cashBankUsd, isActive: true },
];

const DATE = new Date("2026-03-15T00:00:00.000Z");

/** Assert the journal balances on IDR base — the invariant the ledger enforces. */
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

// ─── Mapping resolution ──────────────────────────────────

describe("account mapping resolution", () => {
  const tx = createFakeClient({ mappings: MAPPINGS });

  it("falls back to the 'any' mapping when no currency override exists", async () => {
    await expect(resolveAccountId(MAPPING_KEYS.AR_DEFAULT, "IDR", tx)).resolves.toBe(ACC.arIdr);
    await expect(resolveAccountId(MAPPING_KEYS.SALES_DEFAULT, "CNY", tx)).resolves.toBe(ACC.sales);
  });

  it("prefers a currency-specific override (AR in CNY → 110203)", async () => {
    await expect(resolveAccountId(MAPPING_KEYS.AR_DEFAULT, "CNY", tx)).resolves.toBe(ACC.arCny);
    await expect(resolveAccountId(MAPPING_KEYS.AR_DEFAULT, "USD", tx)).resolves.toBe(ACC.arUsd);
  });

  it("resolves several keys at once", async () => {
    const acc = await resolveAccountIds(
      [MAPPING_KEYS.AR_DEFAULT, MAPPING_KEYS.SALES_DEFAULT],
      "USD",
      tx
    );
    expect(acc[MAPPING_KEYS.AR_DEFAULT]).toBe(ACC.arUsd);
    expect(acc[MAPPING_KEYS.SALES_DEFAULT]).toBe(ACC.sales);
  });

  it("fails loudly, in Indonesian, when a mapping is missing", async () => {
    const bare = createFakeClient({ mappings: [] });
    await expect(resolveAccountId(MAPPING_KEYS.COGS, "IDR", bare)).rejects.toThrow(
      MissingMappingError
    );
    await expect(resolveAccountId(MAPPING_KEYS.COGS, "IDR", bare)).rejects.toThrow(
      /Pemetaan akun .* belum diatur/
    );
  });

  it("ignores inactive mappings", async () => {
    const inactive = createFakeClient({
      mappings: [
        { key: MAPPING_KEYS.COGS, currency: ANY_CURRENCY, accountId: 1, isActive: false },
      ],
    });
    await expect(resolveAccountId(MAPPING_KEYS.COGS, "IDR", inactive)).rejects.toThrow(
      MissingMappingError
    );
  });

  it("maps CashAccount.type to the right cash slot", () => {
    expect(cashKeyForType("bank")).toBe(MAPPING_KEYS.CASH_BANK);
    expect(cashKeyForType("kas_besar")).toBe(MAPPING_KEYS.CASH_KAS_BESAR);
    expect(cashKeyForType("kas_kecil")).toBe(MAPPING_KEYS.CASH_KAS_KECIL);
    expect(cashKeyForType("something_else")).toBe(MAPPING_KEYS.CASH_DEFAULT);
  });
});

// ─── Per source type ─────────────────────────────────────

describe("postForSource per transaction type", () => {
  it("invoice → D: Piutang Usaha, K: Penjualan", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        7: {
          id: 7,
          invoiceNo: "SI.2026.03.00007",
          date: DATE,
          status: "pending",
          items: [
            { quantity: 10, price: 150_000 },
            { quantity: 2, price: 250_000 },
          ],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 7, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.arIdr)).toBe(2_000_000);
    expect(creditOn(j, ACC.sales)).toBe(2_000_000);
    expect(j.sourceType).toBe("invoice");
    expect(j.type).toBe("sales");
  });

  // ── Issue #35: invoices carry their own currency, rate and PPN ──

  it("invoice in USD uses the USD receivable account and the invoice's own rate", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        21: {
          id: 21,
          invoiceNo: "SI.2026.03.00021",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: 16_250,
          taxAmount: 0,
          items: [{ quantity: 4, price: 2_500 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 21, tx })) as unknown as FakeJournal
    );

    // USD 10,000 at 16,250 → IDR 162,500,000. Emphatically not 10,000.
    expect(debitOn(j, ACC.arUsd)).toBe(10_000);
    expect(debitOn(j, ACC.arIdr)).toBe(0);
    expect(creditOn(j, ACC.sales)).toBe(10_000);
    expect(j.lines[0].currency).toBe("USD");
    expect(j.lines[0].rate).toBe(16_250);
    expect(j.lines[0].baseDebit).toBe(162_500_000);
  });

  it("a taxed invoice credits Hutang PPN Keluaran and still balances", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        22: {
          id: 22,
          invoiceNo: "SI.2026.03.00022",
          date: DATE,
          status: "pending",
          currency: "IDR",
          rate: null,
          taxAmount: 1_100_000,
          items: [{ quantity: 1, price: 10_000_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 22, tx })) as unknown as FakeJournal
    );

    // AR carries the gross; sales stays net; the 11% PPN sits in its own account.
    expect(debitOn(j, ACC.arIdr)).toBe(11_100_000);
    expect(creditOn(j, ACC.sales)).toBe(10_000_000);
    expect(creditOn(j, ACC.vatOut)).toBe(1_100_000);
    expect(j.lines).toHaveLength(3);
  });

  it("a taxed foreign invoice values AR, sales and PPN at the same rate", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        23: {
          id: 23,
          invoiceNo: "SI.2026.03.00023",
          date: DATE,
          status: "pending",
          currency: "CNY",
          rate: 2_250,
          taxAmount: 1_100,
          items: [{ quantity: 100, price: 100 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 23, tx })) as unknown as FakeJournal
    );

    expect(debitOn(j, ACC.arCny)).toBe(11_100);
    expect(creditOn(j, ACC.sales)).toBe(10_000);
    expect(creditOn(j, ACC.vatOut)).toBe(1_100);
    // CNY 11,100 × 2,250 = IDR 24,975,000 on the receivable.
    const arLine = j.lines.find((l) => l.accountId === ACC.arCny)!;
    expect(arLine.baseDebit).toBe(24_975_000);
  });

  it("refuses a foreign-currency invoice with no rate rather than booking it 1:1", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        24: {
          id: 24,
          invoiceNo: "SI.2026.03.00024",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: null,
          taxAmount: 0,
          items: [{ quantity: 1, price: 5_000 }],
        },
      },
    });

    await expect(postForSource({ sourceType: "invoice", sourceId: 24, tx })).rejects.toThrow(
      PostingRuleError
    );
    expect(tx._journals).toHaveLength(0);
  });

  it("an explicit posting rate covers an invoice whose own rate is missing", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        25: {
          id: 25,
          invoiceNo: "SI.2026.03.00025",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: null,
          taxAmount: 0,
          items: [{ quantity: 1, price: 5_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice",
        sourceId: 25,
        tx,
        rate: 16_000,
      })) as unknown as FakeJournal
    );
    expect(j.lines[0].baseDebit).toBe(80_000_000);
  });

  it("treats a legacy invoice with no currency as IDR, exactly as before", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        26: {
          id: 26,
          invoiceNo: "SI.2024.01.00026",
          date: DATE,
          status: "pending",
          // No currency / rate / taxAmount — a row written before migration 0005.
          items: [{ quantity: 1, price: 750_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "invoice", sourceId: 26, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.arIdr)).toBe(750_000);
    expect(creditOn(j, ACC.sales)).toBe(750_000);
    expect(j.lines[0].rate).toBe(1);
    expect(j.lines).toHaveLength(2);
  });

  it("contract in CNY uses the CNY receivable account and an explicit rate", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        3: {
          id: 3,
          contractNo: "SC.2026.03.00003",
          date: DATE,
          status: "pending",
          currency: "CNY",
          items: [{ bags: 100, kgPerBag: 25, pricePerKg: 20 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "contract",
        sourceId: 3,
        tx,
        rate: 2_250,
      })) as unknown as FakeJournal
    );

    // 100 bags × 25 kg × CNY 20 = CNY 50,000 → IDR 112,500,000
    expect(debitOn(j, ACC.arCny)).toBe(50_000);
    expect(j.lines[0].baseDebit).toBe(112_500_000);
    expect(j.lines[0].currency).toBe("CNY");
  });

  it("contract in USD posts from its own stored rate — no ctx.rate needed", async () => {
    // Issue #36: the rate lives on the contract (migration 0008), so nothing has
    // to be handed in at post time. A USD contract must also land in the USD
    // receivable, not the IDR one.
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        31: {
          id: 31,
          contractNo: "SC.2026.03.00031",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: 16_250,
          baseAmount: 812_500_000,
          items: [{ bags: 100, kgPerBag: 25, pricePerKg: 20 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "contract", sourceId: 31, tx })) as unknown as FakeJournal
    );

    // 100 bags × 25 kg × USD 20 = USD 50,000 → IDR 812,500,000 at 16,250.
    expect(debitOn(j, ACC.arUsd)).toBe(50_000);
    expect(debitOn(j, ACC.arIdr)).toBe(0);
    expect(j.lines[0].currency).toBe("USD");
    expect(j.lines[0].rate).toBe(16_250);
    expect(j.lines[0].baseDebit).toBe(812_500_000);
    expect(creditOn(j, ACC.sales)).toBe(50_000);
  });

  it("stored contract rate wins over a ctx.rate handed in", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        32: {
          id: 32,
          contractNo: "SC.2026.03.00032",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: 16_000,
          items: [{ bags: 1, kgPerBag: 1, pricePerKg: 1_000 }],
        },
      },
    });

    const j = (await postForSource({
      sourceType: "contract",
      sourceId: 32,
      tx,
      rate: 9_999,
    })) as unknown as FakeJournal;
    expect(j.lines[0].rate).toBe(16_000);
    expect(j.lines[0].baseDebit).toBe(16_000_000);
  });

  it("reposting a rated contract recovers the rate without being given one", async () => {
    // The gap #36 closes: before, an edit had to re-enter the rate because a
    // repost had nowhere to read it from.
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        33: {
          id: 33,
          contractNo: "SC.2026.03.00033",
          date: DATE,
          status: "pending",
          currency: "USD",
          rate: 15_500,
          items: [{ bags: 2, kgPerBag: 10, pricePerKg: 50 }],
        },
      },
    });

    await postForSource({ sourceType: "contract", sourceId: 33, tx });
    const reposted = expectBalancedIdr(
      (await repostForSource({
        sourceType: "contract",
        sourceId: 33,
        tx,
      })) as unknown as FakeJournal
    );

    expect(reposted.lines[0].rate).toBe(15_500);
    expect(reposted.lines[0].baseDebit).toBe(15_500_000);
    // Original journal reversed, not mutated: original + reversal + fresh.
    expect(tx._journals).toHaveLength(3);
  });

  it("an IDR contract needs no rate at all", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        34: {
          id: 34,
          contractNo: "SC.2026.03.00034",
          date: DATE,
          status: "pending",
          currency: "IDR",
          rate: null,
          items: [{ bags: 10, kgPerBag: 25, pricePerKg: 4_000 }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({ sourceType: "contract", sourceId: 34, tx })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.arIdr)).toBe(1_000_000);
    expect(j.lines[0].rate).toBe(1);
  });

  it("refuses a foreign-currency contract with no rate anywhere", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contracts: {
        4: {
          id: 4,
          contractNo: "SC.2026.03.00004",
          date: DATE,
          status: "pending",
          currency: "USD",
          items: [{ bags: 10, kgPerBag: 25, pricePerKg: 2 }],
        },
      },
    });

    await expect(postForSource({ sourceType: "contract", sourceId: 4, tx })).rejects.toThrow(
      PostingRuleError
    );
    expect(tx._journals).toHaveLength(0);
  });

  it("invoice_payment → D: Kas/Bank, K: Piutang Usaha", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoicePayments: {
        11: {
          id: 11,
          date: DATE,
          amount: 1_000,
          currency: "USD",
          rate: 16_000,
          // The invoice's currency and rate are stated explicitly (issue #43):
          // which receivable a payment relieves is now decided by the DOCUMENT,
          // so a fixture that leaves them off would silently be testing an IDR
          // invoice paid in dollars — a different scenario, covered below.
          invoice: { invoiceNo: "SI.2026.03.00007", currency: "USD", rate: 16_000 },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice_payment",
        sourceId: 11,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.cashDefault)).toBe(1_000);
    expect(creditOn(j, ACC.arUsd)).toBe(1_000);
    // The record's own rate is used, not a guess.
    expect(j.lines[0].baseDebit).toBe(16_000_000);
  });

  it("contract_payment → D: Kas/Bank, K: Piutang Usaha", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      contractPayments: {
        21: {
          id: 21,
          date: DATE,
          amount: 5_000_000,
          currency: "IDR",
          rate: null,
          contract: { contractNo: "SC.2026.03.00003" },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "contract_payment",
        sourceId: 21,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.cashDefault)).toBe(5_000_000);
    expect(creditOn(j, ACC.arIdr)).toBe(5_000_000);
  });

  it("supplier_transaction purchase → D: Persediaan + PPN Masukan, K: Hutang Usaha", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      supplierTransactions: {
        31: {
          id: 31,
          date: DATE,
          type: "purchase",
          amount: 10_000_000,
          taxAmount: 1_100_000,
          currency: "IDR",
          rate: null,
          supplier: { name: "PT Sumber Tani" },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 31,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.inventory)).toBe(10_000_000);
    expect(debitOn(j, ACC.vatIn)).toBe(1_100_000);
    expect(creditOn(j, ACC.ap)).toBe(11_100_000);
  });

  it("supplier_transaction payment → D: Hutang Usaha, K: Kas/Bank", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      supplierTransactions: {
        32: {
          id: 32,
          date: DATE,
          type: "payment",
          amount: 4_000_000,
          taxAmount: 0,
          currency: "IDR",
          rate: null,
          supplier: { name: "PT Sumber Tani" },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 32,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.ap)).toBe(4_000_000);
    expect(creditOn(j, ACC.cashDefault)).toBe(4_000_000);
  });

  it("rejects an unknown supplier transaction type instead of guessing", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      supplierTransactions: {
        33: {
          id: 33,
          date: DATE,
          type: "mystery",
          amount: 1_000,
          taxAmount: 0,
          currency: "IDR",
          rate: null,
          supplier: { name: "X" },
        },
      },
    });

    await expect(
      postForSource({ sourceType: "supplier_transaction", sourceId: 33, tx })
    ).rejects.toThrow(PostingRuleError);
  });

  it("cash_account debit → D: Kas/Bank, K: counter-account", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      cashAccounts: {
        41: {
          id: 41,
          type: "bank",
          date: DATE,
          description: "Setoran modal",
          currency: "IDR",
          rate: null,
          debit: 25_000_000,
          credit: 0,
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "cash_account",
        sourceId: 41,
        tx,
        counterAccountId: ACC.counter,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.cashDefault)).toBe(25_000_000);
    expect(creditOn(j, ACC.counter)).toBe(25_000_000);
  });

  it("cash_account credit in USD uses the USD bank account", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      cashAccounts: {
        42: {
          id: 42,
          type: "bank",
          date: DATE,
          description: "Biaya bank",
          currency: "USD",
          rate: 16_100,
          debit: 0,
          credit: 100,
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "cash_account",
        sourceId: 42,
        tx,
        counterAccountId: ACC.counter,
      })) as unknown as FakeJournal
    );
    expect(creditOn(j, ACC.cashBankUsd)).toBe(100);
    expect(debitOn(j, ACC.counter)).toBe(100);
    expect(j.lines[0].baseDebit).toBe(1_610_000);
  });

  it("requires a counter-account for cash postings", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      cashAccounts: {
        43: {
          id: 43,
          type: "bank",
          date: DATE,
          description: "x",
          currency: "IDR",
          rate: null,
          debit: 100,
          credit: 0,
        },
      },
    });

    await expect(postForSource({ sourceType: "cash_account", sourceId: 43, tx })).rejects.toThrow(
      /counterAccountId/
    );
  });

  it("stock_movement out → D: HPP, K: Persediaan at weighted-average cost", async () => {
    // 100 @ 10,000 + 100 @ 12,000 → average 11,000; 50 out → 550,000
    const tx = createFakeClient({
      mappings: MAPPINGS,
      stocks: {
        51: {
          id: 51,
          itemId: 9,
          quantity: 50,
          type: "out",
          date: DATE,
          item: { name: "Kopi Arabika" },
        },
      },
      stockMovements: [
        { itemId: 9, type: "in", quantity: 100, unitCost: 10_000, date: new Date("2026-01-01") },
        { itemId: 9, type: "in", quantity: 100, unitCost: 12_000, date: new Date("2026-02-01") },
      ],
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "stock_movement",
        sourceId: 51,
        tx,
      })) as unknown as FakeJournal
    );
    expect(debitOn(j, ACC.cogs)).toBe(550_000);
    expect(creditOn(j, ACC.inventory)).toBe(550_000);
  });

  it("does not post incoming stock (capitalised by the purchase instead)", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      stocks: {
        52: { id: 52, itemId: 9, quantity: 100, type: "in", date: DATE, item: { name: "Kopi" } },
      },
      stockMovements: [],
    });

    await expect(postForSource({ sourceType: "stock_movement", sourceId: 52, tx })).resolves.toBeNull();
    expect(tx._journals).toHaveLength(0);
  });

  it("skips an outgoing movement with no costed purchase history", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      stocks: {
        53: { id: 53, itemId: 9, quantity: 10, type: "out", date: DATE, item: { name: "Kopi" } },
      },
      stockMovements: [
        { itemId: 9, type: "in", quantity: 100, unitCost: null, date: new Date("2026-01-01") },
      ],
    });

    await expect(postForSource({ sourceType: "stock_movement", sourceId: 53, tx })).resolves.toBeNull();
  });

  it("does not post a cancelled invoice", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        8: {
          id: 8,
          invoiceNo: "SI.2026.03.00008",
          date: DATE,
          status: "canceled",
          items: [{ quantity: 1, price: 100 }],
        },
      },
    });

    await expect(postForSource({ sourceType: "invoice", sourceId: 8, tx })).resolves.toBeNull();
  });
});

// ─── Idempotency / repost / unpost ───────────────────────

function invoiceClient() {
  return createFakeClient({
    mappings: MAPPINGS,
    invoices: {
      7: {
        id: 7,
        invoiceNo: "SI.2026.03.00007",
        date: DATE,
        status: "pending",
        items: [{ quantity: 10, price: 100_000 }],
      },
    },
  });
}

describe("idempotency, repost and unpost", () => {
  it("never double-posts the same source", async () => {
    const tx = invoiceClient();
    const first = await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    const second = await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    const third = await postForSource({ sourceType: "invoice", sourceId: 7, tx });

    expect(first!.id).toBe(second!.id);
    expect(second!.id).toBe(third!.id);
    expect(tx._journals).toHaveLength(1);
  });

  it("repost reverses the old journal and posts a fresh one", async () => {
    const tx = invoiceClient();
    const original = await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    const reposted = await repostForSource({ sourceType: "invoice", sourceId: 7, tx });

    // original + reversal + new = 3 journals; the original is never edited or deleted.
    expect(tx._journals).toHaveLength(3);
    expect(reposted!.id).not.toBe(original!.id);

    const stored = tx._journals.find((j) => j.id === original!.id)!;
    expect(stored.isReversed).toBe(true);
    expect(stored.lines).toHaveLength(2); // untouched

    const reversal = tx._journals.find((j) => j.type === "reversal")!;
    expect(reversal.reversalOfId).toBe(original!.id);
    // The reversal mirrors the original, so the two net to zero.
    expect(reversal.lines[0].baseCredit).toBe(stored.lines[0].baseDebit);
    expectBalancedIdr(reversal);
  });

  it("the whole set nets to zero after reposting", async () => {
    const tx = invoiceClient();
    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    await repostForSource({ sourceType: "invoice", sourceId: 7, tx });

    const byAccount = new Map<number, number>();
    for (const j of tx._journals) {
      for (const l of j.lines) {
        byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + l.baseDebit - l.baseCredit);
      }
    }
    // Original + reversal cancel; the fresh journal is the only net effect.
    expect(byAccount.get(ACC.arIdr)).toBe(1_000_000);
    expect(byAccount.get(ACC.sales)).toBe(-1_000_000);
  });

  it("unpost reverses without reposting", async () => {
    const tx = invoiceClient();
    const original = await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    await unpostForSource({ sourceType: "invoice", sourceId: 7, tx });

    expect(tx._journals).toHaveLength(2);
    expect(tx._journals.find((j) => j.id === original!.id)!.isReversed).toBe(true);

    // Ledger effect is now nil.
    const net = tx._journals.flatMap((j) => j.lines).reduce((s, l) => s + l.baseDebit - l.baseCredit, 0);
    expect(net).toBe(0);
  });

  it("unpost is a no-op when nothing is posted", async () => {
    const tx = invoiceClient();
    await expect(unpostForSource({ sourceType: "invoice", sourceId: 7, tx })).resolves.toBeUndefined();
    expect(tx._journals).toHaveLength(0);
  });

  it("posts again after an unpost (reversed journals are not 'live')", async () => {
    const tx = invoiceClient();
    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    await unpostForSource({ sourceType: "invoice", sourceId: 7, tx });
    const reposted = await postForSource({ sourceType: "invoice", sourceId: 7, tx });

    expect(reposted).not.toBeNull();
    expect(tx._journals).toHaveLength(3);
  });
});

// ─── Weighted-average costing ────────────────────────────

describe("weighted-average COGS costing", () => {
  it("averages costed incoming movements", () => {
    expect(
      weightedAverageUnitCost([
        { type: "in", quantity: 100, unitCost: 10_000 },
        { type: "in", quantity: 100, unitCost: 12_000 },
      ])
    ).toBe(11_000);
  });

  it("weights by quantity, not by number of purchases", () => {
    expect(
      weightedAverageUnitCost([
        { type: "in", quantity: 900, unitCost: 10_000 },
        { type: "in", quantity: 100, unitCost: 20_000 },
      ])
    ).toBe(11_000);
  });

  it("ignores outgoing movements", () => {
    expect(
      weightedAverageUnitCost([
        { type: "in", quantity: 100, unitCost: 10_000 },
        { type: "out", quantity: 50, unitCost: 99_999 },
      ])
    ).toBe(10_000);
  });

  it("excludes uncosted rows rather than averaging in a fake zero", () => {
    expect(
      weightedAverageUnitCost([
        { type: "in", quantity: 100, unitCost: 10_000 },
        { type: "in", quantity: 100, unitCost: null },
      ])
    ).toBe(10_000);
  });

  it("returns 0 when there is nothing to cost", () => {
    expect(weightedAverageUnitCost([])).toBe(0);
    expect(weightedAverageUnitCost([{ type: "in", quantity: 100, unitCost: null }])).toBe(0);
  });

  it("handles Prisma Decimal-like values", () => {
    expect(
      weightedAverageUnitCost([{ type: "in", quantity: "100.000", unitCost: "10000.00" }])
    ).toBe(10_000);
  });

  it("costs an outgoing movement at the average", () => {
    expect(costOfMovement(50, 11_000)).toBe(550_000);
    expect(costOfMovement(-50, 11_000)).toBe(550_000);
  });
});

// ─── Selisih kurs / realized FX end to end (issue #23) ───

/**
 * The engine reading two rates off two records: the invoice's booked rate and
 * the payment's settlement rate. These also pin down when it deliberately
 * DECLINES to compute a difference rather than invent one.
 */
describe("selisih kurs — realized FX through the posting engine", () => {
  const FX_ACC = 401;
  const FX_MAPPINGS: FakeMapping[] = [
    ...MAPPINGS,
    { key: MAPPING_KEYS.FX_GAIN_LOSS, currency: ANY_CURRENCY, accountId: FX_ACC, isActive: true },
  ];

  const baseDebitOn = (j: FakeJournal, accountId: number) =>
    j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.baseDebit, 0);
  const baseCreditOn = (j: FakeJournal, accountId: number) =>
    j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.baseCredit, 0);

  const usdPayment = (over: Record<string, unknown> = {}) => ({
    id: 12,
    date: DATE,
    amount: 10_000,
    currency: "USD",
    rate: 16_000,
    invoice: { invoiceNo: "SI.2026.03.00012", currency: "USD", rate: 15_000 },
    ...over,
  });

  const post = async (seed: Parameters<typeof createFakeClient>[0], id = 12) => {
    const tx = createFakeClient(seed);
    return expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice_payment",
        sourceId: id,
        tx,
      })) as unknown as FakeJournal
    );
  };

  /** The worked example from issue #23, end to end. */
  it("USD 10.000 invoiced at 15.000 and collected at 16.000 books a 10.000.000 gain", async () => {
    const j = await post({ mappings: FX_MAPPINGS, invoicePayments: { 12: usdPayment() } });

    expect(baseDebitOn(j, ACC.cashDefault)).toBe(160_000_000);
    expect(baseCreditOn(j, ACC.arUsd)).toBe(150_000_000);
    expect(baseCreditOn(j, FX_ACC)).toBe(10_000_000);
    // The receivable is still relieved for its full 10.000 USD of face value.
    expect(creditOn(j, ACC.arUsd)).toBe(10_000);
  });

  it("collecting at a lower rate books a loss", async () => {
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: { 12: usdPayment({ rate: 14_000 }) },
    });

    expect(baseDebitOn(j, ACC.cashDefault)).toBe(140_000_000);
    expect(baseCreditOn(j, ACC.arUsd)).toBe(150_000_000);
    expect(baseDebitOn(j, FX_ACC)).toBe(10_000_000);
  });

  it("a partial payment books FX on the instalment only", async () => {
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: { 12: usdPayment({ amount: 2_500 }) },
    });

    expect(baseDebitOn(j, ACC.cashDefault)).toBe(40_000_000);
    expect(baseCreditOn(j, ACC.arUsd)).toBe(37_500_000);
    expect(baseCreditOn(j, FX_ACC)).toBe(2_500_000);
  });

  it("emits no FX line when the payment is at the invoice's own rate", async () => {
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: { 12: usdPayment({ rate: 15_000 }) },
    });

    expect(j.lines).toHaveLength(2);
    expect(baseCreditOn(j, FX_ACC)).toBe(0);
  });

  it("emits no FX at all for an IDR invoice paid in IDR", async () => {
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: {
        12: usdPayment({
          amount: 5_000_000,
          currency: "IDR",
          rate: null,
          invoice: { invoiceNo: "SI.2026.03.00013", currency: "IDR", rate: null },
        }),
      },
    });

    expect(j.lines).toHaveLength(2);
    expect(j.lines.some((l) => l.accountId === FX_ACC)).toBe(false);
    expect(baseDebitOn(j, ACC.cashDefault)).toBe(5_000_000);
  });

  it("declines to compute FX against a legacy invoice with no stored rate", async () => {
    // Its booked rate is unknown, so the difference from it is unknowable.
    // Guessing one is the 1:1 bug #35 exists to prevent — book it flat instead.
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: {
        12: usdPayment({ invoice: { invoiceNo: "SI.2019.01.00001", currency: "USD", rate: null } }),
      },
    });

    expect(j.lines).toHaveLength(2);
    expect(baseCreditOn(j, ACC.arUsd)).toBe(160_000_000);
  });

  // ── Cross-currency settlement (issue #43) ─────────────────────────────────
  //
  // UPDATED FROM: "declines to compute FX when the payment currency differs
  // from the invoice's". That test pinned the state of the world at #23 — an
  // IDR transfer against a USD invoice was booked flat and, because the account
  // came from the *payment's* currency, credited 110201 Piutang Usaha (IDR) for
  // a debt raised in 110202. It documented the gap rather than endorsing it,
  // and #43 closes the gap by recording the settlement-date rate that was
  // missing. The three tests below replace it.

  /** The worked example from issue #43. */
  const idrPaymentOnUsdInvoice = (over: Record<string, unknown> = {}) =>
    usdPayment({
      amount: 155_000_000,
      currency: "IDR",
      rate: null,
      invoice: { invoiceNo: "SI.2026.03.00014", currency: "USD", rate: 15_000 },
      ...over,
    });

  it("a USD invoice paid by IDR transfer relieves the USD receivable, not the IDR one", async () => {
    const j = await post({
      mappings: FX_MAPPINGS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      invoicePayments: { 12: idrPaymentOnUsdInvoice() },
    });

    // Rp 155.000.000 at the settlement date's 15.500 settles USD 10.000 …
    expect(creditOn(j, ACC.arUsd)).toBe(10_000);
    // … relieved at the rate the INVOICE was booked at, so the receivable gives
    // up exactly the rupiah it was raised for.
    expect(baseCreditOn(j, ACC.arUsd)).toBe(150_000_000);
    // 110201 is not touched. Before #43 it took the whole 155.000.000.
    expect(creditOn(j, ACC.arIdr)).toBe(0);
    expect(baseCreditOn(j, ACC.arIdr)).toBe(0);

    // Cash lands in the IDR account, because the money really was rupiah.
    expect(baseDebitOn(j, ACC.cashDefault)).toBe(155_000_000);
    // The 500/USD the rate moved between invoice and settlement is realized FX.
    expect(baseCreditOn(j, FX_ACC)).toBe(5_000_000);
  });

  it("refuses to post a cross-currency settlement with no settlement-date rate", async () => {
    // The acceptance criterion this issue turns on: silence is not an option,
    // and neither is a nearest/previous rate. Ask for the number.
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      invoicePayments: { 12: idrPaymentOnUsdInvoice() },
    });
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(MissingSettlementRateError);
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(/Kurs USD untuk tanggal pelunasan .* belum dicatat/);
    expect(tx._journals).toHaveLength(0);
  });

  it("will not read a rate from a neighbouring day", async () => {
    // Nearest / previous / interpolate are all the silent guess `resolveRate`
    // exists to refuse — the lookup matches one calendar day or fails.
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      exchangeRates: [
        { currency: "USD", rateDate: new Date("2026-03-14T00:00:00.000Z"), rate: 15_400 },
        { currency: "USD", rateDate: new Date("2026-03-16T00:00:00.000Z"), rate: 15_600 },
      ],
      invoicePayments: { 12: idrPaymentOnUsdInvoice() },
    });
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(MissingSettlementRateError);
    expect(tx._journals).toHaveLength(0);
  });

  it("refuses when the foreign document carries no rate of its own", async () => {
    // We could work out how many dollars the transfer covers, but not what
    // those dollars were booked at — so the rupiah leaving 110202 would be a
    // guess. Before #43 this quietly relieved the IDR receivable instead.
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      invoicePayments: {
        12: idrPaymentOnUsdInvoice({
          invoice: { invoiceNo: "SI.2019.01.00002", currency: "USD", rate: null },
        }),
      },
    });
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(PostingRuleError);
    expect(tx._journals).toHaveLength(0);
  });

  it("an IDR invoice paid in USD relieves the IDR receivable, with no FX", async () => {
    // The mirror case. The receivable is denominated in rupiah, so the dollars
    // simply convert into it at the settlement rate and nothing is left over.
    const j = await post({
      mappings: FX_MAPPINGS,
      invoicePayments: {
        12: usdPayment({
          amount: 10_000,
          currency: "USD",
          rate: 15_500,
          invoice: { invoiceNo: "SI.2026.03.00015", currency: "IDR", rate: null },
        }),
      },
    });

    expect(creditOn(j, ACC.arIdr)).toBe(155_000_000);
    expect(creditOn(j, ACC.arUsd)).toBe(0);
    expect(baseDebitOn(j, ACC.cashDefault)).toBe(155_000_000);
    expect(j.lines.some((l) => l.accountId === FX_ACC)).toBe(false);
  });

  it("keeps total AR unchanged in IDR base — only which account holds it moves", async () => {
    // Issue #40/#43 are both "the value is right, the account is wrong". This
    // pins the half that must NOT change: the rupiah coming off receivables is
    // the same 150.000.000 whether the customer pays in USD or in IDR.
    const inUsd = await post({
      mappings: FX_MAPPINGS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      invoicePayments: { 12: usdPayment({ rate: 15_500 }) },
    });
    const inIdr = await post({
      mappings: FX_MAPPINGS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      invoicePayments: { 12: idrPaymentOnUsdInvoice() },
    });

    const arBase = (j: FakeJournal) => baseCreditOn(j, ACC.arIdr) + baseCreditOn(j, ACC.arUsd);
    expect(arBase(inUsd)).toBe(150_000_000);
    expect(arBase(inIdr)).toBe(150_000_000);
    // Both relieve the USD receivable, and only it.
    expect(baseCreditOn(inUsd, ACC.arIdr)).toBe(0);
    expect(baseCreditOn(inIdr, ACC.arIdr)).toBe(0);
  });

  it("refuses to post a difference when fx_gain_loss is not mapped", async () => {
    const tx = createFakeClient({ mappings: MAPPINGS, invoicePayments: { 12: usdPayment() } });
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(MissingMappingError);
    expect(tx._journals).toHaveLength(0);
  });

  it("contract_payment gets the same treatment from the contract's rate", async () => {
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      contractPayments: {
        22: {
          id: 22,
          date: DATE,
          amount: 20_000,
          currency: "CNY",
          rate: 2_250,
          contract: { contractNo: "SC.2026.03.00009", currency: "CNY", rate: 2_200 },
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "contract_payment",
        sourceId: 22,
        tx,
      })) as unknown as FakeJournal
    );
    expect(baseDebitOn(j, ACC.cashDefault)).toBe(45_000_000);
    expect(baseCreditOn(j, ACC.arCny)).toBe(44_000_000);
    expect(baseCreditOn(j, FX_ACC)).toBe(1_000_000);
  });

  it("a supplier payment books FX per allocated purchase, at each purchase's rate", async () => {
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      supplierTransactions: {
        34: {
          id: 34,
          date: DATE,
          type: "payment",
          amount: 10_000,
          taxAmount: 0,
          currency: "USD",
          rate: 16_000,
          supplier: { name: "Jiangsu Trading" },
          allocationsMade: [
            { amount: 6_000, purchase: { currency: "USD", rate: 15_000 } },
            { amount: 4_000, purchase: { currency: "USD", rate: 16_500 } },
          ],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 34,
        tx,
      })) as unknown as FakeJournal
    );
    // 6.000×15.000 + 4.000×16.500 = 156.000.000 hutang vs 160.000.000 paid out.
    expect(baseDebitOn(j, ACC.ap)).toBe(156_000_000);
    expect(baseCreditOn(j, ACC.cashDefault)).toBe(160_000_000);
    expect(baseDebitOn(j, FX_ACC)).toBe(4_000_000); // net loss
  });

  it("an unallocated remainder clears hutang at the payment's own rate", async () => {
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      supplierTransactions: {
        35: {
          id: 35,
          date: DATE,
          type: "payment",
          amount: 10_000,
          taxAmount: 0,
          currency: "USD",
          rate: 16_000,
          supplier: { name: "Jiangsu Trading" },
          allocationsMade: [{ amount: 6_000, purchase: { currency: "USD", rate: 15_000 } }],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 35,
        tx,
      })) as unknown as FakeJournal
    );
    // Only the allocated 6.000 carries a difference; the rest is rate-neutral.
    expect(baseDebitOn(j, ACC.ap)).toBe(154_000_000);
    expect(baseDebitOn(j, FX_ACC)).toBe(6_000_000);
  });

  it("a supplier payment with no allocations posts flat, as before #23", async () => {
    const tx = createFakeClient({
      mappings: FX_MAPPINGS,
      supplierTransactions: {
        36: {
          id: 36,
          date: DATE,
          type: "payment",
          amount: 10_000,
          taxAmount: 0,
          currency: "USD",
          rate: 16_000,
          supplier: { name: "Jiangsu Trading" },
          allocationsMade: [],
        },
      },
    });

    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 36,
        tx,
      })) as unknown as FakeJournal
    );
    expect(j.lines).toHaveLength(2);
    expect(baseDebitOn(j, ACC.ap)).toBe(160_000_000);
  });
});

// ─── Per-currency cash accounts (issue #40) ──────────────

/**
 * `account_mappings` has been currency-aware since #9, but `cash_default` was
 * seeded with only an "any" row → 110102 Kas Besar, an IDR account. So a CNY
 * payment was booked into an IDR cash account: balanced in rupiah, but the CNY
 * cash balance stayed at zero while an IDR one absorbed foreign movements.
 * Same shape of defect as #43 — right value, wrong account.
 */
describe("cash account resolution per currency", () => {
  const CASH = { idr: 311, usd: 312, cny: 313 };

  /** What DEFAULT_MAPPINGS now seeds: one row per currency, and no fallback. */
  const CURRENCY_CASH: FakeMapping[] = [
    ...MAPPINGS.filter((m) => m.key !== MAPPING_KEYS.CASH_DEFAULT),
    { key: MAPPING_KEYS.CASH_DEFAULT, currency: "IDR", accountId: CASH.idr, isActive: true },
    { key: MAPPING_KEYS.CASH_DEFAULT, currency: "USD", accountId: CASH.usd, isActive: true },
    { key: MAPPING_KEYS.CASH_DEFAULT, currency: "CNY", accountId: CASH.cny, isActive: true },
  ];

  const paymentIn = (currency: string, amount: number, rate: number | null) => ({
    12: {
      id: 12,
      date: DATE,
      amount,
      currency,
      rate,
      invoice: { invoiceNo: "SI.2026.03.00021", currency, rate },
    },
  });

  it("a CNY payment lands in the CNY cash account, not Kas Besar", async () => {
    const tx = createFakeClient({
      mappings: CURRENCY_CASH,
      invoicePayments: paymentIn("CNY", 100_000, 2_200),
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice_payment",
        sourceId: 12,
        tx,
      })) as unknown as FakeJournal
    );

    expect(debitOn(j, CASH.cny)).toBe(100_000);
    expect(debitOn(j, CASH.idr)).toBe(0);
    // The value was never in question — only where it landed.
    expect(j.lines[0].baseDebit).toBe(220_000_000);
    expect(creditOn(j, ACC.arCny)).toBe(100_000);
  });

  it("a USD payment lands in the USD cash account", async () => {
    const tx = createFakeClient({
      mappings: CURRENCY_CASH,
      invoicePayments: paymentIn("USD", 10_000, 15_000),
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice_payment",
        sourceId: 12,
        tx,
      })) as unknown as FakeJournal
    );

    expect(debitOn(j, CASH.usd)).toBe(10_000);
    expect(debitOn(j, CASH.idr)).toBe(0);
  });

  it("an IDR payment still lands in the IDR cash account", async () => {
    const tx = createFakeClient({
      mappings: CURRENCY_CASH,
      invoicePayments: paymentIn("IDR", 5_000_000, null),
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "invoice_payment",
        sourceId: 12,
        tx,
      })) as unknown as FakeJournal
    );

    expect(debitOn(j, CASH.idr)).toBe(5_000_000);
  });

  it("refuses to post a currency with no cash mapping rather than using an IDR account", async () => {
    // The decision issue #40 asks for, asserted. There is no "any" cash row to
    // fall back to, because no real cash account holds an arbitrary currency —
    // so an unconfigured currency fails the way a missing rate does.
    const tx = createFakeClient({
      mappings: CURRENCY_CASH,
      invoicePayments: paymentIn("EUR", 8_000, 18_000),
    });

    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(MissingMappingError);
    await expect(
      postForSource({ sourceType: "invoice_payment", sourceId: 12, tx })
    ).rejects.toThrow(/Kas\/Bank \(default\).*mata uang EUR.*belum diatur/);
    expect(tx._journals).toHaveLength(0);
  });

  it("seeds a cash_default row per currency and deliberately no 'any' fallback", () => {
    const cash = DEFAULT_MAPPINGS.filter((m) => m.key === MAPPING_KEYS.CASH_DEFAULT);

    expect(cash.map((m) => [m.currency, m.code])).toEqual([
      ["IDR", "110103"],
      ["USD", "110104"],
      ["CNY", "110105"],
    ]);
    // The absent row is the fix: with one, an unmapped currency silently
    // resolves to whatever it points at, which was 110102 Kas Besar (IDR).
    expect(cash.some((m) => m.currency === undefined)).toBe(false);

    // The currency-agnostic slots keep theirs — those accounts really are
    // currency-neutral, so a fallback is honest there.
    for (const key of [MAPPING_KEYS.SALES_DEFAULT, MAPPING_KEYS.COGS, MAPPING_KEYS.FX_GAIN_LOSS]) {
      expect(DEFAULT_MAPPINGS.some((m) => m.key === key && m.currency === undefined)).toBe(true);
    }
  });

  it("physical cash slots are reached by account type and keep their 'any' row", () => {
    // `cash_kas_besar`/`cash_kas_kecil` come from an explicit CashAccount.type,
    // where the user has already named the account, so there is nothing to
    // resolve by currency and nothing to guess.
    for (const key of [MAPPING_KEYS.CASH_KAS_BESAR, MAPPING_KEYS.CASH_KAS_KECIL]) {
      expect(DEFAULT_MAPPINGS.some((m) => m.key === key && m.currency === undefined)).toBe(true);
    }
  });
});

// ─── Cross-currency on the payable side (issue #43) ──────

/**
 * The mirror of the receivable case. A supplier payment reaches its purchases
 * through `supplier_payment_allocations` (#37), so one payment can settle
 * several purchases — and, once currencies differ, several *different* Hutang
 * accounts. That is why a settlement leg carries its own `accountId`.
 *
 * Reads the allocation table exactly as #37 defined it; neither its semantics
 * nor its FKs change here (issue #42 is untouched).
 */
describe("cross-currency supplier payments", () => {
  const FX_ACC = 401;
  const AP_USD = 402;
  const CASH_IDR = 403;

  const MAPS: FakeMapping[] = [
    ...MAPPINGS.filter((m) => m.key !== MAPPING_KEYS.CASH_DEFAULT),
    { key: MAPPING_KEYS.CASH_DEFAULT, currency: "IDR", accountId: CASH_IDR, isActive: true },
    { key: MAPPING_KEYS.AP_DEFAULT, currency: "USD", accountId: AP_USD, isActive: true },
    { key: MAPPING_KEYS.FX_GAIN_LOSS, currency: ANY_CURRENCY, accountId: FX_ACC, isActive: true },
  ];

  const baseDebitOn = (j: FakeJournal, accountId: number) =>
    j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.baseDebit, 0);

  /** Rp 155.000.000 paid against a USD purchase booked at 15.000. */
  const payment = {
    34: {
      id: 34,
      date: DATE,
      type: "payment",
      amount: 155_000_000,
      taxAmount: 0,
      currency: "IDR",
      rate: null,
      supplier: { name: "Jiangsu Trading" },
      allocationsMade: [{ amount: 155_000_000, purchase: { currency: "USD", rate: 15_000 } }],
    },
  };

  it("relieves the USD payable, not the IDR one, and books the FX difference", async () => {
    const tx = createFakeClient({
      mappings: MAPS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      supplierTransactions: payment,
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 34,
        tx,
      })) as unknown as FakeJournal
    );

    // Rp 155.000.000 at 15.500 settles USD 10.000 of hutang …
    expect(debitOn(j, AP_USD)).toBe(10_000);
    // … relieved at the rate the purchase was booked at.
    expect(baseDebitOn(j, AP_USD)).toBe(150_000_000);
    // The generic Hutang account keeps out of it.
    expect(debitOn(j, ACC.ap)).toBe(0);
    expect(baseDebitOn(j, ACC.ap)).toBe(0);

    // Paying 155 juta to clear a 150 juta liability is a 5 juta loss.
    expect(baseDebitOn(j, FX_ACC)).toBe(5_000_000);
  });

  it("refuses without a settlement-date rate rather than relieving the IDR payable", async () => {
    const tx = createFakeClient({ mappings: MAPS, supplierTransactions: payment });
    await expect(
      postForSource({ sourceType: "supplier_transaction", sourceId: 34, tx })
    ).rejects.toThrow(MissingSettlementRateError);
    expect(tx._journals).toHaveLength(0);
  });

  it("refuses when the foreign purchase carries no rate of its own", async () => {
    const tx = createFakeClient({
      mappings: MAPS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      supplierTransactions: {
        34: {
          ...payment[34],
          allocationsMade: [{ amount: 155_000_000, purchase: { currency: "USD", rate: null } }],
        },
      },
    });
    await expect(
      postForSource({ sourceType: "supplier_transaction", sourceId: 34, tx })
    ).rejects.toThrow(PostingRuleError);
    expect(tx._journals).toHaveLength(0);
  });

  it("settles an IDR and a USD purchase in one entry, each in its own account", async () => {
    // The case that forced `accountId` onto the leg rather than onto the entry.
    const tx = createFakeClient({
      mappings: MAPS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      supplierTransactions: {
        34: {
          ...payment[34],
          amount: 175_000_000,
          allocationsMade: [
            { amount: 155_000_000, purchase: { currency: "USD", rate: 15_000 } },
            { amount: 20_000_000, purchase: { currency: "IDR", rate: null } },
          ],
        },
      },
    });
    const j = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 34,
        tx,
      })) as unknown as FakeJournal
    );

    expect(debitOn(j, AP_USD)).toBe(10_000);
    expect(baseDebitOn(j, AP_USD)).toBe(150_000_000);
    // The IDR slice stays in the IDR payable, at face value.
    expect(baseDebitOn(j, ACC.ap)).toBe(20_000_000);
    // Cash out is the full payment; the plug is the USD slice's rate gap only.
    expect(j.lines.filter((l) => l.accountId === CASH_IDR)[0].baseCredit).toBe(175_000_000);
    expect(baseDebitOn(j, FX_ACC)).toBe(5_000_000);
  });

  it("rejects allocations that do not add up, instead of hiding it in the FX plug", async () => {
    // Issue #23's guard, carried into the cross-currency case: the plug absorbs
    // a RATE gap, never an AMOUNT error. Without a shared unit this used to be
    // unenforceable; the settlement rate supplies one.
    const tx = createFakeClient({
      mappings: MAPS,
      exchangeRates: [{ currency: "USD", rateDate: DATE, rate: 15_500 }],
      supplierTransactions: {
        34: {
          ...payment[34],
          allocationsMade: [
            // Deliberately overstated: 200 juta allocated against a 155 juta payment.
            { amount: 200_000_000, purchase: { currency: "USD", rate: 15_000 } },
          ],
        },
      },
    });
    await expect(
      postForSource({ sourceType: "supplier_transaction", sourceId: 34, tx })
    ).rejects.toThrow(/bukan selisih kurs/);
    expect(tx._journals).toHaveLength(0);
  });
});

// ─── Allocation edits are ledger-affecting for foreign payments (issue #42) ──

/**
 * #23 made a foreign payment relieve each slice of hutang at the DOCUMENT rate of
 * the purchase it settles. The allocation is what names those purchases, so
 * editing it changes the correct journal — and the write site must repost. These
 * drive that repost through `repostForSource` directly (the route calls the same
 * function inside its transaction), and pin the two halves of the #42 rule: a
 * foreign edit re-derives a non-stale journal; an IDR edit changes nothing.
 */
describe("allocation edits repost a foreign supplier payment (issue #42)", () => {
  const FX_ACC = 401;
  const FX_MAPPINGS: FakeMapping[] = [
    ...MAPPINGS,
    { key: MAPPING_KEYS.FX_GAIN_LOSS, currency: ANY_CURRENCY, accountId: FX_ACC, isActive: true },
  ];

  const baseDebitOn = (j: FakeJournal, accountId: number) =>
    j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.baseDebit, 0);
  const baseCreditOn = (j: FakeJournal, accountId: number) =>
    j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.baseCredit, 0);

  /** The one journal still in force: posted, not reversed, not itself a reversal. */
  const liveJournals = (tx: { _journals: FakeJournal[] }) =>
    tx._journals.filter((j) => !j.isReversed && j.type !== "reversal");

  it("re-derives the journal from the NEW allocation set, never leaving it stale", async () => {
    // USD 10.000 paid at 16.000, first split across purchases booked at 15.000 and
    // 16.500 → hutang 156.000.000, FX loss 4.000.000 (the worked example above).
    const seed = {
      mappings: FX_MAPPINGS,
      supplierTransactions: {
        40: {
          id: 40,
          date: DATE,
          type: "payment",
          amount: 10_000,
          taxAmount: 0,
          currency: "USD",
          rate: 16_000,
          supplier: { name: "Jiangsu Trading" },
          allocationsMade: [
            { amount: 6_000, purchase: { currency: "USD", rate: 15_000 } },
            { amount: 4_000, purchase: { currency: "USD", rate: 16_500 } },
          ],
        },
      },
    };
    const tx = createFakeClient(seed);
    const first = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 40,
        tx,
      })) as unknown as FakeJournal
    );
    expect(baseDebitOn(first, ACC.ap)).toBe(156_000_000);
    expect(baseDebitOn(first, FX_ACC)).toBe(4_000_000);

    // The user re-allocates: the whole 10.000 now settles the 15.000 purchase.
    // The stored rows are what the engine reads, so mutate them exactly as the
    // route's deleteMany + createMany would leave them, then repost.
    (seed.supplierTransactions[40] as { allocationsMade: unknown[] }).allocationsMade = [
      { amount: 10_000, purchase: { currency: "USD", rate: 15_000 } },
    ];
    const reposted = expectBalancedIdr(
      (await repostForSource({
        sourceType: "supplier_transaction",
        sourceId: 40,
        tx,
      })) as unknown as FakeJournal
    );

    // Non-stale: hutang now relieved at 15.000 for the full 10.000 = 150.000.000,
    // FX loss 10.000.000 — NOT the 156 / 4 the first journal carried.
    expect(baseDebitOn(reposted, ACC.ap)).toBe(150_000_000);
    expect(baseCreditOn(reposted, ACC.cashDefault)).toBe(160_000_000);
    expect(baseDebitOn(reposted, FX_ACC)).toBe(10_000_000);

    // Original reversed, not mutated: original + reversal + fresh, one live.
    expect(tx._journals).toHaveLength(3);
    expect(first.isReversed).toBe(true);
    const live = liveJournals(tx);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(reposted.id);
    expect(baseDebitOn(live[0], ACC.ap)).toBe(150_000_000);
  });

  it("leaves an IDR payment's journal identical whatever the allocation says", async () => {
    // No rate, no selisih kurs: the allocation is reporting data, so two different
    // allocation sets of the same IDR payment post the SAME two-line journal.
    // This is why the route may — and does — skip the repost entirely for IDR.
    const make = (allocationsMade: unknown[]) =>
      createFakeClient({
        mappings: FX_MAPPINGS,
        supplierTransactions: {
          41: {
            id: 41,
            date: DATE,
            type: "payment",
            amount: 1_000_000,
            taxAmount: 0,
            currency: "IDR",
            rate: null,
            supplier: { name: "CV Sumber" },
            allocationsMade,
          },
        },
      });

    const a = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 41,
        tx: make([
          { amount: 600_000, purchase: { currency: "IDR", rate: null } },
          { amount: 400_000, purchase: { currency: "IDR", rate: null } },
        ]),
      })) as unknown as FakeJournal
    );
    const b = expectBalancedIdr(
      (await postForSource({
        sourceType: "supplier_transaction",
        sourceId: 41,
        tx: make([{ amount: 1_000_000, purchase: { currency: "IDR", rate: null } }]),
      })) as unknown as FakeJournal
    );

    for (const j of [a, b]) {
      expect(j.lines).toHaveLength(2); // D: Hutang / K: Kas — nothing else
      expect(j.lines.some((l) => l.accountId === FX_ACC)).toBe(false);
      expect(baseDebitOn(j, ACC.ap)).toBe(1_000_000);
      expect(baseCreditOn(j, ACC.cashDefault)).toBe(1_000_000);
    }
  });

  it("refuses loudly when a re-allocation needs a settlement rate nobody recorded", async () => {
    // The USD payment is moved onto a CNY purchase. Relieving CNY hutang needs
    // that day's CNY settlement rate; none is recorded, so the repost throws.
    // Inside the route's $transaction the whole edit — the allocation write too —
    // rolls back, so no stale or silent journal is ever left behind.
    const seed = {
      mappings: FX_MAPPINGS,
      supplierTransactions: {
        42: {
          id: 42,
          date: DATE,
          type: "payment",
          amount: 10_000,
          taxAmount: 0,
          currency: "USD",
          rate: 16_000,
          supplier: { name: "Jiangsu Trading" },
          allocationsMade: [{ amount: 6_000, purchase: { currency: "USD", rate: 15_000 } }],
        },
      },
    };
    const tx = createFakeClient(seed);
    await postForSource({ sourceType: "supplier_transaction", sourceId: 42, tx });

    (seed.supplierTransactions[42] as { allocationsMade: unknown[] }).allocationsMade = [
      { amount: 6_000, purchase: { currency: "CNY", rate: 2_200 } },
    ];
    await expect(
      repostForSource({ sourceType: "supplier_transaction", sourceId: 42, tx })
    ).rejects.toThrow(MissingSettlementRateError);
  });
});
