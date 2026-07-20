/**
 * Account mapping per transaction type + the IDR balance invariant.
 *
 * These exercise the pure rule builders, so no database is involved. Each block
 * asserts BOTH sides of the mapping (which account is debited vs credited) and
 * that the resulting journal balances on IDR base amounts via the real
 * ledger.ts prepareLines/assertBalanced — the same check production posting uses.
 */
import { describe, expect, it } from "vitest";
import { assertBalanced, prepareLines, type JournalLineInput } from "@/lib/ledger";
import {
  PostingRuleError,
  buildCashTransactionLines,
  buildCogsLines,
  buildPurchaseLines,
  buildSalesInvoiceLines,
  buildSalesReceiptLines,
  buildSupplierPaymentLines,
  resolveRate,
} from "@/lib/posting/rules";

// Stand-in account ids; the real ones come from account_mappings at runtime.
const AR = 1;
const SALES = 2;
const VAT_OUT = 3;
const VAT_IN = 4;
const AP = 5;
const INVENTORY = 6;
const COGS = 7;
const CASH = 8;
const EXPENSE = 9;

/** Every journal must balance on IDR base — the engine's core invariant. */
function expectBalanced(lines: JournalLineInput[]) {
  const prepared = prepareLines(lines);
  expect(() => assertBalanced(prepared)).not.toThrow();
  return prepared;
}

const debitOn = (lines: JournalLineInput[], accountId: number) =>
  lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + (l.debit ?? 0), 0);
const creditOn = (lines: JournalLineInput[], accountId: number) =>
  lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + (l.credit ?? 0), 0);

