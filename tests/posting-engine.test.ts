/**
 * The posting engine end to end, against an in-memory fake client:
 * account mapping resolution, per-source-type journals, the IDR balance
 * invariant, and idempotency / repost / unpost.
 */
import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
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
          invoice: { invoiceNo: "SI.2026.03.00007" },
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