describe("sales invoice → D: Piutang Usaha, K: Penjualan (+ K: Hutang PPN Keluaran)", () => {
  it("maps an untaxed invoice to AR and Sales only", () => {
    const lines = buildSalesInvoiceLines({
      arAccountId: AR,
      salesAccountId: SALES,
      subtotal: 1_000_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, AR)).toBe(1_000_000);
    expect(creditOn(lines, SALES)).toBe(1_000_000);
    expect(lines).toHaveLength(2);
    expectBalanced(lines);
  });

  it("adds output VAT as a credit and debits AR for the gross amount", () => {
    const lines = buildSalesInvoiceLines({
      arAccountId: AR,
      salesAccountId: SALES,
      vatOutAccountId: VAT_OUT,
      subtotal: 1_000_000,
      taxAmount: 110_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, AR)).toBe(1_110_000);
    expect(creditOn(lines, SALES)).toBe(1_000_000);
    expect(creditOn(lines, VAT_OUT)).toBe(110_000);
    expectBalanced(lines);
  });

  it("balances in IDR base for a foreign-currency invoice", () => {
    // CNY export, the scenario from the issue's Accurate reference.
    const lines = buildSalesInvoiceLines({
      arAccountId: AR,
      salesAccountId: SALES,
      subtotal: 50_000,
      currency: "CNY",
      rate: 2_250,
    });

    const prepared = expectBalanced(lines);
    // Original currency preserved, IDR base derived from the rate.
    expect(prepared[0].debit).toBe(50_000);
    expect(prepared[0].currency).toBe("CNY");
    expect(prepared[0].baseDebit).toBe(112_500_000);
    expect(prepared[1].baseCredit).toBe(112_500_000);
  });

  it("refuses a taxed invoice when vat_out is not mapped", () => {
    expect(() =>
      buildSalesInvoiceLines({
        arAccountId: AR,
        salesAccountId: SALES,
        subtotal: 1_000,
        taxAmount: 110,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      buildSalesInvoiceLines({
        arAccountId: AR,
        salesAccountId: SALES,
        subtotal: -1,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

describe("sales receipt → D: Kas/Bank, K: Piutang Usaha", () => {
  it("maps cash in against receivable", () => {
    const lines = buildSalesReceiptLines({
      cashAccountId: CASH,
      arAccountId: AR,
      amount: 500_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, CASH)).toBe(500_000);
    expect(creditOn(lines, AR)).toBe(500_000);
    expectBalanced(lines);
  });

  it("balances in IDR base for a USD receipt", () => {
    const lines = buildSalesReceiptLines({
      cashAccountId: CASH,
      arAccountId: AR,
      amount: 1_000,
      currency: "USD",
      rate: 16_000,
    });

    const prepared = expectBalanced(lines);
    expect(prepared[0].baseDebit).toBe(16_000_000);
    expect(prepared[1].baseCredit).toBe(16_000_000);
  });

  it("rejects a zero or negative receipt", () => {
    expect(() =>
      buildSalesReceiptLines({
        cashAccountId: CASH,
        arAccountId: AR,
        amount: 0,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

describe("purchase → D: Persediaan/Beban (+ D: PPN Masukan), K: Hutang Usaha", () => {
  it("maps goods to inventory against payable", () => {
    const lines = buildPurchaseLines({
      debitAccountId: INVENTORY,
      apAccountId: AP,
      subtotal: 2_000_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, INVENTORY)).toBe(2_000_000);
    expect(creditOn(lines, AP)).toBe(2_000_000);
    expectBalanced(lines);
  });

  it("adds input VAT as a debit and credits AP for the gross amount", () => {
    const lines = buildPurchaseLines({
      debitAccountId: INVENTORY,
      apAccountId: AP,
      vatInAccountId: VAT_IN,
      subtotal: 2_000_000,
      taxAmount: 220_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, INVENTORY)).toBe(2_000_000);
    expect(debitOn(lines, VAT_IN)).toBe(220_000);
    expect(creditOn(lines, AP)).toBe(2_220_000);
    expectBalanced(lines);
  });

  it("supports an expense account instead of inventory", () => {
    const lines = buildPurchaseLines({
      debitAccountId: EXPENSE,
      apAccountId: AP,
      subtotal: 750_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, EXPENSE)).toBe(750_000);
    expect(creditOn(lines, AP)).toBe(750_000);
    expectBalanced(lines);
  });

  it("refuses a taxed purchase when vat_in is not mapped", () => {
    expect(() =>
      buildPurchaseLines({
        debitAccountId: INVENTORY,
        apAccountId: AP,
        subtotal: 1_000,
        taxAmount: 110,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

describe("supplier payment → D: Hutang Usaha, K: Kas/Bank", () => {
  it("maps payable against cash out", () => {
    const lines = buildSupplierPaymentLines({
      apAccountId: AP,
      cashAccountId: CASH,
      amount: 1_200_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, AP)).toBe(1_200_000);
    expect(creditOn(lines, CASH)).toBe(1_200_000);
    expectBalanced(lines);
  });

  it("balances in IDR base for a USD payment", () => {
    const lines = buildSupplierPaymentLines({
      apAccountId: AP,
      cashAccountId: CASH,
      amount: 2_500,
      currency: "USD",
      rate: 16_200,
    });

    const prepared = expectBalanced(lines);
    expect(prepared[0].baseDebit).toBe(40_500_000);
  });
});

describe("cash transaction → cash account vs chosen counter-account", () => {
  it("debit (money in) debits cash and credits the counter-account", () => {
    const lines = buildCashTransactionLines({
      cashAccountId: CASH,
      counterAccountId: SALES,
      debit: 300_000,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, CASH)).toBe(300_000);
    expect(creditOn(lines, SALES)).toBe(300_000);
    expectBalanced(lines);
  });

  it("credit (money out) debits the counter-account and credits cash", () => {
    const lines = buildCashTransactionLines({
      cashAccountId: CASH,
      counterAccountId: EXPENSE,
      credit: 175_500,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, EXPENSE)).toBe(175_500);
    expect(creditOn(lines, CASH)).toBe(175_500);
    expectBalanced(lines);
  });

  it("rejects a row with both debit and credit", () => {
    expect(() =>
      buildCashTransactionLines({
        cashAccountId: CASH,
        counterAccountId: EXPENSE,
        debit: 100,
        credit: 100,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });

  it("rejects an empty transaction", () => {
    expect(() =>
      buildCashTransactionLines({
        cashAccountId: CASH,
        counterAccountId: EXPENSE,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });

  it("rejects a counter-account equal to the cash account", () => {
    expect(() =>
      buildCashTransactionLines({
        cashAccountId: CASH,
        counterAccountId: CASH,
        debit: 100,
        currency: "IDR",
        rate: 1,
      })
    ).toThrow(PostingRuleError);
  });
});

describe("stock movement out → D: HPP, K: Persediaan", () => {
  it("maps COGS against inventory in IDR", () => {
    const lines = buildCogsLines({
      cogsAccountId: COGS,
      inventoryAccountId: INVENTORY,
      cost: 875_000,
    });

    expect(debitOn(lines, COGS)).toBe(875_000);
    expect(creditOn(lines, INVENTORY)).toBe(875_000);
    expect(lines.every((l) => l.currency === "IDR" && l.rate === 1)).toBe(true);
    expectBalanced(lines);
  });

  it("rejects a zero cost rather than posting an empty journal", () => {
    expect(() =>
      buildCogsLines({ cogsAccountId: COGS, inventoryAccountId: INVENTORY, cost: 0 })
    ).toThrow(PostingRuleError);
  });
});

describe("resolveRate — never silently assumes 1 for foreign currency", () => {
  it("always uses 1 for IDR", () => {
    expect(resolveRate("IDR", null, null)).toBe(1);
    expect(resolveRate("IDR", 999, 888)).toBe(1);
  });

  it("prefers the rate stored on the record", () => {
    expect(resolveRate("USD", 16_000, 15_000)).toBe(16_000);
  });

  it("falls back to an explicitly supplied rate", () => {
    expect(resolveRate("USD", null, 15_500)).toBe(15_500);
    expect(resolveRate("USD", 0, 15_500)).toBe(15_500);
  });

  it("throws when a foreign currency has no rate anywhere", () => {
    expect(() => resolveRate("USD", null, null)).toThrow(PostingRuleError);
    expect(() => resolveRate("CNY", null, undefined)).toThrow(/Kurs untuk mata uang CNY/);
  });
});

describe("rounding", () => {
  it("keeps a taxed invoice balanced when tax has fractional cents", () => {
    const lines = buildSalesInvoiceLines({
      arAccountId: AR,
      salesAccountId: SALES,
      vatOutAccountId: VAT_OUT,
      subtotal: 333.33,
      taxAmount: 36.666,
      currency: "IDR",
      rate: 1,
    });

    expect(debitOn(lines, AR)).toBe(370);
    expectBalanced(lines);
  });
});
